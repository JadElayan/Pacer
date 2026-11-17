"use client";
import { createTransport, type Msg } from "./transport";

export type LessonStatus = "checking" | "live" | "ended";

/** A lesson saved more than this long ago can't still be live. */
export const LIVE_WINDOW_MS = 12 * 60 * 60 * 1000;

const endedIn = (m: Msg): boolean | undefined => {
  try {
    const state = (typeof m.body === "string" ? JSON.parse(m.body) : m.payload) as { ended?: unknown } | undefined;
    return state && typeof state === "object" ? state.ended === true : undefined;
  } catch { return undefined; }
};

/**
 * Asks a meeting whether it is still running, the same way a joining student does: say hello and wait for
 * the teacher's board. No reply within the timeout means no teacher is hosting it any more.
 * Only reads the "ended" flag, for display; joining the room still verifies everything as usual.
 */
export function probeLesson(code: string, timeoutMs = 4500): Promise<"live" | "ended"> {
  return new Promise((resolve) => {
    const transport = createTransport(code);
    const id = `probe-${Math.random().toString(36).slice(2)}`;
    let done = false;
    const finish = (status: "live" | "ended") => {
      if (done) return;
      done = true;
      clearInterval(again); clearTimeout(timer);
      transport.close();
      resolve(status);
    };
    transport.on((m) => {
      if (m.type !== "state" || m.from === id) return;
      finish(endedIn(m) ? "ended" : "live");
    });
    const hello = () => transport.send({ type: "hello", from: id, payload: { probe: true } });
    hello();
    const again = setInterval(hello, 1500);
    const timer = setTimeout(() => finish("ended"), timeoutMs);
  });
}
