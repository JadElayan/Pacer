import { getSupabase } from "./supabase";
import type { RoomState } from "./types";
import { slideUrl, type LocalSlide, type SlideDeck, type SlidePage } from "./slides";

export async function saveTeacherRoom(room: RoomState) {
  const result = await getSupabase()?.rpc("save_teacher_room", {
    room_code: room.code, room_revision: room.rev, room_state: room,
  });
  if (result?.error) throw result.error;
}

export const teacherStorageEnabled = process.env.NEXT_PUBLIC_TEACHER_STORAGE_ENABLED === "1";

export async function backUpSlide(userId: string, deckId: string, page: LocalSlide) {
  const result = await getSupabase()?.storage.from("pacer-teacher-slides")
    .upload(`${userId}/${deckId}/${page.id}.jpg`, page.image, { contentType: page.image.type });
  if (!result || result.error) throw result?.error ?? new Error("Slide storage is unavailable.");
}

export async function restoreSlide(userId: string, deckId: string, page: SlidePage): Promise<LocalSlide> {
  const result = await getSupabase()?.storage.from("pacer-teacher-slides").download(`${userId}/${deckId}/${page.id}.jpg`);
  if (!result?.data) throw result?.error ?? new Error("Slide backup is unavailable.");
  return { ...page, image: result.data };
}

export async function backUpSavedDeck(userId: string, deck: SlideDeck) {
  const bucket = getSupabase()?.storage.from("pacer-teacher-slides");
  if (!bucket) throw new Error("Slide storage is unavailable.");

  for (const page of Object.values(deck.pages)) {
    const path = `${userId}/${deck.id}/${page.id}.jpg`;
    const existing = await bucket.exists(path);
    if (existing.data) continue;
    const response = await fetch(slideUrl(page));
    if (!response.ok) throw new Error("A slide image is missing from this device.");
    try {
      await backUpSlide(userId, deck.id, { ...page, image: await response.blob() });
    } catch (error) {
      // Another save can upload the same immutable slide while this save is running.
      if (!(await bucket.exists(path)).data) throw error;
    }
  }
}
