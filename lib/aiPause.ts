import { importVerifier, signRoomMessage, verifyRoomMessage } from "./roomSignature";
import { teacherSigner } from "./roomKey";
import { getSupabase } from "./supabase";

/**
 * Teacher-controlled pause on student AI for one room.
 *
 * The teacher's browser signs { paused, ts } with the room key (the same key that signs board updates) and appends
 * it to pacer_room_ai_signals. Anyone may add rows but nobody can edit or delete them, so the server trusts only
 * rows whose signature verifies against the room's registered public key, and takes the newest signed ts.
 * A forged row fails the check; a replayed old row loses to the newer one.
 */
export type AiSignal = { paused: boolean; ts: number };
const TYPE = "ai-state";

/** Teacher side: publish the current pause state. Quietly does nothing without Supabase or the migration. */
export async function publishAiState(code: string, paused: boolean) {
  const sb = getSupabase();
  if (!sb) return;
  const { key } = await teacherSigner(code);
  if (!key) return;
  const body = JSON.stringify({ paused, ts: Date.now() } satisfies AiSignal);
  const sig = await signRoomMessage(key, { type: TYPE, code, body });
  await sb.from("pacer_room_ai_signals").insert({ code, body, sig });
}

const cache = new Map<string, { at: number; paused: boolean }>();

/** Server side: is student AI paused in this room? Fails open (false) when the room has no key or no signals. */
export async function isRoomAiPaused(code: string): Promise<boolean> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < 4000) return hit.paused;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  const get = async (path: string) => {
    const response = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` }, cache: "no-store" });
    return response.ok ? response.json() as Promise<unknown[]> : [];
  };
  try {
    const [keys, signals] = await Promise.all([
      get(`pacer_room_keys?code=eq.${code}&select=public_key`),
      get(`pacer_room_ai_signals?code=eq.${code}&select=body,sig&order=id.desc&limit=30`),
    ]);
    const jwk = (keys[0] as { public_key?: JsonWebKey } | undefined)?.public_key;
    let paused = false;
    if (jwk && signals.length) {
      const key = await importVerifier(jwk);
      let newest = -1;
      for (const row of signals as { body: string; sig: string }[]) {
        if (!(await verifyRoomMessage(key, { type: TYPE, code, body: row.body }, row.sig))) continue;
        try {
          const signal = JSON.parse(row.body) as AiSignal;
          if (typeof signal.ts === "number" && signal.ts > newest) { newest = signal.ts; paused = signal.paused === true; }
        } catch { /* ignore a malformed row */ }
      }
    }
    cache.set(code, { at: Date.now(), paused });
    return paused;
  } catch { return false; }
}
