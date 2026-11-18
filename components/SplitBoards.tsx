"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { runViewTransition } from "./Motion";

type Arrangement = "side" | "stacked";
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* not saved */ } };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Slide and whiteboard together. Side by side when there is room, stacked (slide on top) when the column is narrow
 * or the student's notebook is open; a person can pin either. A handle between the panes resizes them (double-click
 * resets). Side by side, the whiteboard matches the slide's height so the two line up. Phones use tabs instead.
 */
export function SplitBoards({ slide, board, activeSide, onSide, preferStacked }: {
  slide: (maxHeight: string) => ReactNode; board: ReactNode;
  activeSide: "slide" | "board"; onSide: (side: "slide" | "board") => void; preferStacked: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const slidePane = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  const [slideHeight, setSlideHeight] = useState(0);
  const [pinned, setPinned] = useState<Arrangement | null>(null);
  const [sideRatio, setSideRatio] = useState(.5);
  const [stackRatio, setStackRatio] = useState(.45);
  useEffect(() => {
    const saved = read("pacer:split-arrangement");
    if (saved === "side" || saved === "stacked") setPinned(saved);
    const side = Number(read("pacer:split-side")), stack = Number(read("pacer:split-stack"));
    if (side) setSideRatio(clamp(side, .3, .7));
    if (stack) setStackRatio(clamp(stack, .25, .7));
  }, []);
  useLayoutEffect(() => {
    const el = root.current, pane = slidePane.current;
    if (!el) return;
    const resize = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      setSlideHeight(pane?.querySelector<HTMLElement>(":scope > *")?.getBoundingClientRect().height ?? 0);
    });
    resize.observe(el);
    if (pane) resize.observe(pane);
    return () => resize.disconnect();
  }, []);
  const wanted: Arrangement = pinned ?? (preferStacked || (width > 0 && width < 980) ? "stacked" : "side");
  // The layout on screen follows `wanted` inside a view transition, so the slide and whiteboard glide to their new
  // places (and sizes) instead of jumping. The toggle's thumb moves at once.
  const [arrangement, setArrangement] = useState<Arrangement>(wanted);
  const reduced = () => !!root.current?.closest('[data-reduce-motion="true"]');
  useLayoutEffect(() => {
    if (wanted === arrangement) return;
    // The first measurement only settles the starting layout; nothing to animate yet.
    if (!width) { setArrangement(wanted); return; }
    runViewTransition(() => setArrangement(wanted), { reduced: reduced() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  const pin = (next: Arrangement) => { setPinned(next); write("pacer:split-arrangement", next); };

  const drag = useRef<{ id: number } | null>(null);
  const move = (x: number, y: number) => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    if (arrangement === "side") setSideRatio(clamp((x - box.left) / box.width, .3, .7));
    else setStackRatio(clamp((y - box.top) / window.innerHeight, .25, .7));
  };
  const finish = () => {
    if (!drag.current) return;
    drag.current = null;
    write("pacer:split-side", String(sideRatio));
    write("pacer:split-stack", String(stackRatio));
  };

  const stacked = arrangement === "stacked";
  const slideMax = stacked ? `${Math.round(stackRatio * 100)}dvh` : "64dvh";
  return (
    <div ref={root} className="board-split" data-arrangement={arrangement}
      style={{ ["--split-cols" as string]: `minmax(0, ${sideRatio}fr) 14px minmax(0, ${1 - sideRatio}fr)`, ["--board-h" as string]: slideHeight ? `${slideHeight + 16}px` : "auto" }}>
      <div role="tablist" aria-label="Split view side" className="board-split-tabs">
        {([["slide", "Slide"], ["board", "Whiteboard"]] as const).map(([side, label]) => (
          <button key={side} type="button" role="tab" aria-selected={activeSide === side} onClick={() => onSide(side)}>{label}</button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Split arrangement" className="board-split-arrange" data-value={wanted}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          const next = wanted === "side" ? "stacked" : "side";
          pin(next);
          event.currentTarget.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
        }}>
        <span aria-hidden="true" className="board-split-arrange-thumb" />
        {([["side", "Side by side"], ["stacked", "Stacked"]] as const).map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={wanted === value} data-value={value} tabIndex={wanted === value ? 0 : -1} title={label} aria-label={label} onClick={() => pin(value)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">{value === "side"
              ? <><rect x="1.5" y="3" width="5.5" height="10" rx="1" /><rect x="9" y="3" width="5.5" height="10" rx="1" /></>
              : <><rect x="2.5" y="1.5" width="11" height="5.5" rx="1" /><rect x="2.5" y="9" width="11" height="5.5" rx="1" /></>}</svg>
          </button>
        ))}
      </div>
      <section ref={slidePane} aria-label="Slide" className="board-split-pane" style={{ viewTransitionName: "pacer-slide" }} data-active={activeSide === "slide"}
        onPointerDownCapture={() => onSide("slide")} onFocusCapture={() => onSide("slide")}>
        {slide(slideMax)}
      </section>
      <div role="separator" aria-orientation={stacked ? "horizontal" : "vertical"} aria-label="Resize slide and whiteboard" tabIndex={0}
        aria-valuemin={stacked ? 25 : 30} aria-valuemax={70} aria-valuenow={Math.round((stacked ? stackRatio : sideRatio) * 100)}
        className="board-split-handle"
        onPointerDown={(event) => { if (event.button !== 0) return; drag.current = { id: event.pointerId }; try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ } }}
        onPointerMove={(event) => { if (drag.current?.id === event.pointerId) move(event.clientX, event.clientY); }}
        onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
        onDoubleClick={() => { if (stacked) setStackRatio(.45); else setSideRatio(.5); write(stacked ? "pacer:split-stack" : "pacer:split-side", stacked ? ".45" : ".5"); }}
        onKeyDown={(event) => {
          const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -.05 : event.key === "ArrowRight" || event.key === "ArrowDown" ? .05 : 0;
          if (!step) return;
          event.preventDefault();
          if (stacked) setStackRatio((r) => { const next = clamp(r + step, .25, .7); write("pacer:split-stack", String(next)); return next; });
          else setSideRatio((r) => { const next = clamp(r + step, .3, .7); write("pacer:split-side", String(next)); return next; });
        }}>
        <span aria-hidden="true" />
      </div>
      <section aria-label="Whiteboard" className="board-split-pane" style={{ viewTransitionName: "pacer-board" }}
        data-active={activeSide === "board"} onPointerDownCapture={() => onSide("board")} onFocusCapture={() => onSide("board")}>
        {board}
      </section>
    </div>
  );
}
