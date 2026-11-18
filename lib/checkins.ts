import { askAI } from "./ai";

/**
 * Check-in suggestions from a teacher's uploaded slides. One AI read per deck, saved in this browser, so reopening
 * or continuing the lecture costs nothing. Answers come only from the slides (with the slide they appear on);
 * answerSlides are slides that give an answer away, which the teacher can hide until they ask.
 */
export type CheckinSuggestion = { slide: number; question: string; answer: string; answerSlide: number | null };
/** `done` holds suggestion ids that were asked or skipped (older plans stored slide numbers, which still hide that slide's ideas). */
export type CheckinPlan = { suggestions: CheckinSuggestion[]; answerSlides: number[]; done: (number | string)[]; source: "ai" | "demo" };

const key = (deckId: string) => `pacer:checkins:${deckId}`;
const SETTING = "pacer:suggest-checkins";

export const suggestionsEnabled = () => { try { return localStorage.getItem(SETTING) !== "0"; } catch { return true; } };
export const setSuggestionsEnabled = (on: boolean) => { try { localStorage.setItem(SETTING, on ? "1" : "0"); } catch { /* not saved */ } };

export function savedPlan(deckId: string): CheckinPlan | null {
  try { return JSON.parse(localStorage.getItem(key(deckId)) ?? "null"); } catch { return null; }
}
export function savePlan(deckId: string, plan: CheckinPlan) {
  try { localStorage.setItem(key(deckId), JSON.stringify(plan)); } catch { /* kept for this session */ }
}

/** Reads the slide text once and returns (and saves) suggestions. Slides without text are skipped. */
export async function planCheckins(deckId: string, pages: { number: number; text: string }[]): Promise<CheckinPlan | null> {
  const saved = savedPlan(deckId);
  if (saved) return saved;
  const lines = pages.map((page) => ({ ...page, text: page.text.replace(/\s+/g, " ").trim() })).filter((page) => page.text.length > 12)
    .slice(0, 40).map((page) => `Slide ${page.number}: ${page.text.slice(0, 560)}`);
  if (!lines.length) return null;
  const response = await askAI({ kind: "checkins", selected: [], context: lines, mode: "standard" });
  const data = response.data as { suggestions?: unknown; answerSlides?: unknown } | undefined;
  const total = pages.length;
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= total;
  const suggestions = (Array.isArray(data?.suggestions) ? data.suggestions : []).flatMap((item: Partial<CheckinSuggestion>) =>
    valid(item?.slide) && typeof item.question === "string" && item.question.trim()
      ? [{ slide: item.slide, question: item.question.trim().slice(0, 300), answer: typeof item.answer === "string" ? item.answer.trim().slice(0, 120) : "",
        answerSlide: valid(item.answerSlide) ? item.answerSlide : null }]
      : []).slice(0, 8);
  // An answer without a source slide isn't trusted: the AI was told to only use answers it found in the slides.
  for (const s of suggestions) if (!s.answerSlide) s.answer = "";
  const answerSlides = (Array.isArray(data?.answerSlides) ? data.answerSlides : []).filter(valid);
  const plan: CheckinPlan = { suggestions, answerSlides: [...new Set(answerSlides)], done: [], source: response.source };
  savePlan(deckId, plan);
  return plan;
}
