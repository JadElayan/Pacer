"use client";
import { useRef, useState } from "react";
import type { Block, Stroke } from "@/lib/types";
import { MathView } from "./MathView";

export interface Rect { left: number; top: number; right: number; bottom: number }
export interface Anchor { ids: string[]; rect: Rect; source: "block" | "snip" }

export function Whiteboard({ boardRef, blocks, strokes, isTeacher, selectedIds, onSelect, snipActive, onSnip, penActive, onStroke, onDelete, children }: {
  boardRef: React.RefObject<HTMLDivElement | null>; blocks: Block[]; strokes: Stroke[]; isTeacher: boolean; selectedIds: string[];
  onSelect: (a: Anchor) => void; snipActive: boolean; onSnip: (a: Anchor | null) => void; penActive: boolean;
  onStroke: (pts: [number, number][]) => void; onDelete: (id: string) => void; children?: React.ReactNode;
}) {
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [live, setLive] = useState<[number, number][] | null>(null);
  const rel = (r: DOMRect | Rect): Rect => {
    const b = boardRef.current!.getBoundingClientRect();
    return { left: r.left - b.left, top: r.top - b.top, right: r.right - b.left, bottom: r.bottom - b.top };
  };

  const finishSnip = () => {
    if (!drag || !boardRef.current) return;
    const b = boardRef.current.getBoundingClientRect();
    const box = { left: Math.min(drag.x0, drag.x1), right: Math.max(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), bottom: Math.max(drag.y0, drag.y1) };
    setDrag(null);
    if (box.right - box.left < 10 || box.bottom - box.top < 10) { onSnip(null); return; }
    const ids: string[] = [];
    boardRef.current.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.left < box.right + b.left && r.right > box.left + b.left && r.top < box.bottom + b.top && r.bottom > box.top + b.top) ids.push(el.dataset.blockId!);
    });
    onSnip({ ids, rect: box, source: "snip" });
  };
  const pt = (e: React.PointerEvent) => { const b = boardRef.current!.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height] as [number, number]; };
  const path = (p: [number, number][]) => p.map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join(" ");

  return (
    <div ref={boardRef} className="relative min-h-[440px] flex-1">
      <div className="absolute inset-0 overflow-hidden rounded-[24px] border border-stone bg-taupe">
        <div className="absolute inset-0 overflow-auto p-5 md:p-8" role="region" aria-label="Whiteboard" tabIndex={0}>
          {blocks.length === 0 && <p className="grid h-full place-items-center text-center text-smoke">{isTeacher ? "Add your first note below. It appears on every student's screen." : "Waiting for your teacher to write something…"}</p>}
          <div className="space-y-4">
            {blocks.map((b) => {
              const sel = selectedIds.includes(b.id);
              return (
                <div key={b.id} data-block-id={b.id} role="button" tabIndex={0} aria-pressed={sel}
                  aria-label={`${b.kind === "equation" ? "Equation" : "Note"}: ${b.content}. Press Enter to ask about this.`}
                  onClick={(e) => onSelect({ ids: [b.id], rect: rel(e.currentTarget.getBoundingClientRect()), source: "block" })}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect({ ids: [b.id], rect: rel(e.currentTarget.getBoundingClientRect()), source: "block" }); } }}
                  className={`block-card group relative cursor-pointer rounded-[20px] border bg-eggshell px-5 py-4 transition ${sel ? "border-sky shadow-[0_0_0_3px_var(--color-sky-soft)]" : "border-stone hover:border-ash"}`}>
                  {b.kind === "equation" ? <div className="text-2xl md:text-3xl"><MathView tex={b.content} /></div> : <p className="text-xl leading-snug">{b.content}</p>}
                  {isTeacher && <button aria-label="Delete note" className="btn btn-outline btn-sm absolute right-2 top-2 opacity-0 focus:opacity-100 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}>Delete</button>}
                </div>
              );
            })}
          </div>
        </div>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" style={{ pointerEvents: penActive && isTeacher ? "auto" : "none", cursor: penActive ? "crosshair" : undefined, touchAction: penActive ? "none" : undefined }}
          onPointerDown={(e) => { if (!penActive) return; (e.target as Element).setPointerCapture?.(e.pointerId); setLive([pt(e)]); }}
          onPointerMove={(e) => { if (live) setLive([...live, pt(e)]); }}
          onPointerUp={() => { if (live && live.length > 1) onStroke(live); setLive(null); }}>
          {[...strokes.map((s) => s.pts), ...(live ? [live] : [])].map((p, i) => <path key={i} d={path(p)} fill="none" stroke="#000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
        </svg>
        {snipActive && (
          <div className="absolute inset-0 z-20 cursor-crosshair bg-black/5" style={{ touchAction: "none" }} aria-label="Drag to draw a box around what you want explained"
            onPointerDown={(e) => { const b = boardRef.current!.getBoundingClientRect(); const x = e.clientX - b.left, y = e.clientY - b.top; (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ x0: x, y0: y, x1: x, y1: y }); }}
            onPointerMove={(e) => { if (!drag) return; const b = boardRef.current!.getBoundingClientRect(); setDrag({ ...drag, x1: e.clientX - b.left, y1: e.clientY - b.top }); }}
            onPointerUp={finishSnip} onKeyDown={(e) => e.key === "Escape" && onSnip(null)}>
            {drag && <div className="absolute rounded-lg border-2 border-sky bg-sky/15" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} />}
            {!drag && <p className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white">Drag a box around what you want explained</p>}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
