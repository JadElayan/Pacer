"use client";
import { useEffect, useState } from "react";

/**
 * Background doodles for the home page. Each stroke draws itself in (pathLength = 1, so every path animates the
 * same way whatever its length), holds, then fades and redraws. Teaching looks like whiteboard marker; Learning
 * like ink in a notebook margin. Both sets are rendered and cross-fade with the view; the hidden set is paused.
 * Subjects are mixed on purpose so no single class owns the page.
 */
type Stroke = { d: string; color: string; delay: number; transform?: string };

const TEACHING_LEFT: Stroke[] = [
  { d: "M30 120 q30 -40 60 0 t60 0 t60 0", color: "#2454E8", delay: 0 },
  { d: "M40 300 c40 -30 100 -30 140 0 M166 284 l15 16 l-20 7", color: "#D85A30", delay: 1.6 },
  { d: "M60 520 a62 22 0 1 0 124 0 a62 22 0 1 0 -124 0", color: "#7F77DD", delay: 3.2, transform: "rotate(30 122 520)" },
  { d: "M60 520 a62 22 0 1 0 124 0 a62 22 0 1 0 -124 0", color: "#7F77DD", delay: 3.6, transform: "rotate(-30 122 520)" },
  { d: "M40 700 l10 10 l20 -20 M84 700 h70 M40 744 l10 10 l20 -20 M84 744 h52", color: "#1D9E75", delay: 5 },
];
const TEACHING_RIGHT: Stroke[] = [
  { d: "M262 140 c10 -16 38 -16 38 4 c0 20 -38 34 -38 34 c0 0 -38 -14 -38 -34 c0 -20 28 -20 38 -4", color: "#D4537E", delay: 0.8 },
  { d: "M205 470 h125 M222 470 v-56 M252 470 v-90 M282 470 v-40 M312 470 v-112", color: "#BA7517", delay: 2.4 },
  { d: "M196 660 h134 M196 674 h134 M196 688 h134 M252 692 v-44 M252 692 a8 6 0 1 1 -1 -1 M290 678 v-44 M290 678 a8 6 0 1 1 -1 -1", color: "#2454E8", delay: 4.2 },
  { d: "M230 250 c-14 12 -14 34 0 46 c14 -12 14 -34 0 -46 M216 273 h28 M270 250 l26 26 M296 250 l-26 26", color: "#1D9E75", delay: 5.8 },
];
// Teaching's middle has room beside the title and the Start Meeting card (a 1000-wide band centered on the page;
// the card covers roughly x 212-788, so strokes stay outside it, plus an underline below the title).
const TEACHING_CENTER: Stroke[] = [
  { d: "M340 98 C 430 86, 570 86, 660 96", color: "#4da3ff", delay: 0.3 },
  { d: "M56 210 q18 -26 36 0 t36 0 t36 0", color: "#7F77DD", delay: 1.2 },
  { d: "M150 300 c-26 -6 -40 -30 -26 -48 c14 -18 44 -6 40 18 c-4 22 -36 26 -44 8", color: "#1D9E75", delay: 2.4 },
  { d: "M100 420 l14 -24 l14 24 l-24 -15 h24 z", color: "#EF9F27", delay: 3.4 },
  { d: "M818 190 c16 -30 50 -30 66 0 s50 30 66 0", color: "#D85A30", delay: 0.8 },
  { d: "M836 300 l40 -16 M842 318 l40 -6 M848 336 l36 4", color: "#2454E8", delay: 2 },
  { d: "M850 430 c10 -20 50 -20 56 6 c4 20 -26 30 -40 18 c-12 -10 0 -30 20 -28", color: "#D4537E", delay: 3 },
];
// Learning has three columns, so its doodles are smaller and stay in the outer ~100px of each side.
const LEARNING_LEFT: Stroke[] = [
  { d: "M22 60 C 42 80, 16 100, 36 120 C 56 140, 30 160, 50 180 M50 60 C 30 80, 56 100, 36 120 C 16 140, 42 160, 22 180 M27 76 h18 M26 102 h20 M28 138 h18 M27 164 h18", color: "#1D9E75", delay: 0 },
  { d: "M14 290 q24 -10 40 0 v46 q-16 -10 -40 0 z M54 290 q16 -10 40 0 v46 q-24 -10 -40 0 M24 304 h22 M24 314 h18 M62 304 h22 M62 314 h16", color: "#BA7517", delay: 1.8 },
  { d: "M26 500 v-40 l34 -9 v40 M26 500 a8 6 0 1 1 -1 -1 M60 491 a8 6 0 1 1 -1 -1", color: "#7F77DD", delay: 3.6 },
  { d: "M44 650 l7 -15 l7 15 l-14 -9 h14 z", color: "#D4537E", delay: 5.2 },
];
const LEARNING_RIGHT: Stroke[] = [
  { d: "M310 66 a34 34 0 1 0 0.1 0 M310 66 c-18 17 -18 51 0 68 c18 -17 18 -51 0 -68 M276 100 h68", color: "#378ADD", delay: 0.9 },
  { d: "M272 300 c14 -30 70 -30 78 8 c4 22 -22 15 -26 30 c-3 17 -46 15 -52 -15 z M292 296 h0.1 M310 292 h0.1 M328 300 h0.1", color: "#D85A30", delay: 2.7 },
  { d: "M298 470 a22 22 0 1 1 30 18 v12 h-17 v-12 a22 22 0 0 1 -13 -18 M313 512 h14", color: "#BA7517", delay: 4.5 },
  { d: "M292 620 h26 M299 620 v22 l-9 20 h38 l-9 -20 v-22", color: "#1D9E75", delay: 6 },
];

function Side({ strokes, side, width }: { strokes: Stroke[]; side: "left" | "right"; width: number }) {
  return (
    <svg className={`home-art-side home-art-${side}`} viewBox="0 0 360 820" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={width}>
        {strokes.map((s, i) => (
          <path key={i} d={s.d} stroke={s.color} transform={s.transform} pathLength={1} className="home-art-stroke" style={{ animationDelay: `${s.delay}s` }} />
        ))}
      </g>
    </svg>
  );
}

export function HomeArt({ view }: { view: "learning" | "teaching" | "welcome" }) {
  return (
    <div className="home-art" data-view={view} aria-hidden="true">
      <div className="home-art-set home-art-teaching" data-on={view === "teaching"}>
        <Side strokes={TEACHING_LEFT} side="left" width={2.8} />
        <Side strokes={TEACHING_RIGHT} side="right" width={2.8} />
        <svg className="home-art-center" viewBox="0 0 1000 480" aria-hidden="true">
          <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8}>
            {TEACHING_CENTER.map((s, i) => <path key={i} d={s.d} stroke={s.color} pathLength={1} className="home-art-stroke" style={{ animationDelay: `${s.delay}s` }} />)}
          </g>
        </svg>
      </div>
      <div className="home-art-set home-art-learning" data-on={view === "learning"}>
        <Side strokes={LEARNING_LEFT} side="left" width={1.8} />
        <Side strokes={LEARNING_RIGHT} side="right" width={1.8} />
      </div>
    </div>
  );
}

const SUBJECTS = ["biology?", "history?", "music?", "chemistry?", "Spanish?", "algebra?", "art?", "coding?", "physics?", "poetry?"];

/** The end of "Ready to learn …": the subject swaps every few seconds with a marker underline drawn under it. Screen readers hear "?". */
export function RotatingSubject() {
  const [index, setIndex] = useState(0);
  const [moving, setMoving] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setMoving(false); return; }
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % SUBJECTS.length), 2600);
    return () => window.clearInterval(timer);
  }, []);
  if (!moving) return <>?</>;
  return <>
    <span className="sr-only">?</span>
    <span aria-hidden="true" className="rotating-subject">
      {SUBJECTS.map((word) => <span key={word} className="rotating-subject-sizer">{word}</span>)}
      <span key={index} className="rotating-subject-word">{SUBJECTS[index]}
        <svg viewBox="0 0 200 14" preserveAspectRatio="none" className="rotating-subject-line"><path d="M4 9 C 50 3, 120 3, 196 8" pathLength={1} /></svg>
      </span>
    </span>
  </>;
}

/** Under the Join card on Learning: a desk draws itself in, stroke by stroke. */
export function DeskScene() {
  const strokes: Stroke[] = [
    { d: "M28 188 H 412", color: "#8C8577", delay: 0 },
    { d: "M60 188 v-46 h26 v46 M88 188 v-60 h22 v60 M112 188 v-38 h30 v38 M66 156 h14 M92 146 h14 M118 166 h18", color: "#BA7517", delay: 0.6 },
    { d: "M168 188 v-20 h44 v20 M190 168 v-26 M190 150 c-14 -2 -22 -14 -20 -24 c12 2 20 10 20 24 c0 -14 8 -24 22 -26 c2 12 -8 24 -22 26", color: "#1D9E75", delay: 1.4 },
    { d: "M238 188 h44 M260 188 v-12 M234 150 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0 M234 150 h52 M260 124 c-12 12 -12 40 0 52 c12 -12 12 -40 0 -52", color: "#378ADD", delay: 2.2 },
    { d: "M330 140 a18 18 0 1 1 26 16 v12 h-16 v-12 a18 18 0 0 1 -10 -16 M342 176 h12", color: "#EF9F27", delay: 3 },
    { d: "M322 112 l-6 -8 M348 104 v-10 M374 112 l6 -8", color: "#D4537E", delay: 3.6 },
  ];
  return (
    <div className="desk-scene" aria-hidden="true">
      <svg viewBox="0 0 440 200" className="desk-scene-svg">
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2}>
          {strokes.map((s, i) => <path key={i} d={s.d} stroke={s.color} pathLength={1} className="desk-scene-stroke" style={{ animationDelay: `${s.delay}s` }} />)}
        </g>
      </svg>
    </div>
  );
}
