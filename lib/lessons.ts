/** Student's saved lesson notes. Saved on this device; also synced to the account when signed in. */
import type { Archived, RoomState } from "./types";
import { getSupabase } from "./supabase";
export interface LessonTopic { title: string; summary: string; notes: string[] }
export interface Lesson { code: string; title: string; subject?: string; ts: number; topics: LessonTopic[]; boards?: Archived[] }
const KEY = "pacer:lessons";

export function loadLessons(): Lesson[] { try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as Lesson[]) : []; } catch { return []; } }
export function storeLessons(all: Lesson[]) { try { localStorage.setItem(KEY, JSON.stringify(all.slice(0, 30))); } catch { /* ignore */ } }
export function buildLesson(s: RoomState): Lesson | null {
  const all = [...(s.archive ?? []).flatMap((a) => a.blocks), ...s.blocks];
  const topics: LessonTopic[] = s.topics.map((t) => ({ title: t.title, summary: t.summary, notes: all.filter((b) => b.topicId === t.id).map((b) => b.content) })).filter((t) => t.notes.length);
  if (!topics.length && !(s.archive?.length)) return null;
  return { code: s.code, title: s.title, subject: s.subject, ts: Date.now(), topics, boards: s.archive };
}
export function saveLesson(s: RoomState): Lesson | null {
  const l = buildLesson(s); if (!l) return null;
  storeLessons([l, ...loadLessons().filter((x) => x.code !== s.code)]);
  return l;
}
export async function pushLesson(userId: string, l: Lesson) {
  await getSupabase()?.from("student_lessons").upsert({ user_id: userId, code: l.code, data: l, updated_at: new Date().toISOString() });
}
export async function pullLessons(userId: string): Promise<Lesson[]> {
  const { data } = (await getSupabase()?.from("student_lessons").select("data").eq("user_id", userId).order("updated_at", { ascending: false }).limit(30)) ?? { data: null };
  return (data ?? []).map((r) => r.data as Lesson);
}
export function mergeLessons(a: Lesson[], b: Lesson[]): Lesson[] {
  const m = new Map<string, Lesson>(); [...a, ...b].forEach((l) => { const c = m.get(l.code); if (!c || l.ts > c.ts) m.set(l.code, l); });
  return [...m.values()].sort((x, y) => y.ts - x.ts);
}
