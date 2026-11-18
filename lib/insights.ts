import type { FeedbackEvent, RoomState } from "./types";

/** Smallest group the teacher may see (privacy). "Small class" demo mode lowers it to 1. */
export const MIN_GROUP = 3;
export interface Row { key: string; label: string; topic: string; asks: number; students: number; unresolved: number }

export function computeRows(state: RoomState, events: FeedbackEvent[]) {
  const by = new Map<string, FeedbackEvent[]>();
  events.filter((e) => e.kind !== "answer" && e.kind !== "blocked").forEach((e) => { const k = e.blockId ?? e.topicId ?? "?"; by.set(k, [...(by.get(k) ?? []), e]); });
  const rows: Row[] = []; const helpSet = new Set<string>();
  by.forEach((evs, key) => {
    const b = state.blocks.find((x) => x.id === key); const tp = state.topics.find((x) => x.id === (b?.topicId ?? key));
    const last = new Map<string, FeedbackEvent["kind"]>();
    [...evs].sort((a, c) => a.ts - c.ts).forEach((e) => { if (e.kind !== "ask") last.set(e.sid, e.kind); });
    const unresolved = [...last.entries()].filter(([, k]) => k === "confused");
    unresolved.forEach(([s]) => helpSet.add(s));
    rows.push({ key, label: b?.content ?? tp?.title ?? "Unknown", topic: tp?.title ?? "", asks: evs.filter((e) => e.kind === "ask").length, students: new Set(evs.map((e) => e.sid)).size, unresolved: unresolved.length });
  });
  rows.sort((a, b) => b.unresolved - a.unresolved || b.asks - a.asks);
  return { rows, needHelp: helpSet.size, totalAsks: events.filter((e) => e.kind === "ask").length };
}

/** Latest check-in question: how many distinct students answered and how many got it right. */
export function checkinStats(state: RoomState, events: FeedbackEvent[]) {
  const q = state.question; if (!q) return null;
  const last = new Map<string, boolean>();
  [...events].sort((a, b) => a.ts - b.ts).forEach((e) => { if (e.kind === "answer" && e.questionId === q.id) last.set(e.sid, !!e.correct); });
  return { text: q.text, open: q.open, total: last.size, correct: [...last.values()].filter(Boolean).length };
}
