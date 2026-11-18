import { createHash } from "node:crypto";
import type { AIKind, AIResponse } from "./types";

/**
 * Keeps AI spending in check (server only).
 *
 * 1. Per-task request settings: low effort for short tutoring answers, no thinking for titles and small JSON,
 *    medium effort only for the once-per-class jobs (post-class package, check-in plan), and tight output caps.
 * 2. A shared answer cache: the same question about the same note costs one call however many students ask.
 *    Requests already in flight are joined instead of sent twice.
 * 3. Token budgets per device, per room and for the whole site, counted in "units" (input tokens + output tokens
 *    weighted by price), plus a penalty box for devices that keep hitting the per-minute limit, and per-task daily
 *    caps for the teacher-only jobs. Every call is logged with its token use so heavy users are easy to spot.
 *
 * Counters use Supabase when `supabase/ai_token_budget.sql` is installed (shared across server instances) and fall
 * back to this instance's memory otherwise, so limits never switch off completely.
 */

// ---------- 1. Request settings ----------

type Setting = { maxTokens: number; effort: "low" | "medium"; thinking: boolean };
const LIGHT: Setting = { maxTokens: 320, effort: "low", thinking: false };
const SETTINGS: Partial<Record<AIKind, Setting>> = {
  summarize: LIGHT,
  quiz: { maxTokens: 500, effort: "low", thinking: false },
  clarify: { maxTokens: 400, effort: "low", thinking: false },
  graph: { maxTokens: 900, effort: "low", thinking: false },
  visual: { maxTokens: 900, effort: "low", thinking: false },
  recap: { maxTokens: 2200, effort: "medium", thinking: true },
  checkins: { maxTokens: 2200, effort: "medium", thinking: true },
};
/** Short tutoring answers: a little thinking at low effort is enough and much cheaper than the default. */
const ANSWER: Setting = { maxTokens: 800, effort: "low", thinking: true };

/** Kinds that run on the optional cheaper model (ANTHROPIC_LIGHT_MODEL), when one is configured. */
const LIGHT_KINDS: AIKind[] = ["summarize", "quiz", "clarify"];

export function modelFor(kind: AIKind) {
  const main = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  return (LIGHT_KINDS.includes(kind) && process.env.ANTHROPIC_LIGHT_MODEL) || main;
}

/** The Messages API fields that control cost for this task on this model. */
export function requestSettings(kind: AIKind, model: string, long: boolean) {
  const s = SETTINGS[kind] ?? ANSWER;
  const body: Record<string, unknown> = { max_tokens: long && s === ANSWER ? 1300 : s.maxTokens };
  if (/^claude-(opus-(5|4-[5-8])|sonnet-(5|4-6)|haiku-5|fable|mythos)/.test(model)) body.output_config = { effort: s.effort };
  if (!s.thinking) {
    // Turning thinking off is spelled differently per model; models that can't turn it off just use low effort.
    if (/^claude-sonnet-5-5/.test(model)) body.thinking = { type: "between_tools" };
    else if (/^claude-(haiku-5-5|opus-5(?!-5)|sonnet-5(?!-5)|opus-4-[78])/.test(model)) body.thinking = { type: "disabled" };
  }
  return body;
}

// ---------- 2. Shared answer cache ----------

const CACHE_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: AIResponse }>();
const pending = new Map<string, Promise<AIResponse | null>>();
/** "another" asks for a different explanation on purpose, so it is never served from the cache. */
const UNCACHED: AIKind[] = ["another"];

export const cacheKey = (kind: AIKind, parts: unknown[]) =>
  UNCACHED.includes(kind) ? null : createHash("sha256").update(JSON.stringify([kind, ...parts])).digest("hex");

export function cached(key: string | null): AIResponse | undefined {
  if (!key) return;
  const hit = cache.get(key);
  if (!hit) return;
  if (Date.now() - hit.at > CACHE_MS) { cache.delete(key); return; }
  cache.delete(key); cache.set(key, hit); // keep recently used answers
  return hit.value;
}
export function remember(key: string | null, value: AIResponse) {
  if (!key || value.source !== "ai" || value.error) return;
  cache.set(key, { at: Date.now(), value });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}
/** Runs `work` once for identical requests arriving at the same time. */
export async function once(key: string | null, work: () => Promise<AIResponse | null>) {
  if (!key) return work();
  const running = pending.get(key);
  if (running) return running;
  const job = work().finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

// ---------- 3. Budgets, penalties and logging ----------

/** Input-token equivalents: output tokens cost about 5x input on current Claude models; cache reads about 0.1x. */
export const units = (u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }) =>
  Math.ceil((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1 + (u.output_tokens ?? 0) * 5);

const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const limits = () => ({
  device: num(process.env.AI_UNITS_PER_DEVICE_DAY, 600_000),
  room: num(process.env.AI_UNITS_PER_ROOM_DAY, 4_000_000),
  global: num(process.env.AI_UNITS_GLOBAL_DAY, 40_000_000),
});
/** Teacher-only jobs that should only happen a few times a day per device. */
const KIND_DAILY: Partial<Record<AIKind, number>> = { recap: 15, checkins: 25, summarize: 800, clarify: 60 };

// Counter keys carry a server-only salt, so nobody calling the public counter function can guess (and inflate) them.
const salt = () => createHash("sha256").update(`pacer-ai:${process.env.ANTHROPIC_API_KEY ?? "demo"}`).digest("hex").slice(0, 12);
const key = (name: string) => `ai:${salt()}:${name}`.slice(0, 80);
const day = () => new Date().toISOString().slice(0, 10);

const memory = new Map<string, { n: number; reset: number }>();
function memoryAdd(k: string, windowSec: number, amount: number) {
  const now = Date.now();
  let cur = memory.get(k);
  if (!cur || cur.reset < now) { cur = { n: 0, reset: now + windowSec * 1000 }; memory.set(k, cur); if (memory.size > 20_000) memory.clear(); }
  cur.n += amount;
  return cur.n;
}
async function remoteAdd(k: string, windowSec: number, amount: number): Promise<number | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/ai_budget_add`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: anon, authorization: `Bearer ${anon}` },
      body: JSON.stringify({ p_key: k, p_window_seconds: windowSec, p_amount: amount }),
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return null;
    const v = await r.json();
    return typeof v === "number" ? v : null;
  } catch { return null; }
}
/** Adds `amount` to a counter and returns its new total (amount 0 just reads it). */
async function add(name: string, windowSec: number, amount: number) {
  const k = key(name);
  const local = memoryAdd(k, windowSec, amount);
  return (await remoteAdd(k, windowSec, amount)) ?? local;
}

const roomName = (room?: string) => room && /^\d{6}$/.test(room) ? createHash("sha256").update(`room:${room}`).digest("hex").slice(0, 12) : undefined;

/** Returns a message when this request must be refused, or null. Call before contacting the AI provider. */
export async function overBudget(client: string, kind: AIKind, room?: string): Promise<string | null> {
  const l = limits(), d = day(), r = roomName(room);
  if ((await add(`pen:${client}`, 1800, 0)) >= 3) return "Too many AI requests from this device. AI help is paused here for 30 minutes.";
  if ((await add(`u:${client}:${d}`, 86400, 0)) >= l.device) return "This device has used today's AI allowance. Please try again tomorrow.";
  if (r && (await add(`r:${r}:${d}`, 86400, 0)) >= l.room) return "This class has used today's AI allowance. Your teacher's board and notes still work.";
  if ((await add(`g:${d}`, 86400, 0)) >= l.global) return "Pacer's AI is at capacity for today. Please try again tomorrow.";
  const cap = KIND_DAILY[kind];
  if (cap && (await add(`k:${kind}:${client}:${d}`, 86400, 1)) > cap) return "That AI feature has been used a lot today on this device. Please try again tomorrow.";
  return null;
}

/** Records the tokens a call used against every budget it counts toward. */
export async function spend(client: string, amount: number, room?: string) {
  const d = day(), r = roomName(room);
  await Promise.all([add(`u:${client}:${d}`, 86400, amount), add(`g:${d}`, 86400, amount), r ? add(`r:${r}:${d}`, 86400, amount) : null]);
}

/** A device that keeps tripping the per-minute limit goes in the penalty box (3 strikes in 30 minutes). */
export async function strike(client: string, reason: string) {
  const n = await add(`pen:${client}`, 1800, 1);
  console.warn(JSON.stringify({ ai: "abuse", reason, client: client.slice(0, 8), strikes: n }));
}

export function logUsage(entry: { kind: AIKind; client: string; room?: string; model: string; units: number; input?: number; output?: number; ms: number; from: "ai" | "cache" | "shared" }) {
  console.info(JSON.stringify({ ai: "usage", ...entry, client: entry.client.slice(0, 8), room: roomName(entry.room) }));
}
