/** Student's saved lesson notes. Saved on this device; also synced to the account when signed in. */
import type { Archived, RoomState } from "./types";
import { getSupabase } from "./supabase";
import { backUpSavedDeck } from "./teacherStorage";
import type { SlideDeck } from "./slides";
import { hasNoteText } from "./noteHtml";
export interface LessonTopic { id?: string; title: string; summary: string; notes: string[] }
/** A board clip saved in the student's notes. Pictures stay on the device; the account keeps the text. */
export interface LessonClip { id: string; topicId: string; text?: string; label?: string; ts: number }
export interface Lesson { code: string; title: string; subject?: string; ts: number; topics: LessonTopic[]; boards?: Archived[]; slides?: SlideDeck; collaborationId?: string; myNotes?: Record<string, string>; myClips?: LessonClip[];
  /** True once the student saw the teacher end the lecture (or a later check found the room closed). */ ended?: boolean }
const KEY = "pacer:lessons";
type LessonContent = Pick<RoomState, "code" | "title" | "subject" | "blocks" | "topics" | "strokes" | "archive" | "slides" | "collaborationId"> & { ended?: boolean };

const lessonKey = (userId?: string) => userId ? `${KEY}:${userId}` : KEY;
export function loadLessons(userId?: string): Lesson[] { try { const v = localStorage.getItem(lessonKey(userId)); return v ? (JSON.parse(v) as Lesson[]) : []; } catch { return []; } }
export function storeLessons(all: Lesson[], userId?: string) { try { localStorage.setItem(lessonKey(userId), JSON.stringify(all.slice(0, 30))); } catch { /* ignore */ } }
export function buildLesson(s: LessonContent, myNotes?: Record<string, string>, myClips?: LessonClip[]): Lesson | null {
  const all = [...new Map([...(s.archive ?? []).flatMap((a) => a.blocks), ...s.blocks].map((b) => [b.id, b])).values()];
  const topics: LessonTopic[] = s.topics.map((t) => ({ id: t.id, title: t.title, summary: t.summary, notes: all.filter((b) => b.topicId === t.id).map((b) => b.content) })).filter((t) => t.notes.length || t.summary);
  const notes = myNotes && Object.values(myNotes).some(hasNoteText) ? myNotes : undefined;
  const clips = myClips?.filter((clip) => clip.text?.trim()).map(({ id, topicId, text, label, ts }) => ({ id, topicId, text, label, ts }));
  if (!s.code || !s.title) return null;
  const ts = Date.now();
  const boards = [...(s.archive ?? [])];
  if (s.strokes.length || s.blocks.length) boards.push({ id: `${s.code}-live`, ts, blocks: s.blocks, strokes: s.strokes });
  return { code: s.code, title: s.title, subject: s.subject, ts, topics, boards, slides: s.slides, collaborationId: s.collaborationId, ...(notes ? { myNotes: notes } : {}), ...(clips?.length ? { myClips: clips } : {}), ...(s.ended ? { ended: true } : {}) };
}
export function saveLesson(s: LessonContent, userId?: string, myNotes?: Record<string, string>, myClips?: LessonClip[]): Lesson | null {
  const l = buildLesson(s, myNotes, myClips); if (!l) return null;
  storeLessons([l, ...loadLessons(userId).filter((x) => x.code !== s.code)], userId);
  return l;
}
export async function pushLesson(userId: string, l: Lesson) {
  if (l.slides) await backUpSavedDeck(userId, l.slides);
  const result = await getSupabase()?.from("student_lessons").upsert({ user_id: userId, code: l.code, data: l, updated_at: new Date().toISOString() });
  if (!result || result.error) throw result?.error ?? new Error("Account storage is unavailable.");
}
export async function pullLessons(userId: string): Promise<Lesson[]> {
  const { data } = (await getSupabase()?.from("student_lessons").select("data").eq("user_id", userId).order("updated_at", { ascending: false }).limit(30)) ?? { data: null };
  return (data ?? []).map((r) => r.data as Lesson);
}
/** Records that a lesson's lecture has ended, so the list stops checking whether it is live. */
export function markLessonEnded(code: string, userId?: string) {
  const all = loadLessons(userId);
  if (!all.some((lesson) => lesson.code === code && !lesson.ended)) return all;
  const next = all.map((lesson) => lesson.code === code ? { ...lesson, ended: true } : lesson);
  storeLessons(next, userId);
  return next;
}
export function mergeLessons(a: Lesson[], b: Lesson[]): Lesson[] {
  const m = new Map<string, Lesson>();
  [...a, ...b].forEach((l) => {
    const c = m.get(l.code);
    const ended = !!(c?.ended || l.ended);
    const newer = !c || l.ts > c.ts ? l : c;
    m.set(l.code, ended ? { ...newer, ended } : newer);
  });
  return [...m.values()].sort((x, y) => y.ts - x.ts);
}
