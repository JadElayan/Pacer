import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { demoAnswer } from "@/lib/demo";
import { buildJson, buildSummarize, buildUser, JSON_KINDS, SYSTEM } from "@/lib/prompt";
import { checkAiLimits, clientId } from "@/lib/rateLimit";
import { isRoomAiPaused } from "@/lib/aiPause";
import { cached, cacheKey, logUsage, modelFor, once, overBudget, remember, requestSettings, spend, strike, units } from "@/lib/aiBudget";
import type { AIKind, AIRequest, AIResponse, Mode } from "@/lib/types";

const KINDS: AIKind[] = ["explain", "why", "simplify", "example", "snip", "followup", "another", "summarize", "catchup", "deeper", "clarify", "graph", "visual", "quiz", "recap", "checkins"];
const MODES: Mode[] = ["standard", "focus", "guided", "example"];
const MAX_BODY = 1_200_000;
const MAX_IMAGE = 800_000;

const clip = (a: string[] | undefined, n: number) => (a ?? []).slice(0, n).map((s) => String(s).replace(/\s+/g, " ").trim().slice(0, 600)).filter(Boolean);
const refuse = (error: string, status: number, headers?: Record<string, string>) =>
  NextResponse.json({ text: "", source: "demo", error } satisfies AIResponse, { status, headers });

export async function POST(req: Request) {
  const started = Date.now();
  let b: AIRequest;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return refuse("Request too large", 413);
  try { b = (await req.json()) as AIRequest; } catch { return refuse("Bad request", 400); }
  if (!b || !KINDS.includes(b.kind) || !MODES.includes(b.mode) || !Array.isArray(b.selected) || !Array.isArray(b.context)) return refuse("Bad request", 400);
  if (typeof b.image === "string" && b.image.length > MAX_IMAGE) return refuse("That picture is too large. Try a smaller box.", 413);
  // A live room whose teacher paused AI help gets no answers, however the request was made.
  if (typeof b.room === "string" && /^\d{6}$/.test(b.room) && await isRoomAiPaused(b.room)) return refuse("Your teacher has paused AI help for now.", 423);

  const client = clientId(req);
  const room = typeof b.room === "string" && /^\d{6}$/.test(b.room) ? b.room : undefined;
  b = { ...b, image: typeof b.image === "string" ? b.image : undefined, selected: clip(b.selected, 12), context: clip(b.context, 40), question: b.question?.slice(0, 500), topicTitle: b.topicTitle?.slice(0, 200), stats: b.stats?.slice(0, 400), history: (b.history ?? []).filter((h) => typeof h.text === "string" && h.text.trim()).slice(-6).map((h) => ({ role: h.role, text: h.text.slice(0, 2000) })) };
  while (b.history?.length && b.history[0].role !== "user") b.history = b.history.slice(1);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Demo answers cost nothing, but the request limits still apply so the route can't be flooded.
    const limited = await checkAiLimits(req);
    if (limited) return refuse(limited, 429, { "retry-after": "60" });
    return NextResponse.json(demoAnswer(b));
  }

  const model = modelFor(b.kind);
  const prompt = b.kind === "summarize" ? buildSummarize(b) : JSON_KINDS.includes(b.kind) ? buildJson(b) : buildUser(b);
  const imageHash = b.image ? createHash("sha256").update(b.image).digest("hex") : "";
  const ck = cacheKey(b.kind, [model, b.mode, b.detail ?? "", prompt, imageHash, b.history]);

  // The same question about the same content is answered once and shared (no cost, no limits used).
  const hit = cached(ck);
  if (hit) { logUsage({ kind: b.kind, client, room, model, units: 0, ms: Date.now() - started, from: "cache" }); return NextResponse.json(hit); }

  const limited = await checkAiLimits(req);
  if (limited) {
    if (limited.startsWith("You're asking very quickly")) await strike(client, "per-minute limit");
    return refuse(limited, 429, { "retry-after": "60" });
  }
  const over = await overBudget(client, b.kind, room);
  if (over) { console.warn(JSON.stringify({ ai: "budget", kind: b.kind, client: client.slice(0, 8), message: over })); return refuse(over, 429, { "retry-after": "3600" }); }

  let shared = true;
  try {
    const result = await once(ck, async () => {
      shared = false;
      const img = b.image ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(b.image) : null;
      const messages = [...(b.history ?? []).map((h) => ({ role: h.role, content: h.text })), { role: "user" as const, content: img ? [{ type: "image", source: { type: "base64", media_type: img[1], data: img[2] } }, { type: "text", text: prompt }] : prompt }];
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, system: SYSTEM, messages, ...requestSettings(b.kind, model, b.detail === "long") }),
      });
      if (!r.ok) throw new Error(`AI provider returned ${r.status}`);
      // The reply can start with a "thinking" block; the answer is in the text block(s).
      const j = (await r.json()) as { content?: { type?: string; text?: string }[]; usage?: Parameters<typeof units>[0] };
      const used = units(j.usage ?? {});
      await spend(client, used, room);
      logUsage({ kind: b.kind, client, room, model, units: used, input: j.usage?.input_tokens, output: j.usage?.output_tokens, ms: Date.now() - started, from: "ai" });
      const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
      if (!text) throw new Error("The AI didn't return an answer. Please try again");
      let value: AIResponse | null = null;
      if (b.kind === "summarize") {
        try { const o = JSON.parse(text.replace(/^```json|```$/g, "").trim()); if (typeof o.title === "string" && o.title.trim() && typeof o.summary === "string") value = { text: "", title: o.title, summary: o.summary, newTopic: o.newTopic === true, source: "ai" }; }
        catch { /* fall back below */ }
      } else if (JSON_KINDS.includes(b.kind)) {
        try { value = { text: "", data: JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim()), source: "ai" }; }
        catch { /* fall back below */ }
      } else value = { text, source: "ai" };
      if (value) remember(ck, value);
      return value;
    });
    if (shared) logUsage({ kind: b.kind, client, room, model, units: 0, ms: Date.now() - started, from: "shared" });
    return NextResponse.json(result ?? demoAnswer(b));
  } catch (e) {
    return NextResponse.json({ text: "", source: "ai", error: e instanceof Error ? e.message : "AI request failed" } satisfies AIResponse, { status: 502 });
  }
}
