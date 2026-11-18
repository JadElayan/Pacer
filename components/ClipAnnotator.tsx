"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { INK_COLORS, type InkPage, type InkTool } from "@/lib/ink";
import { InkCanvas } from "./InkCanvas";
import { LiquidSwatches } from "./LiquidSwatches";

/**
 * A large view of one clip for writing over it, opened by double-clicking the clip in your notes.
 * The picture keeps the same proportions as the clip in the notes, so the writing lines up in both places.
 */
export function ClipAnnotator({ image, label, aspect, page, onChange, onClose }: {
  image: string; label: string; aspect: number; page: InkPage;
  onChange: (page: InkPage) => void; onClose: () => void;
}) {
  const [tool, setTool] = useState<InkTool>({ kind: "pen", color: INK_COLORS[0][1] });
  const [current, setCurrent] = useState(page);
  const history = useRef<InkPage[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => { done.current?.focus(); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = overflow; };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (next: InkPage) => {
    history.current = [...history.current.slice(-49), current];
    setCanUndo(true); setCurrent(next); onChange(next);
  };
  const undo = () => {
    const last = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (last) { setCurrent(last); onChange(last); }
  };
  // Fit the picture in the window at the clip's proportions.
  const fit = { width: `min(92vw, 1100px, calc((100dvh - 170px) / ${aspect}))`, aspectRatio: `1 / ${aspect}` };

  return createPortal(<div className="clip-annotator" role="dialog" aria-modal="true" aria-label={`Write on ${label}`} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="clip-annotator-bar" role="toolbar" aria-label="Pen">
      <span className="clip-annotator-title">{label}</span>
      <LiquidSwatches label="Pen color" colors={INK_COLORS} value={tool.color} dot={18} onChange={(color) => setTool({ kind: "pen", color })} />
      <span className="nb-format-sep" aria-hidden="true" />
      <button type="button" className="connector-tool" aria-pressed={tool.kind === "highlighter"} title="Highlighter" aria-label="Highlighter"
        onClick={() => setTool((t) => ({ ...t, kind: t.kind === "highlighter" ? "pen" : "highlighter" }))}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 15 3-1 8-8-2-2-8 8z M11 6l2 2 M4 17h7" /></svg>
      </button>
      <button type="button" className="connector-tool" aria-pressed={tool.kind === "eraser"} title="Eraser: touch a line to remove it" aria-label="Eraser"
        onClick={() => setTool((t) => ({ ...t, kind: t.kind === "eraser" ? "pen" : "eraser" }))}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 16 8.5-8.5-4-4L3 13l3 3h10 M6.5 9.5l4 4" /></svg>
      </button>
      <button type="button" className="connector-tool" title="Undo" aria-label="Undo" disabled={!canUndo} onClick={undo}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5 3.5 8.5 7 12 M4 8.5h8a4 4 0 0 1 0 8H9" /></svg>
      </button>
      <button ref={done} type="button" className="btn btn-primary btn-sm ml-auto" onClick={onClose}>Done</button>
    </div>
    <div className="clip-annotator-stage" style={fit}>
      <img src={image} alt="" draggable={false} />
      <InkCanvas fill page={current} editable tool={tool} label={`Your writing on ${label}`} onChange={change} />
    </div>
    <p className="clip-annotator-hint">Write anywhere on the picture. It saves as you go. Esc or Done closes.</p>
  </div>, document.body);
}
