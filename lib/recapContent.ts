import type { RoomState } from "./types";

/** Lecture content for the recap, in teaching order: the text of every slide the teacher presented, then board notes. */
export function lectureContent(state: RoomState): string[] {
  const deck = state.slides;
  const slides = deck ? [...new Set(deck.presented)].sort((a, b) => a - b).flatMap((n) => {
    const text = (deck.pages[n]?.text || state.privateSlidePages?.[n]?.text || "").replace(/\s+/g, " ").trim();
    // The AI route keeps 600 characters per item, so long slides are split into two pieces at most.
    return text ? [text.slice(0, 560), text.slice(560, 1120)].filter(Boolean).map((part, i) => `Slide ${n}${i ? " (continued)" : ""}: ${part}`) : [];
  }) : [];
  const board = [...(state.archive ?? []).flatMap((a) => a.blocks), ...state.blocks]
    .filter((b) => b.kind === "text" || b.kind === "equation" || b.kind === "sticky").map((b) => b.content.trim()).filter(Boolean);
  const room = 40 - Math.min(slides.length, 26);
  return [...slides.slice(0, 40 - Math.min(board.length, room)), ...board.slice(0, room)].slice(0, 40);
}
