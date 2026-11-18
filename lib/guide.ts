// Guided review: walks a student through a saved lesson one slide or topic at a time.
// Type-only imports, so unit tests can load this file directly.
import type { Lesson } from "./lessons";

export interface GuideStep {
  id: string;
  kind: "slide" | "topic";
  /** The saved-lesson page to show for this step (e.g. "slide:3", "notes", "board:<id>"). */
  page: string;
  title: string;
  summary?: string;
  /** Short lines to look at before moving on. */
  points: string[];
  /** Questions written on the slide, to try before moving on. */
  questions: string[];
  /** An overview slide (a list of what's coming): the student can tap the parts that feel unclear. */
  overview?: boolean;
}

const clean = (line: string) => line.replace(/\s+/g, " ").trim().replace(/^(\(?\d{1,2}[.)]|[a-z][.)]|[-*–])\s+/i, "");
const short = (line: string, n = 160) => line.length > n ? `${line.slice(0, n - 1).trimEnd()}…` : line;
/** Slide text often comes out of a PDF as one line with "●" bullets; split on those as well as line breaks. */
const SPLIT = /\n+|\s*[●•▪◦■□➢►✓]\s*/;
const textOf = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p|li|h[2-4])>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const SMALL = new Set(["of", "the", "and", "to", "a", "an", "in", "for", "on", "vs", "&"]);
/**
 * PDF text often runs the title into the first sentence ("Density Plots Recall that we…"). Take the leading
 * capitalised words as the title, minus the last one when a lowercase word follows it (that word starts the sentence).
 */
function splitTitle(line: string): [string, string] {
  if (line.length <= 60) return [line, ""];
  const words = line.split(" ");
  let run = 0;
  // A title word is capitalised and at least two letters (a lone "X" is maths), or a small word between two of them.
  const big = (w?: string) => !!w && /^[A-Z][A-Za-z0-9'’-]+$|^\d+$/.test(w);
  while (run < Math.min(words.length, 7) && (big(words[run]) || (run > 0 && SMALL.has(words[run].toLowerCase()) && big(words[run + 1])))) run++;
  if (run < words.length && run > 1 && /^[a-z]/.test(words[run])) run--;
  while (run > 1 && SMALL.has(words[run - 1].toLowerCase())) run--;
  if (run < 1 || run >= words.length) return [line, ""];
  return [words.slice(0, run).join(" "), words.slice(run).join(" ")];
}

/** Splits slide text into a title, points and the questions written on it. */
export function readSlide(text: string): { title: string; points: string[]; questions: string[] } {
  const raw = text.split(SPLIT).flatMap((part) => part.split(/(?<=\?)\s+(?=\S)|(?<=[:.?!])\s+(?=\d{1,2}[.)]\s)/)).map(clean).filter((l) => l.length > 1);
  const [head = "", ...after] = raw;
  const [title, body] = splitTitle(head);
  const rest = body ? [clean(body), ...after] : after;
  const questions = rest.filter((l) => l.endsWith("?") && l.length >= 8).map((l) => short(l, 300));
  const points = rest.filter((l) => !questions.includes(l)).map((l) => short(l));
  return { title: short(title, 90), points, questions };
}

/**
 * One step per slide with something on it (title-only divider slides are skipped), then one per topic with a
 * summary or notes. Topic steps show the lesson notes page when there is one.
 */
export function guideSteps(lesson: Pick<Lesson, "topics" | "slides">, slideNumbers: number[], topicPage: string | undefined): GuideStep[] {
  const steps: GuideStep[] = [];
  for (const n of slideNumbers) {
    const page = lesson.slides?.pages[n];
    if (!page) continue;
    const { title, points, questions } = readSlide(page.text);
    if (!points.length && !questions.length && slideNumbers.length > 3) continue;
    const overview = questions.length === 0 && points.length >= 3 && points.every((p) => p.length <= 48);
    steps.push({ id: `slide-${n}`, kind: "slide", page: `slide:${n}`, title: title || `Slide ${n}`, points: points.slice(0, 6), questions: questions.slice(0, 3), ...(overview ? { overview } : {}) });
  }
  lesson.topics.forEach((topic, i) => {
    const notes = topic.notes.flatMap((n) => textOf(n).split("\n")).map(clean).filter(Boolean);
    if (!topic.summary && !notes.length) return;
    steps.push({ id: `topic-${topic.id ?? i}`, kind: "topic", page: topicPage ?? (lesson.slides ? `slide:${slideNumbers[0]}` : "notes"),
      title: topic.title.trim() || `Topic ${i + 1}`, summary: topic.summary || undefined, points: notes.slice(0, 4).map((l) => short(l)), questions: [] });
  });
  return steps;
}

export type GuideMark = "got" | "unsure";
/** Where the student left off in this lesson's guide, kept for the browser session. */
export const guideKey = (code: string) => `pacer:guide:${code}`;
