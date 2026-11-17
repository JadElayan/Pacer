import { getSupabase } from "./supabase";

export interface Msg { type: "hello" | "state" | "hb" | "event" | "answer" | "grade"; from: string; to?: string; payload?: unknown; body?: string; sig?: string }
export interface Transport { kind: "supabase" | "local"; send(m: Msg): void; on(cb: (m: Msg) => void): void; close(): void }

export function createTransport(code: string): Transport {
  const sb = getSupabase();
  if (sb) {
    const ch = sb.channel(`pacer:${code}`, { config: { broadcast: { self: false } } });
    let ready = false; const queue: Msg[] = []; let cb: (m: Msg) => void = () => {};
    ch.on("broadcast", { event: "m" }, ({ payload }) => cb(payload as Msg));
    ch.subscribe((s) => { if (s === "SUBSCRIBED") { ready = true; queue.splice(0).forEach((m) => ch.send({ type: "broadcast", event: "m", payload: m })); } });
    return {
      kind: "supabase",
      send: (m) => (ready ? ch.send({ type: "broadcast", event: "m", payload: m }) : queue.push(m)),
      on: (f) => { cb = f; },
      close: () => { sb.removeChannel(ch); },
    };
  }
  const bc = new BroadcastChannel(`pacer:${code}`);
  return { kind: "local", send: (m) => bc.postMessage(m), on: (f) => { bc.onmessage = (e) => f(e.data as Msg); }, close: () => bc.close() };
}
