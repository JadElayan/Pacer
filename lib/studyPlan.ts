// Builds the student's short study plan: one focus topic and up to three steps (re-read, retry, practice).
// No runtime imports, so unit tests can load this file directly; callers pass in what it needs.
import type { Lesson } from "./lessons";
import type { StudyEntry } from "./profile";
import type { CheckinRecord, ProgressLog } from "./progress";

/** Names Pacer gives things nobody named. They make poor labels, so the lesson's name is shown instead. */
export const isPlaceholderTitle = (title?: string) => /^(|untitled lecture|untitled|new topic|topic \d+)$/i.test((title ?? "").trim());

const latestCorrect = (c: CheckinRecord) => c.retries?.length ? c.retries[c.retries.length - 1].correct : c.correct;
const DAY = 86_400_000;

export interface ReviewItem extends StudyEntry { label: string }

/**
 * Older review marks were saved before they kept a lesson code, often with placeholder names.
 * Match each to the saved lesson with the same title (closest in time) and give it a readable label.
 */
export function resolveReview(entries: StudyEntry[], lessons: Lesson[], name: (lesson: Lesson) => string): ReviewItem[] {
  return entries.map((entry) => {
    const sameTitle = lessons.filter((l) => !l.removed && l.title === entry.lecture);
    const lesson = (entry.code ? lessons.find((l) => l.code === entry.code) : undefined)
      ?? [...sameTitle].sort((a, b) => Math.abs(a.ts - entry.ts) - Math.abs(b.ts - entry.ts))[0];
    const code = entry.code ?? lesson?.code;
    const fallback = lesson ? name(lesson) : isPlaceholderTitle(entry.lecture) ? "a recent class" : entry.lecture;
    const label = isPlaceholderTitle(entry.topic) || entry.topic === entry.lecture ? fallback : entry.topic;
    return { ...entry, code, label };
  });
}

export type StepId = "reread" | "explain" | "retry" | "practice";
export interface PlanFocus {
  topic: string; subject?: string; lesson?: string;
  reason: string; question?: string;
  /** Missed check-ins on this topic that can be retried (answer key known). */ retryIds: string[];
  /** Review marks this plan covers, cleared when the plan is finished. */ reviewIds: string[];
}

/** Picks what to study: the chosen topic, else the one with the most missed check-ins, else the newest review mark. */
export function planFocus(log: ProgressLog, review: ReviewItem[], chosen?: string, skip: string[] = []): PlanFocus | null {
  const open = review.filter((r) => !r.resolved);
  const missed = log.checkins.filter((c) => !latestCorrect(c));
  const build = (topic: string): PlanFocus | null => {
    const misses = missed.filter((c) => c.topic === topic);
    const marks = open.filter((r) => r.label === topic);
    const any = log.checkins.find((c) => c.topic === topic);
    if (!misses.length && !marks.length && !any) return null;
    const newest = [...misses].sort((a, b) => b.ts - a.ts)[0];
    const mark = [...marks].sort((a, b) => b.ts - a.ts)[0];
    const reason = misses.length ? `You missed ${misses.length} check-in${misses.length === 1 ? "" : "s"} on this.`
      : mark?.question ? "You asked about this in class." : marks.length ? "You marked this for review." : "Practice keeps it fresh.";
    return {
      topic, subject: newest?.subject ?? any?.subject, lesson: newest?.lesson ?? mark?.code ?? any?.lesson,
      reason, question: mark?.question,
      retryIds: misses.filter((c) => c.key?.trim()).map((c) => c.id), reviewIds: marks.map((r) => r.id),
    };
  };
  if (chosen) { const f = build(chosen); if (f) return f; }
  const counts = new Map<string, { n: number; ts: number }>();
  for (const c of missed) { if (skip.includes(c.topic)) continue; const v = counts.get(c.topic) ?? { n: 0, ts: 0 }; counts.set(c.topic, { n: v.n + 1, ts: Math.max(v.ts, c.ts) }); }
  const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].ts - a[1].ts)[0];
  if (top) return build(top[0]);
  const mark = open.filter((r) => !skip.includes(r.label)).sort((a, b) => b.ts - a.ts)[0];
  return mark ? build(mark.label) : null;
}

/** The plan's steps: re-read where it was taught (or have it explained), retry missed check-ins, then one practice question. */
export function planSteps(focus: PlanFocus): StepId[] {
  return [focus.lesson ? "reread" : "explain", ...(focus.retryIds.length ? ["retry" as const] : []), "practice"];
}

/** Notes and questions to send with Explain or Practice, so the AI works from what was actually taught. */
export function planMaterial(focus: PlanFocus, lessons: Lesson[], log: ProgressLog): { selected: string[]; context: string[] } {
  const lesson = lessons.find((l) => l.code === focus.lesson);
  const topic = lesson?.topics.find((t) => t.title.trim().toLowerCase() === focus.topic.trim().toLowerCase());
  const notes = (topic ? topic.notes : lesson?.topics.flatMap((t) => t.notes) ?? []).filter((n) => n.trim());
  const questions = log.checkins.filter((c) => c.topic === focus.topic).map((c) => `Check-in: ${c.question}${c.key ? ` (answer: ${c.key})` : ""}`);
  const selected = [...notes, ...questions, ...(focus.question ? [`Student asked: ${focus.question}`] : [])].slice(0, 12);
  const context = (lesson?.topics ?? []).map((t) => [t.title, t.summary].filter(Boolean).join(": ")).filter(Boolean).slice(0, 20);
  return { selected: selected.length ? selected : [focus.topic], context };
}

/** Which steps are done today for this topic. A new day or a new topic starts the plan fresh. */
export interface PlanProgress { topic: string; day: string; done: StepId[] }
export const today = (now = Date.now()) => new Date(now - new Date(now).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
export function stepsDone(saved: PlanProgress | null, topic: string, now = Date.now()): StepId[] {
  return saved && saved.topic === topic && saved.day === today(now) ? saved.done : [];
}
export { DAY };

/**
 * Progress only for lessons the student still has. Removing a lesson used to leave its questions, review marks
 * and check-ins behind; anything tied to a lesson that's gone is hidden. Practice with no lesson is kept.
 */
export function forLessons(log: ProgressLog, study: StudyEntry[], lessons: Pick<Lesson, "code" | "title" | "removed">[]): { log: ProgressLog; study: StudyEntry[] } {
  const kept = lessons.filter((l) => !l.removed);
  const codes = new Set(kept.map((l) => l.code));
  const titles = new Set(kept.map((l) => l.title));
  return {
    log: { checkins: log.checkins.filter((c) => !c.lesson || codes.has(c.lesson)), signals: log.signals.filter((s) => !s.lesson || codes.has(s.lesson)) },
    study: study.filter((e) => e.code ? codes.has(e.code) : titles.has(e.lecture)),
  };
}

/** Deletes a removed lesson's progress: entries with its code, and older entries (no code) whose lecture title no other lesson shares. */
export function purgeLesson(log: ProgressLog, study: StudyEntry[], lesson: Pick<Lesson, "code" | "title">, others: Pick<Lesson, "title">[]): { log: ProgressLog; study: StudyEntry[] } {
  const shared = others.some((l) => l.title === lesson.title);
  return {
    log: { checkins: log.checkins.filter((c) => c.lesson !== lesson.code), signals: log.signals.filter((s) => s.lesson !== lesson.code) },
    study: study.filter((e) => e.code ? e.code !== lesson.code : shared || e.lecture !== lesson.title),
  };
}
