"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createTransport, type Transport } from "./transport";
import { FeedbackEvent, RoomState, uid } from "./types";

const ls = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};

export function newRoom(code: string, title: string): RoomState {
  return { code, title, blocks: [], topics: [], strokes: [], currentTopicId: null, ended: false, rev: 0 };
}
export function createMeeting(title: string): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  ls.set(`pacer:room:${code}`, newRoom(code, title || "Untitled lecture"));
  ls.set(`pacer:token:${code}`, uid() + uid());
  return code;
}

export type Status = "connecting" | "live" | "notfound" | "waiting";

export function useRoom(code: string, wantTeacher: boolean) {
  const [state, setState] = useState<RoomState | null>(null);
  const [events, setEvents] = useState<FeedbackEvent[]>([]);
  const [peers, setPeers] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Status>("connecting");
  const [isTeacher, setIsTeacher] = useState(false);
  const [transportKind, setTransportKind] = useState<"supabase" | "local">("local");
  const [now, setNow] = useState(0);
  const sid = useRef("");
  const tr = useRef<Transport | null>(null);
  const stateRef = useRef<RoomState | null>(null);
  const eventsRef = useRef<FeedbackEvent[]>([]);

  useEffect(() => {
    // Per-tab id so two tabs of one browser (teacher + student demo) don't ignore each other.
    try { sid.current = sessionStorage.getItem("pacer:sid") ?? uid(); sessionStorage.setItem("pacer:sid", sid.current); } catch { sid.current = uid(); }
    const teacher = wantTeacher && !!ls.get<string>(`pacer:token:${code}`);
    setIsTeacher(teacher);
    const initial = teacher ? ls.get<RoomState>(`pacer:room:${code}`) : ls.get<RoomState>(`pacer:cache:${code}`);
    if (initial) { stateRef.current = initial; setState(initial); }
    if (teacher) { const ev = ls.get<FeedbackEvent[]>(`pacer:events:${code}`) ?? []; eventsRef.current = ev; setEvents(ev); setStatus("live"); }
    const t = createTransport(code);
    tr.current = t; setTransportKind(t.kind);
    let live = teacher;
    t.on((m) => {
      if (m.from === sid.current) return;
      if (teacher) {
        if (m.type === "hello" && stateRef.current) t.send({ type: "state", from: sid.current, payload: stateRef.current });
        if (m.type === "hb" || m.type === "hello") setPeers((p) => ({ ...p, [m.from]: Date.now() }));
        if (m.type === "event") {
          const e = m.payload as FeedbackEvent;
          if (!eventsRef.current.some((x) => x.id === e.id)) {
            eventsRef.current = [...eventsRef.current, e]; setEvents(eventsRef.current); ls.set(`pacer:events:${code}`, eventsRef.current);
          }
        }
      } else if (m.type === "state") {
        const s = m.payload as RoomState; live = true; stateRef.current = s; setState(s); setStatus("live"); ls.set(`pacer:cache:${code}`, s);
      }
    });
    const timers: ReturnType<typeof setInterval>[] = [];
    if (!teacher) {
      const hello = () => t.send({ type: "hello", from: sid.current });
      hello();
      timers.push(setInterval(() => { if (!live) hello(); }, 2000));
      timers.push(setInterval(() => t.send({ type: "hb", from: sid.current }), 5000));
      const to = setTimeout(() => { if (!live) setStatus(initial ? "waiting" : "notfound"); }, 8000);
      timers.push(to as unknown as ReturnType<typeof setInterval>);
    }
    timers.push(setInterval(() => setNow(Date.now()), 3000));
    return () => { timers.forEach(clearInterval); t.close(); };
  }, [code, wantTeacher]);

  const mutate = useCallback((fn: (s: RoomState) => RoomState) => {
    const cur = stateRef.current; if (!cur) return;
    const next = { ...fn(cur), rev: cur.rev + 1 };
    stateRef.current = next; setState(next); ls.set(`pacer:room:${code}`, next);
    tr.current?.send({ type: "state", from: sid.current, payload: next });
  }, [code]);

  const sendEvent = useCallback((kind: FeedbackEvent["kind"], blockId: string | null, topicId: string | null) => {
    tr.current?.send({ type: "event", from: sid.current, payload: { id: uid(), sid: sid.current, kind, blockId, topicId, ts: Date.now() } satisfies FeedbackEvent });
  }, []);

  const connected = Object.values(peers).filter((t) => Date.now() - t < 12000).length;
  void now;
  return { state, events, status, isTeacher, mutate, sendEvent, connected, transportKind, getState: () => stateRef.current };
}
