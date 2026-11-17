/** Student's saved lesson notes. Saved on this device; also synced to the account when signed in. */
import type { Archived, RoomState } from "./types";
import { getSupabase } from "./supabase";
import { backUpSavedDeck } from "./teacherStorage";
import type { SlideDeck } from "./slides";
export interface LessonTopic { id?: string; title: string; summary: string; notes: string[] }
/** A board clip saved in the student's notes. Pictures stay on the device; the account keeps the text. */
export interface LessonClip { id: string; topicId: string; text?: string; label?: string; ts: number }
export interface Lesson { code: string; title: string; subject?: string; ts: number; topics: LessonTopic[]; boards?: Archived[]; slides?: SlideDeck; collaborationId?: string; myNotes?: Record<string, string>; myClips?: LessonClip[] }
const KEY = "pacer:lessons";
type LessonContent = Pick<RoomState, "code" | "title" | "subject" | "blocks" | "topics" | "strokes" | "archive" | "slides" | "collaborationId">;

const lessonKey = (userId?: string) => userId ? `${KEY}:${userId}` : KEY;
export function loadLessons(userId?: string): Lesson[] { try { const v = localStorage.getItem(lessonKey(userId)); return v ? (JSON.parse(v) as Lesson[]) : []; } catch { return []; } }
export function storeLessons(all: Lesson[], userId?: string) { try { localStorage.setItem(lessonKey(userId), JSON.stringify(all.slice(0, 30))); } catch { /* ignore */ } }
export function buildLesson(s: LessonContent, myNotes?: Record<string, string>, myClips?: LessonClip[]): Lesson | null {
  const all = [...new Map([...(s.archive ?? []).flatMap((a) => a.blocks), ...s.blocks].map((b) => [b.id, b])).values()];
  const topics: LessonTopic[] = s.topics.map((t) => ({ id: t.id, title: t.title, summary: t.summary, notes: all.filter((b) => b.topicId === t.id).map((b) => b.content) })).filter((t) => t.notes.length || t.summary);
  const notes = myNotes && Object.values(myNotes).some((text) => text.trim()) ? myNotes : undefined;
  const clips = myClips?.filter((clip) => clip.text?.trim()).map(({ id, topicId, text, label, ts }) => ({ id, topicId, text, label, ts }));
  if (!topics.length && !s.strokes.length && !s.archive?.length && !all.length && !s.slides && !notes && !clips?.length) return null;
  const ts = Date.now();
  const boards = [...(s.archive ?? [])];
  if (s.strokes.length || s.blocks.length) boards.push({ id: `${s.code}-live`, ts, blocks: s.blocks, strokes: s.strokes });
  return { code: s.code, title: s.title, subject: s.subject, ts, topics, boards, slides: s.slides, collaborationId: s.collaborationId, ...(notes ? { myNotes: notes } : {}), ...(clips?.length ? { myClips: clips } : {}) };
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
export function mergeLessons(a: Lesson[], b: Lesson[]): Lesson[] {
  const m = new Map<string, Lesson>(); [...a, ...b].forEach((l) => { const c = m.get(l.code); if (!c || l.ts > c.ts) m.set(l.code, l); });
  return [...m.values()].sort((x, y) => y.ts - x.ts);
}
