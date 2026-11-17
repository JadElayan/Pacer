"use client";

import { useEffect, useRef, useState } from "react";
import type { Block, Stroke } from "@/lib/types";
import type { SlideDeck } from "@/lib/slides";
import { BoardObject } from "./BoardObjects";
import { BoardText } from "./BoardTextEditor";
import { InkPath } from "./InkPath";
import { MathView } from "./MathView";
import { SavedSlideImage } from "./SavedSlides";

/** What a lesson card shows: the slide or board the teacher is on (live), or was on when the student left. */
export type LessonView =
  | { kind: "slide"; deck: SlideDeck; number: number }
  | { kind: "board"; blocks: Omit<Block, "ts" | "order">[]; strokes: Stroke[]; aspect: number };

/** The preview draws the board at this width and scales it to the card; smaller than a real board so notes stay readable. */
const BOARD_WIDTH = 640;

/** A small picture of the board, laid out like the real one: notes where the teacher put them, ink on top. */
function MiniBoard({ blocks, strokes, aspect }: Extract<LessonView, { kind: "board" }>) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.35);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / BOARD_WIDTH));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Fit everything the teacher wrote, even past the first screen of the board.
  let left = 0, top = 0, right = 1, bottom = 1;
  const grow = ([x, y]: [number, number]) => { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); };
  strokes.forEach((stroke) => stroke.pts.forEach(grow));
  blocks.forEach((block) => {
    if (block.position) grow([block.position[0] + .15, block.position[1] + .1]);
    if (block.connector) { grow(block.connector.from.point); grow(block.connector.to.point); }
  });
  const width = right - left, height = bottom - top;
  const boardHeight = (BOARD_WIDTH / aspect) * (height / width);
  const at = ([x, y]: [number, number]) => [((x - left) / width) * 100, ((y - top) / height) * 100];
  const placed = blocks.filter((block) => block.position && block.kind !== "connector");
  const flowing = blocks.filter((block) => !block.position && block.kind !== "connector");
  const connectors = blocks.filter((block) => block.connector);
  const empty = !placed.length && !flowing.length && !strokes.length && !connectors.length;
  const item = (block: Omit<Block, "ts" | "order">) => block.kind === "equation" ? <span style={{ fontSize: block.fontSize ?? 26 }}><MathView tex={block.content} display={false} /></span>
    : block.kind === "text" ? <p className="whitespace-pre-wrap leading-snug" style={{ fontSize: block.fontSize ?? 20, width: block.textWidth }}><BoardText content={block.content} runs={block.textRuns} /></p>
    : <div style={{ zoom: block.scale ?? 1 }}><BoardObject kind={block.kind} content={block.content} stickyStyle={block.stickyStyle} shapeSize={block.shapeSize} /></div>;
  return <div ref={frame} className="relative w-full overflow-hidden rounded-xl border border-stone bg-white" style={{ height: Math.min(boardHeight * scale, 340) }}>
    {empty ? <p className="grid h-full place-items-center text-sm text-smoke">The board is empty so far.</p> :
    <div className="absolute left-0 top-0 origin-top-left" style={{ width: BOARD_WIDTH, height: boardHeight, transform: `scale(${scale})` }}>
      {flowing.length > 0 && <div className="absolute left-6 top-6 grid max-w-[60%] gap-3">{flowing.map((block) => <div key={block.id}>{item(block)}</div>)}</div>}
      {placed.map((block) => { const [x, y] = at(block.position!); return <div key={block.id} className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>{item(block)}</div>; })}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`${left} ${top} ${width} ${height}`} preserveAspectRatio="none">
        {connectors.map((block) => <line key={block.id} x1={block.connector!.from.point[0]} y1={block.connector!.from.point[1]} x2={block.connector!.to.point[0]} y2={block.connector!.to.point[1]}
          stroke={block.connector!.color ?? "#2454e8"} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeDasharray={block.connector!.dashed ? "6 5" : undefined} />)}
        {strokes.map((stroke) => <InkPath key={stroke.id} stroke={stroke} />)}
      </svg>
    </div>}
  </div>;
}

export function LessonPreview({ view, live, topic, userId }: { view: LessonView; live: boolean; topic?: string; userId?: string }) {
  const caption = view.kind === "slide" ? `Slide ${view.number} of ${view.deck.total}` : "Whiteboard";
  return <figure className="grid gap-2">
    <figcaption className="flex flex-wrap items-center gap-x-2 text-xs text-smoke">
      <span className="font-medium text-[#30385b]">{live ? "Your teacher is showing" : "Last thing on screen"}</span>
      <span>{caption}{topic ? ` · ${topic}` : ""}</span>
    </figcaption>
    {view.kind === "slide" ? (() => {
      const slide = view.deck.pages[view.number];
      if (!slide) return <p className="rounded-xl bg-taupe p-4 text-sm text-smoke">This slide isn&apos;t available yet.</p>;
      return <div className="relative overflow-hidden rounded-xl border border-stone bg-white" style={{ aspectRatio: slide.width / slide.height }}>
        <SavedSlideImage key={`${userId ?? "guest"}:${slide.id}`} slide={slide} number={view.number} deckId={view.deck.id} userId={live ? undefined : userId} />
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          {(view.deck.ink[view.number] ?? []).map((stroke) => <InkPath key={stroke.id} stroke={stroke} />)}
        </svg>
      </div>;
    })() : <MiniBoard {...view} />}
  </figure>;
}
