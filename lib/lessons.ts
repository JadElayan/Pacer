/** Student's saved lesson notes (this device). Built automatically from the topic cards while a lecture runs. */
import type { RoomState } from "./types";
export interface LessonTopic { title: string; summary: string; notes: string[] }
export interface Lesson { code: string; title: string; subject?: string; ts: number; topics: LessonTopic[] }
const KEY = "pacer:lessons";

export function loadLessons(): Lesson[] { try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as Lesson[]) : []; } catch { return []; } }
export function saveLesson(s: RoomState) {
  if (!s.blocks.length) return;
  const topics: LessonTopic[] = s.topics.map((t) => ({ title: t.title, summary: t.summary, notes: s.blocks.filter((b) => b.topicId === t.id).map((b) => b.content) })).filter((t) => t.notes.length);
  if (!topics.length) return;
  const all = loadLessons().filter((l) => l.code !== s.code);
  all.unshift({ code: s.code, title: s.title, subject: s.subject, ts: Date.now(), topics });
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(0, 30))); } catch { /* ignore */ }
}
