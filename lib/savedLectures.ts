import { buildLesson, type Lesson } from "./lessons";
import { checkinStats, computeRows, MIN_GROUP } from "./insights";
import { getSupabase } from "./supabase";
import { backUpSavedDeck, restoreSlide } from "./teacherStorage";
import { publishSlide, slideUrl } from "./slides";
import { uid, type Block, type FeedbackEvent, type RoomState } from "./types";

export type LectureMaterials = Pick<RoomState, "topics" | "blocks" | "strokes" | "archive" |
  "currentTopicId" | "slides" | "privateSlidePages" | "showSlides" | "boardZoom" | "boardPosition">;

export interface SavedLecture extends Lesson {
  materials?: LectureMaterials;
  struggles: { label: string; topic: string; unresolved: number }[];
  checkIn?: { text: string; total: number; correct: number };
}

export async function continueLecture(lecture: SavedLecture, userId?: string): Promise<LectureMaterials> {
  const materials = lecture.materials ?? restoreLegacyMaterials(lecture);
  const deck = materials.slides;
  if (deck) {
    for (const page of Object.values(deck.pages)) {
      const local = await fetch(slideUrl(page));
      if (local.ok) continue;
      if (!userId) throw new Error("A slide image is missing from this device.");
      await publishSlide(await restoreSlide(userId, deck.id, page));
    }
  }
  return materials;
}

function restoreLegacyMaterials(lecture: SavedLecture): LectureMaterials {
  const topics = lecture.topics.map(({ title, summary }) => ({
    id: uid(), title, summary, ts: lecture.ts, auto: false,
  }));
  const blocks: Block[] = lecture.topics.flatMap((topic, index) => topic.notes.map((content, order) => ({
    id: uid(), topicId: topics[index].id, kind: "text", content, order, ts: lecture.ts,
  })));
  const liveBoardId = `${lecture.code}-live`;
  const liveBoard = lecture.boards?.find((board) => board.id === liveBoardId);
  return {
    topics, blocks, strokes: liveBoard?.strokes ?? [], currentTopicId: topics.at(-1)?.id ?? null,
    archive: lecture.boards?.filter((board) => board.id !== liveBoardId),
    slides: lecture.slides, showSlides: !!lecture.slides,
  };
}

const key = (userId?: string) => `pacer:teaching:${userId ?? "guest"}`;

export function savedLectures(userId?: string): SavedLecture[] {
  try { return JSON.parse(localStorage.getItem(key(userId)) ?? "[]"); }
  catch { return []; }
}

export async function loadSavedLectures(userId?: string): Promise<SavedLecture[]> {
  const local = savedLectures(userId);
  if (!userId) return local;
  const result = await getSupabase()?.from("saved_teacher_lectures").select("data").eq("user_id", userId);
  if (!result || result.error) throw result?.error ?? new Error("Account storage unavailable.");
  const merged = new Map<string, SavedLecture>();
  for (const lecture of [...local, ...result.data.map((row) => row.data as SavedLecture)]) {
    if ((merged.get(lecture.code)?.ts ?? -1) <= lecture.ts) merged.set(lecture.code, lecture);
  }
  return [...merged.values()].sort((a, b) => b.ts - a.ts);
}

export async function saveLecture(state: RoomState, events: FeedbackEvent[], userId?: string) {
  const archivedBlocks = (state.archive ?? []).flatMap((board) => board.blocks.map((block, order) => ({ ...block, order, ts: board.ts })));
  const rows = computeRows({ ...state, blocks: [...archivedBlocks, ...state.blocks] }, events).rows;
  const checkIn = checkinStats(state, events);
  const lecture: SavedLecture = {
    ...(buildLesson(state) ?? { code: state.code, title: state.title, subject: state.subject, ts: Date.now(), topics: [] }),
    materials: {
      topics: state.topics, blocks: state.blocks, strokes: state.strokes, archive: state.archive,
      currentTopicId: state.currentTopicId, slides: state.slides, privateSlidePages: state.privateSlidePages,
      showSlides: state.showSlides, boardZoom: state.boardZoom, boardPosition: state.boardPosition,
    },
    struggles: rows.filter((row) => row.unresolved >= MIN_GROUP).map(({ label, topic, unresolved }) => ({ label, topic, unresolved })),
    checkIn: checkIn && checkIn.total >= MIN_GROUP ? { text: checkIn.text, total: checkIn.total, correct: checkIn.correct } : undefined,
  };
  let localSaved = false;
  try {
    localStorage.setItem(key(userId), JSON.stringify([lecture, ...savedLectures(userId).filter((item) => item.code !== state.code)]));
    localSaved = true;
  } catch { if (!userId) throw new Error("Browser storage is full. Sign in to save this lecture."); }
  if (!userId) return "device";
  try {
    if (lecture.slides) await backUpSavedDeck(userId, lecture.slides);
    const result = await getSupabase()?.from("saved_teacher_lectures").upsert({ user_id: userId, code: state.code, data: lecture });
    if (!result || result.error) throw result?.error ?? new Error("Account storage is unavailable.");
    return "account";
  } catch {
    if (localSaved) return "device";
    throw new Error("Could not save the lecture to your account or browser.");
  }
}
