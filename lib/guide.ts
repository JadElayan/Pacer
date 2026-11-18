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
  /** A few short lines to look at before moving on. */
  points: string[];
}

const clean = (line: string) => line.replace(/\s+/g, " ").trim();
const short = (line: string, n = 140) => line.length > n ? `${line.slice(0, n - 1).trimEnd()}…` : line;
const textOf = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p|li|h[2-4])>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/**
 * One step per slide (in order), then one per topic. Topic steps show the lesson notes page when there is one.
 * Placeholder topic names are skipped when the topic has nothing to look at.
 */
export function guideSteps(lesson: Pick<Lesson, "topics" | "slides">, slideNumbers: number[], topicPage: string | undefined): GuideStep[] {
  const steps: GuideStep[] = [];
  for (const n of slideNumbers) {
    const page = lesson.slides?.pages[n];
    if (!page) continue;
    const lines = page.text.split(/\n+/).map(clean).filter((l) => l.length > 2);
    steps.push({ id: `slide-${n}`, kind: "slide", page: `slide:${n}`, title: lines[0] ? short(lines[0], 80) : `Slide ${n}`, points: lines.slice(1, 5).map((l) => short(l)) });
  }
  lesson.topics.forEach((topic, i) => {
    const notes = topic.notes.flatMap((n) => textOf(n).split("\n")).map(clean).filter(Boolean);
    if (!topic.summary && !notes.length) return;
    steps.push({ id: `topic-${topic.id ?? i}`, kind: "topic", page: topicPage ?? (lesson.slides ? `slide:${slideNumbers[0]}` : "notes"),
      title: topic.title.trim() || `Topic ${i + 1}`, summary: topic.summary || undefined, points: notes.slice(0, 4).map((l) => short(l)) });
  });
  return steps;
}

export type GuideMark = "got" | "unsure";
/** Where the student left off in this lesson's guide, kept for the browser session. */
export const guideKey = (code: string) => `pacer:guide:${code}`;
