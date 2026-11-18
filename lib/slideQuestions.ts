// Questions written on a slide ("1. What is the area under the curve?") become check-in suggestions for that slide,
// with no AI and no cost. They join the AI's suggestions, which still supply answer keys found in the slides.
// No imports, so unit tests can load this file directly.

export type SlideSuggestion = { id: string; slide: number; question: string; answer: string; answerSlide: number | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Questions on one slide's text: sentences ending in "?", without list numbers, 8 to 300 characters. */
export function slideQuestions(text: string): string[] {
  const parts = text.replace(/\r/g, "").split(/\n+|(?<=\?)\s+/);
  const found: string[] = [];
  for (const raw of parts) {
    const line = raw.replace(/\s+/g, " ").trim().replace(/^(\(?\d{1,2}[.)]|[a-z][.)]|[•\-*–])\s*/i, "");
    if (!line.endsWith("?") || line.length < 8 || line.length > 300) continue;
    if (!found.some((q) => norm(q) === norm(line))) found.push(line);
  }
  return found.slice(0, 6);
}

/**
 * Suggestions for one slide: the AI's first (they may carry an answer key), then questions written on the slide
 * that the AI didn't already cover. Each has a stable id so asking or skipping one leaves the rest.
 */
export function suggestionsForSlide(slide: number, slideText: string, ai: { slide: number; question: string; answer: string; answerSlide: number | null }[]): SlideSuggestion[] {
  const fromAi = ai.filter((s) => s.slide === slide).map((s, i) => ({ ...s, id: `ai-${slide}-${i}` }));
  const written = slideQuestions(slideText)
    .filter((q) => !fromAi.some((s) => norm(s.question).includes(norm(q)) || norm(q).includes(norm(s.question))))
    .map((question, i) => ({ id: `slide-${slide}-${i}`, slide, question, answer: "", answerSlide: null }));
  return [...fromAi, ...written];
}
