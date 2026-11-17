"use client";
import { createTransport, type Msg } from "./transport";
import { lookupRoomKey } from "./roomKey";
import { verifyRoomMessage } from "./roomSignature";
import type { RoomState } from "./types";

export type LessonStatus = "checking" | "live" | "ended";
export type LessonProbe = { status: "live" | "ended"; room?: RoomState };

/** A lesson saved more than this long ago can't still be live. */
export const LIVE_WINDOW_MS = 12 * 60 * 60 * 1000;

/** The teacher's board from a "state" message, or nothing if it can't be trusted (unsigned in a locked room). */
async function boardFrom(code: string, m: Msg): Promise<RoomState | undefined> {
  try {
    const key = await lookupRoomKey(code);
    if (key.locked && (typeof m.body !== "string" || !(await verifyRoomMessage(key.key, { type: m.type, code, to: m.to, body: m.body }, m.sig)))) return undefined;
    const state = (typeof m.body === "string" ? JSON.parse(m.body) : m.payload) as RoomState | undefined;
    return state && typeof state === "object" && state.code === code ? state : undefined;
  } catch { return undefined; }
}

/**
 * Asks a meeting whether it is still running, the same way a joining student does: say hello and wait for
 * the teacher's board. No reply within the timeout means no teacher is hosting it any more.
 * The hello is marked as a probe so the teacher doesn't count it as a connected student.
 */
export function probeLesson(code: string, timeoutMs = 4500): Promise<LessonProbe> {
  return new Promise((resolve) => {
    const transport = createTransport(code);
    const id = `probe-${Math.random().toString(36).slice(2)}`;
    let done = false;
    const finish = (result: LessonProbe) => {
      if (done) return;
      done = true;
      clearInterval(again); clearTimeout(timer);
      transport.close();
      resolve(result);
    };
    transport.on((m) => {
      if (m.type !== "state" || m.from === id || done) return;
      void boardFrom(code, m).then((room) => { if (room) finish({ status: room.ended ? "ended" : "live", room }); });
    });
    const hello = () => transport.send({ type: "hello", from: id, payload: { probe: true } });
    hello();
    const again = setInterval(hello, 1500);
    const timer = setTimeout(() => finish({ status: "ended" }), timeoutMs);
  });
}
