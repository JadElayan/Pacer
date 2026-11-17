/** ECDSA P-256 signatures for messages the teacher broadcasts to a live room. No network access here. */
export interface SignedFields { type: string; code: string; to?: string; body: string }

const KEY = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGNATURE = { name: "ECDSA", hash: "SHA-256" } as const;
const encoder = new TextEncoder();

// The room code, message type and recipient are signed with the body, so a signed message can't be replayed into
// another room or turned into a different kind of message.
const signedBytes = ({ type, code, to, body }: SignedFields) => encoder.encode(`pacer-room-v1\n${type}\n${code}\n${to ?? ""}\n${body}`);
const toBase64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export async function createRoomKeys(): Promise<{ publicJwk: JsonWebKey; privateJwk: JsonWebKey }> {
  const pair = await crypto.subtle.generateKey(KEY, true, ["sign", "verify"]);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { publicJwk: { kty, crv, x, y }, privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) };
}

export const importSigner = (jwk: JsonWebKey) => crypto.subtle.importKey("jwk", jwk, KEY, false, ["sign"]);
export const importVerifier = (jwk: JsonWebKey) => crypto.subtle.importKey("jwk", jwk, KEY, false, ["verify"]);

export async function signRoomMessage(key: CryptoKey, fields: SignedFields): Promise<string> {
  return toBase64(await crypto.subtle.sign(SIGNATURE, key, signedBytes(fields)));
}

export async function verifyRoomMessage(key: CryptoKey, fields: SignedFields, signature: string | undefined): Promise<boolean> {
  if (!signature) return false;
  try { return await crypto.subtle.verify(SIGNATURE, key, fromBase64(signature), signedBytes(fields)); }
  catch { return false; }
}
