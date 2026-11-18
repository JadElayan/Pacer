// Helpers that keep the lesson lists on both dashboards short and readable.
// Type-only imports so unit tests can load this file directly.
import type { Lesson } from "./lessons";

const PLACEHOLDER_TITLES = new Set(["", "untitled lecture", "untitled", "new topic"]);
const isPlaceholder = (title?: string) => PLACEHOLDER_TITLES.has((title ?? "").trim().toLowerCase());
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
