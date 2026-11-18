"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { HIGHLIGHT, INK_WIDTH, drawInk, packPoint, touches, type InkPage, type InkStroke, type InkTool } from "@/lib/ink";

/** Once a pen has touched any ink canvas, fingers scroll instead of drawing (palm rejection). Shared by every canvas. */
const markPen = () => { document.documentElement.dataset.pen = "true"; };
const penSeen = () => document.documentElement.dataset.pen === "true";

/**
 * A surface you write on with a pen, finger or mouse. It fills its parent's width; its height comes from the parent
 * (`fill`, used over a clip's picture) or from the page's height (`h`, used for a notebook page). Pen pressure sets
 * the line width. Changes are reported once per stroke.
 */
export function InkCanvas({ page, editable, tool, fill, label, onChange }: {
  page: InkPage; editable: boolean; tool: InkTool; fill?: boolean; label: string;
  onChange: (page: InkPage) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<InkStroke[]>(page.s);
  const live = useRef<InkStroke | null>(null);
  const erasing = useRef(false);
  const frame = useRef(0);
  useEffect(() => { if (!live.current && !erasing.current) { strokes.current = page.s; paint(); } });

  const paint = () => {
    const el = canvas.current, ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    drawInk(ctx, live.current ? [...strokes.current, live.current] : strokes.current, el.width);
  };
  const schedule = () => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(paint); };
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const size = () => {
      const box = el.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
      if (w && h && (el.width !== w || el.height !== h)) { el.width = w; el.height = h; paint(); }
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(frame.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (event: { clientX: number; clientY: number; pressure: number; pointerType: string }) => {
    const box = canvas.current!.getBoundingClientRect();
    const k = INK_WIDTH / box.width;
    return packPoint((event.clientX - box.left) * k, (event.clientY - box.top) * k, event.pointerType === "pen" ? (event.pressure || .5) : .5);
  };
  const erase = (x: number, y: number) => {
    const kept = strokes.current.filter((stroke) => !touches(stroke, x, y, 10));
    if (kept.length !== strokes.current.length) { strokes.current = kept; schedule(); }
  };

  return <canvas ref={canvas} className="ink-canvas" data-editable={editable || undefined} data-tool={editable ? tool.kind : undefined}
    role="img" aria-label={label}
    style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : { width: "100%", aspectRatio: `${INK_WIDTH} / ${page.h}` }}
    onPointerDown={(event) => {
      if (!editable) return;
      if (event.pointerType === "pen") markPen();
      if (event.pointerType === "touch" && penSeen()) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
      const [x, y, p] = point(event);
      if (tool.kind === "eraser") { erasing.current = true; erase(x, y); return; }
      live.current = tool.kind === "highlighter" ? { c: HIGHLIGHT, w: 22, a: .4, p: [x, y, p] } : { c: tool.color, w: 3.2, p: [x, y, p] };
      schedule();
    }}
    onPointerMove={(event) => {
      if (!live.current && !erasing.current) return;
      const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
      for (const e of events.length ? events : [event.nativeEvent]) {
        const [x, y, p] = point(e);
        if (erasing.current) erase(x, y);
        else if (live.current) {
          const q = live.current.p, n = q.length;
          // Skip points that barely moved: they add size without changing the line.
          if (Math.abs(q[n - 3] - x) + Math.abs(q[n - 2] - y) >= .8) q.push(x, y, p);
        }
      }
      schedule();
    }}
    onPointerUp={() => {
      if (erasing.current) { erasing.current = false; if (strokes.current !== page.s) onChange({ ...page, s: strokes.current }); return; }
      const done = live.current;
      if (!done) return;
      live.current = null;
      strokes.current = [...strokes.current, done];
      paint();
      onChange({ ...page, s: strokes.current });
    }}
    onPointerCancel={() => { live.current = null; erasing.current = false; strokes.current = page.s; paint(); }} />;
}
