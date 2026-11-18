// Student-private progress history: each check-in answer and each "I'm lost" / "Got it" signal.
// Kept on the device and inside the student's own learning profile row. Teachers never see it.
// No runtime imports, so unit tests can load this file directly. Callers pass the answer checker (lib/grade.ts).

export interface CheckinRecord {
  /** The check-in question's id, so one question is stored once. */ id: string;
  ts: number; lesson: string; lecture: string; subject: string; topic: string;
  question: string; given?: string; /** The answer key, once the teacher shows it. */ key?: string;
  correct: boolean;
  /** Later attempts from "Retry missed check-ins". The last one decides whether it still counts as missed. */
  retries?: { ts: number; given: string; correct: boolean }[];
}
export interface SignalRecord { id: string; ts: number; lesson: string; topic: string; kind: "lost" | "gotit" }
export interface ProgressLog { checkins: CheckinRecord[]; signals: SignalRecord[] }

export const emptyLog = (): ProgressLog => ({ checkins: [], signals: [] });
const LIMIT = 300;
const key = (userId?: string) => `pacer:progress:${userId ?? "guest"}`;

export function loadLog(userId?: string): ProgressLog {
  try { const v = JSON.parse(localStorage.getItem(key(userId)) ?? "null"); return v ? { checkins: v.checkins ?? [], signals: v.signals ?? [] } : emptyLog(); }
  catch { return emptyLog(); }
}
export function saveLog(log: ProgressLog, userId?: string) {
  try { localStorage.setItem(key(userId), JSON.stringify(log)); } catch { /* storage unavailable */ }
}

/** Joins two logs by id. Fields merge, and the longer retry list wins, so no attempt is lost between devices. */
export function mergeLogs(a: ProgressLog = emptyLog(), b: ProgressLog = emptyLog()): ProgressLog {
  const checkins = new Map<string, CheckinRecord>();
  for (const c of [...a.checkins, ...b.checkins]) {
    const old = checkins.get(c.id);
    if (!old) { checkins.set(c.id, c); continue; }
    const retries = (c.retries?.length ?? 0) >= (old.retries?.length ?? 0) ? c.retries : old.retries;
    checkins.set(c.id, { ...old, ...c, key: c.key ?? old.key, given: c.given ?? old.given, retries });
  }
  const signals = new Map<string, SignalRecord>();
  for (const s of [...a.signals, ...b.signals]) signals.set(s.id, s);
  return {
    checkins: [...checkins.values()].sort((x, y) => y.ts - x.ts).slice(0, LIMIT),
    signals: [...signals.values()].sort((x, y) => y.ts - x.ts).slice(0, LIMIT),
  };
}

/** Adds or updates one check-in (by question id) and returns the new log. */
export function upsertCheckin(log: ProgressLog, record: CheckinRecord): ProgressLog {
  const old = log.checkins.find((c) => c.id === record.id);
  const merged = old ? { ...old, ...record, key: record.key ?? old.key, given: record.given ?? old.given, retries: old.retries } : record;
  return { ...log, checkins: [merged, ...log.checkins.filter((c) => c.id !== record.id)].sort((x, y) => y.ts - x.ts).slice(0, LIMIT) };
}
export function addSignal(log: ProgressLog, signal: SignalRecord): ProgressLog {
  return mergeLogs(log, { checkins: [], signals: [signal] });
}

/** Whether the latest attempt (first answer or a retry) was right. */
export const latestCorrect = (c: CheckinRecord) => c.retries?.length ? c.retries[c.retries.length - 1].correct : c.correct;

/** Missed check-ins that can be retried: the latest attempt was wrong and the answer key is known. */
export function missedCheckins(log: ProgressLog): CheckinRecord[] {
  return log.checkins.filter((c) => !latestCorrect(c) && !!c.key?.trim());
}

/** Grades a retry with the same forgiving check the class uses, and records it. */
export function retryCheckin(log: ProgressLog, id: string, given: string, isCorrect: (given: string, key: string) => boolean, now = Date.now()): { log: ProgressLog; correct: boolean } {
  const c = log.checkins.find((item) => item.id === id);
  if (!c?.key) return { log, correct: false };
  const correct = isCorrect(given, c.key);
  const next = { ...c, retries: [...(c.retries ?? []), { ts: now, given, correct }] };
  return { log: { ...log, checkins: log.checkins.map((item) => item.id === id ? next : item) }, correct };
}

export type TopicStatus = "strong" | "needs work" | "mixed";
export interface TopicRow { topic: string; lesson: string; right: number; wrong: number; status: TopicStatus; ts: number }

/** Check-in results by subject, then topic. Counts use each question's latest attempt. */
export function topicProgress(log: ProgressLog): { subject: string; topics: TopicRow[] }[] {
  const subjects = new Map<string, Map<string, TopicRow>>();
  for (const c of log.checkins) {
    const topics = subjects.get(c.subject) ?? new Map<string, TopicRow>();
    const row = topics.get(c.topic) ?? { topic: c.topic, lesson: c.lesson, right: 0, wrong: 0, status: "mixed" as TopicStatus, ts: 0 };
    if (latestCorrect(c)) row.right += 1; else row.wrong += 1;
    if (c.ts > row.ts) { row.ts = c.ts; row.lesson = c.lesson; }
    topics.set(c.topic, row);
    subjects.set(c.subject, topics);
  }
  return [...subjects.entries()].map(([subject, topics]) => ({
    subject,
    topics: [...topics.values()].map((row) => ({ ...row, status: (row.wrong === 0 ? "strong" : row.right === 0 || row.wrong > row.right ? "needs work" : "mixed") as TopicStatus }))
      .sort((a, b) => b.ts - a.ts),
  })).sort((a, b) => Math.max(...b.topics.map((t) => t.ts)) - Math.max(...a.topics.map((t) => t.ts)));
}

export interface ReviewItem { id: string; ts: number; topic: string; lecture: string; code?: string; question?: string; resolved?: boolean }
export type NextUp =
  | { kind: "missed"; topic: string; lesson: string; count: number; subject: string }
  | { kind: "review"; topic: string; lesson?: string; lecture: string }
  | { kind: "clear" }
  | null;

/** The one most useful thing to do next: the topic with the most missed check-ins, else the newest open review item. */
export function nextUp(log: ProgressLog, review: ReviewItem[]): NextUp {
  const missed = log.checkins.filter((c) => !latestCorrect(c));
  if (missed.length) {
    const byTopic = new Map<string, { topic: string; lesson: string; subject: string; count: number; ts: number }>();
    for (const c of missed) {
      const k = `${c.subject}\u0000${c.topic}`;
      const row = byTopic.get(k) ?? { topic: c.topic, lesson: c.lesson, subject: c.subject, count: 0, ts: 0 };
      row.count += 1;
      if (c.ts > row.ts) { row.ts = c.ts; row.lesson = c.lesson; }
      byTopic.set(k, row);
    }
    const top = [...byTopic.values()].sort((a, b) => b.count - a.count || b.ts - a.ts)[0];
    return { kind: "missed", topic: top.topic, lesson: top.lesson, count: top.count, subject: top.subject };
  }
  const open = review.filter((r) => !r.resolved).sort((a, b) => b.ts - a.ts)[0];
  if (open) return { kind: "review", topic: open.topic, lesson: open.code, lecture: open.lecture };
  return log.checkins.length || review.length ? { kind: "clear" } : null;
}

/** This week at a glance: classes attended and check-ins right, plus how many weeks in a row had a class. */
export function weekSummary(log: ProgressLog, classTimes: number[], now = Date.now()) {
  const WEEK = 7 * 86_400_000;
  const since = now - WEEK;
  const classes = classTimes.filter((ts) => ts >= since).length;
  const recent = log.checkins.filter((c) => c.ts >= since);
  const right = recent.filter(latestCorrect).length;
  let streak = 0;
  while (classTimes.some((ts) => ts < now - streak * WEEK && ts >= now - (streak + 1) * WEEK)) streak += 1;
  return { classes, right, answered: recent.length, streak };
}

/** Topics where the student's own signals moved from "I'm lost" to "Got it", and ones still marked lost. */
export function confidence(log: ProgressLog): { turnedAround: string[]; stillLost: string[] } {
  const byTopic = new Map<string, SignalRecord[]>();
  for (const s of [...log.signals].sort((a, b) => a.ts - b.ts)) byTopic.set(s.topic, [...(byTopic.get(s.topic) ?? []), s]);
  const turnedAround: string[] = [], stillLost: string[] = [];
  for (const [topic, list] of byTopic) {
    const last = list[list.length - 1];
    if (last.kind === "gotit" && list.some((s) => s.kind === "lost")) turnedAround.push(topic);
    else if (last.kind === "lost") stillLost.push(topic);
  }
  return { turnedAround, stillLost };
}
