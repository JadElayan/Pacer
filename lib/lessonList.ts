// Helpers that keep the lesson lists on both dashboards short and readable.
// Type-only imports so unit tests can load this file directly.
import type { Lesson } from "./lessons";

// Same rule as isPlaceholderTitle in lib/studyPlan.ts (kept separate so unit tests can load each file alone).
const isPlaceholder = (title?: string) => /^(|untitled lecture|untitled|new topic|topic \d+)$/i.test((title ?? "").trim());
const shortDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** A name worth showing: the lecture title, else its first real topic, else subject and date. */
export function lessonName(lesson: Pick<Lesson, "title" | "subject" | "ts" | "topics">): string {
  if (!isPlaceholder(lesson.title)) return lesson.title.trim();
  const topic = lesson.topics.find((t) => !isPlaceholder(t.title));
  if (topic) return topic.title.trim();
  return `${lesson.subject?.trim() || "Class"} · ${shortDate(lesson.ts)}`;
}

/** Nothing to go back over: no topics, nothing on a board, no slides and no notes of the student's own. */
export function isEmptyLesson(lesson: Lesson): boolean {
  if (lesson.topics.length) return false;
  if (lesson.boards?.some((board) => board.blocks.length || board.strokes.length)) return false;
  if (lesson.slides && Object.keys(lesson.slides.pages ?? {}).length) return false;
  if (lesson.myNotes && Object.keys(lesson.myNotes).length) return false;
  if (lesson.myClips?.length) return false;
  return true;
}

/** Case-insensitive match on the shown name, title, subject and topic titles. */
export function matchesSearch(lesson: Pick<Lesson, "title" | "subject" | "ts" | "topics">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [lessonName(lesson), lesson.title, lesson.subject ?? "", ...lesson.topics.map((t) => t.title)]
    .some((text) => text.toLowerCase().includes(q));
}

export type LessonGroup<T> = { label: "Today" | "This week" | "Earlier"; items: T[] };

/** Splits lessons (already sorted newest first) into Today, This week and Earlier, skipping empty groups. */
export function groupLessons<T extends { ts: number }>(lessons: T[], now = Date.now()): LessonGroup<T>[] {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const week = today - 6 * 86_400_000;
  const groups: LessonGroup<T>[] = [{ label: "Today", items: [] }, { label: "This week", items: [] }, { label: "Earlier", items: [] }];
  for (const lesson of lessons) groups[lesson.ts >= today ? 0 : lesson.ts >= week ? 1 : 2].items.push(lesson);
  return groups.filter((group) => group.items.length);
}

/** How many rows show before "Show all", and when the search box appears. */
export const LESSONS_SHOWN = 4;
export const SEARCH_AFTER = 6;

export interface ClassGroup<T> { key: string; name: string; teacher?: string; color?: string; classId?: string; items: T[]; latest: number }

/**
 * Groups lessons by class: a teacher-made class when the meeting had one, else the same teacher and subject.
 * Lessons with neither go in "Other lessons", listed last.
 */
export function groupByClass<T extends Pick<Lesson, "ts" | "subject" | "teacherName" | "classRef">>(lessons: T[]): ClassGroup<T>[] {
  const groups = new Map<string, ClassGroup<T>>();
  for (const lesson of lessons) {
    const subject = lesson.subject?.trim();
    const teacher = lesson.teacherName?.trim();
    const key = lesson.classRef ? `class:${lesson.classRef.id}` : teacher || subject ? `t:${(teacher ?? "").toLowerCase()}|s:${(subject ?? "").toLowerCase()}` : "other";
    const name = lesson.classRef?.name ?? (subject ? subject.replace(/^./, (c) => c.toUpperCase()) : teacher ? `${teacher}'s lessons` : "Other lessons");
    const group = groups.get(key) ?? { key, name, teacher, color: lesson.classRef?.color, classId: lesson.classRef?.id, items: [], latest: 0 };
    group.items.push(lesson);
    group.latest = Math.max(group.latest, lesson.ts);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => Number(a.key === "other") - Number(b.key === "other") || b.latest - a.latest);
}
