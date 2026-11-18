"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createTransport, type Msg, type Transport } from "./transport";
import { isCorrect } from "./grade";
import { FeedbackEvent, RoomState, uid } from "./types";
import { shareableDeck } from "./slides";
import type { LectureMaterials } from "./savedLectures";
import { getSupabase } from "./supabase";
import { checkInReceipt } from "./checkInReceipt";
import { lookupRoomKey, registerRoomKey, teacherSigner } from "./roomKey";
import { signRoomMessage, verifyRoomMessage } from "./roomSignature";

export function sharedState(state: RoomState): RoomState {
  const { privateSlidePages, ...shared } = state;
  return shared.slides ? { ...shared, slides: shareableDeck(shared.slides) } : shared;
}

const ls = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};

export function newRoom(code: string, title: string, subject?: string): RoomState {
  return { code, title, subject: subject?.trim() || undefined, blocks: [], topics: [], strokes: [], currentTopicId: null, ended: false, rev: 0 };
}
export async function createMeeting(title: string, subject?: string, materials?: LectureMaterials, extra?: Pick<RoomState, "teacherName" | "classRef">): Promise<string> {
  let code = "";
  // Register the room's signing key before anyone can learn the code. A code another live room holds is skipped.
  for (let attempt = 0; attempt < 8; attempt++) {
    code = String(Math.floor(100000 + Math.random() * 900000));
    if (ls.get(`pacer:room:${code}`)) continue;
    if (await registerRoomKey(code) !== "taken") break;
  }
  localStorage.setItem(`pacer:room:${code}`, JSON.stringify({
    ...newRoom(code, title || "Untitled lecture", subject), ...materials, ...extra,
  }));
  localStorage.setItem(`pacer:token:${code}`, JSON.stringify(uid() + uid()));
  return code;
}

export type Status = "connecting" | "live" | "notfound" | "waiting";
export type RoomLock = "checking" | "locked" | "open" | "conflict";
type SignedType = "state" | "grade";

export function useRoom(code: string, wantTeacher: boolean, userId?: string, review = false) {
  const [state, setState] = useState<RoomState | null>(null);
  const [events, setEvents] = useState<FeedbackEvent[]>([]);
  const [peers, setPeers] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Status>("connecting");
  const [isTeacher, setIsTeacher] = useState(false);
  const [transportKind, setTransportKind] = useState<"supabase" | "local">("local");
  const [now, setNow] = useState(0);
  const [grades, setGrades] = useState<Record<string, boolean>>({});
  const [lock, setLock] = useState<RoomLock>("checking");
  const sendSigned = useRef<(type: SignedType, payload: unknown, to?: string) => void>(() => {});
  const sid = useRef("");
  const tr = useRef<Transport | null>(null);
  const stateRef = useRef<RoomState | null>(null);
  const eventsRef = useRef<FeedbackEvent[]>([]);

  useEffect(() => {
    if (review) return;
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
    let closed = false;
    if (teacher) {
      // Messages are signed one after another so they leave in the order the teacher made them.
      const signer = teacherSigner(code).then((result) => { if (!closed) setLock(result.status); return result.key; });
      let queue = Promise.resolve();
      sendSigned.current = (type, payload, to) => {
        const body = JSON.stringify(payload);
        queue = queue.then(async () => {
          const key = await signer;
          const sig = key ? await signRoomMessage(key, { type, code, to, body }) : undefined;
          if (!closed) t.send({ type, from: sid.current, to, body, sig });
        }).catch(() => { /* a failed signature drops only this message; the next state replaces it */ });
      };
    }
    // Students learn whether this room is locked once, then check every board update and grade against its key.
    const roomKey = teacher ? undefined : lookupRoomKey(code);
    void roomKey?.then((result) => { if (!closed) setLock(result.locked ? "locked" : "open"); });
    const parse = (body: string) => { try { return JSON.parse(body) as unknown; } catch { return undefined; } };
    const trusted = async (m: Msg): Promise<unknown> => {
      const result = await roomKey;
      if (!result?.locked) return m.body !== undefined ? parse(m.body) : m.payload;
      if (typeof m.body !== "string" || !(await verifyRoomMessage(result.key, { type: m.type, code, to: m.to, body: m.body }, m.sig))) return undefined;
      return parse(m.body);
    };
    t.on((m) => {
      if (m.from === sid.current) return;
      if (teacher) {
        if (m.type === "hello" && stateRef.current) sendSigned.current("state", sharedState(stateRef.current));
        const probe = m.type === "hello" && (m.payload as { probe?: boolean } | undefined)?.probe;
        if (m.type === "hb" || (m.type === "hello" && !probe)) setPeers((p) => ({ ...p, [m.from]: Date.now() }));
        if (m.type === "answer") {
          const a = m.payload as { questionId: string; value: string };
          const recorded = checkInReceipt(eventsRef.current, a.questionId, m.from);
          if (recorded !== undefined) {
            sendSigned.current("grade", { questionId: a.questionId, correct: recorded }, m.from);
            return;
          }
          const question = stateRef.current?.question;
          if (!question?.open || question.id !== a.questionId || !a.value.trim()) return;
          const key = ls.get<{ id: string; answer: string }>(`pacer:key:${code}`);
          if (key && key.id === a.questionId) {
            const correct = isCorrect(a.value, key.answer);
            const ev: FeedbackEvent = { id: uid(), sid: m.from, kind: "answer", blockId: null, topicId: null, ts: Date.now(), correct, questionId: a.questionId };
            eventsRef.current = [...eventsRef.current, ev]; setEvents(eventsRef.current); ls.set(`pacer:events:${code}`, eventsRef.current);
            sendSigned.current("grade", { questionId: a.questionId, correct }, m.from);
          }
        }
        if (m.type === "event") {
          const e = m.payload as FeedbackEvent;
          if (!eventsRef.current.some((x) => x.id === e.id)) {
            eventsRef.current = [...eventsRef.current, e]; setEvents(eventsRef.current); ls.set(`pacer:events:${code}`, eventsRef.current);
          }
        }
      } else if (m.type === "grade" && m.to === sid.current) {
        void trusted(m).then((payload) => {
          const g = payload as { questionId: string; correct: boolean } | undefined;
          if (!closed && g) setGrades((prev) => ({ ...prev, [g.questionId]: g.correct }));
        });
      } else if (m.type === "state") {
        void trusted(m).then((payload) => {
          const s = payload as RoomState | undefined;
          if (closed || !s || s.code !== code) return;
          // Broadcasts can arrive out of order; never replace a newer live board with an older one.
          if (live && stateRef.current && s.code === stateRef.current.code && s.rev < stateRef.current.rev) return;
          live = true; stateRef.current = s; setState(s); setStatus("live"); ls.set(`pacer:cache:${code}`, s);
        });
      }
    });
    const timers: ReturnType<typeof setInterval>[] = [];
    if (!teacher) {
      const hello = () => t.send({ type: "hello", from: sid.current });
      hello();
      timers.push(setInterval(() => { if (!live) hello(); }, 2000));
      timers.push(setInterval(() => t.send({ type: "hb", from: sid.current }), 5000));
      const to = setTimeout(() => { if (!live) setStatus(stateRef.current ? "waiting" : "notfound"); }, 8000);
      timers.push(to as unknown as ReturnType<typeof setInterval>);
    }
    timers.push(setInterval(() => setNow(Date.now()), 3000));
    return () => { closed = true; sendSigned.current = () => {}; timers.forEach(clearInterval); t.close(); };
  }, [code, wantTeacher, review]);
  useEffect(() => {
    if (!userId || wantTeacher || review) return;
    let cancelled = false;
    void (async () => {
      const result = await getSupabase()?.rpc("pacer_load_member_board", { room_code: code });
      const snapshot = result?.data as RoomState | undefined;
      if (cancelled || result?.error || !snapshot || snapshot.code !== code || stateRef.current) return;
      stateRef.current = snapshot;
      setState(snapshot);
      setStatus("waiting");
      ls.set(`pacer:cache:${code}`, snapshot);
    })();
    return () => { cancelled = true; };
  }, [code, wantTeacher, userId, review]);

  const mutate = useCallback((fn: (s: RoomState) => RoomState) => {
    const cur = stateRef.current; if (!cur) return;
    const next = { ...fn(cur), rev: cur.rev + 1 };
    stateRef.current = next; setState(next); ls.set(`pacer:room:${code}`, next);
    sendSigned.current("state", sharedState(next));
  }, [code]);

  const sendEvent = useCallback((kind: FeedbackEvent["kind"], blockId: string | null, topicId: string | null) => {
    tr.current?.send({ type: "event", from: sid.current, payload: { id: uid(), sid: sid.current, kind, blockId, topicId, ts: Date.now() } satisfies FeedbackEvent });
  }, []);

  const submitAnswer = useCallback((questionId: string, value: string) => {
    tr.current?.send({ type: "answer", from: sid.current, payload: { questionId, value } });
  }, []);

  const connected = Object.values(peers).filter((t) => Date.now() - t < 12000).length;
  void now;
  return { state, events, status, isTeacher, mutate, sendEvent, submitAnswer, grades, connected, transportKind, lock, getState: () => stateRef.current };
}
