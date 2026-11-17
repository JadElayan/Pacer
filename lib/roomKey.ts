import { getSupabase } from "./supabase";
import { createRoomKeys, importSigner, importVerifier } from "./roomSignature";

/**
 * Room lock: the browser that creates a meeting registers the meeting's public key in Supabase and keeps the
 * private key. Students accept board updates and grades only when they carry a valid signature from that key.
 * Rooms stay open (unsigned) when Supabase isn't configured or the room_keys migration hasn't been applied.
 */
export type RegisterResult = "locked" | "taken" | "unavailable";
export type RoomKeyLookup = { locked: true; key: CryptoKey } | { locked: false };

const signerKey = (code: string) => `pacer:signing:${code}`;
const missingMigration = (error: { code?: string } | null | undefined) =>
  !!error && ["PGRST202", "PGRST205", "42883", "42P01"].includes(error.code ?? "");

export async function registerRoomKey(code: string): Promise<RegisterResult> {
  const sb = getSupabase();
  if (!sb) return "unavailable";
  try {
    const { publicJwk, privateJwk } = await createRoomKeys();
    const { data, error } = await sb.rpc("pacer_register_room_key", { room_code: code, room_key: publicJwk });
    if (error) return "unavailable";
    if (data !== true) return "taken";
    localStorage.setItem(signerKey(code), JSON.stringify(privateJwk));
    return "locked";
  } catch { return "unavailable"; }
}

/** The teacher's signing key for this room, registering one for rooms created before the lock existed. */
export async function teacherSigner(code: string): Promise<{ key: CryptoKey | null; status: "locked" | "open" | "conflict" }> {
  try {
    const saved = localStorage.getItem(signerKey(code));
    if (saved) return { key: await importSigner(JSON.parse(saved)), status: "locked" };
  } catch { /* fall through and register a fresh key */ }
  const result = await registerRoomKey(code);
  if (result === "taken") return { key: null, status: "conflict" };
  if (result === "unavailable") return { key: null, status: "open" };
  return teacherSigner(code);
}

/** The key students verify against. Retries until Supabase answers, so a network blip never opens a locked room. */
export async function lookupRoomKey(code: string): Promise<RoomKeyLookup> {
  const sb = getSupabase();
  if (!sb) return { locked: false };
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await sb.from("pacer_room_keys").select("public_key").eq("code", code).maybeSingle();
    if (missingMigration(error)) return { locked: false };
    if (!error) {
      if (!data?.public_key) return { locked: false };
      try { return { locked: true, key: await importVerifier(data.public_key as JsonWebKey) }; }
      catch { return { locked: true, key: await rejectAll() }; }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(10000, 1000 * 2 ** attempt)));
  }
}

// A stored key that can't be imported must not unlock the room: verify against a throwaway key instead.
async function rejectAll() {
  const { publicJwk } = await createRoomKeys();
  return importVerifier(publicJwk);
}
