"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";

/**
 * Color swatches where the selection is a drop of paint: choosing a color sends the drop flowing to it, blending
 * from the old color to the new one on the way, and the swatches it passes merge with it like water (an SVG "goo"
 * filter). A ripple marks where it lands. Press and slide along the row to sweep through colors. Once it settles,
 * a crisp dot (outside the filter) shows the choice, exactly centred in its ring. Motion turns off under reduced
 * motion; the choice itself is instant.
 */
export function LiquidSwatches({ label, colors, value, onChange, dot = 20 }: {
  label: string; colors: readonly (readonly string[])[]; value: string; onChange: (color: string) => void; dot?: number;
}) {
  const filter = `goo${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const root = useRef<HTMLDivElement>(null);
  const [centers, setCenters] = useState<number[]>([]);
  const index = Math.max(0, colors.findIndex(([, color]) => color === value));
  const [ripple, setRipple] = useState(0);
  const previous = useRef(index);
  const [moving, setMoving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setCenters([...el.querySelectorAll<HTMLElement>(":scope > button")].map((b) => b.offsetLeft + b.offsetWidth / 2));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [colors.length]);
  useLayoutEffect(() => {
    if (previous.current === index) return;
    previous.current = index;
    setMoving(true);
    setRipple((n) => n + 1);
    const done = window.setTimeout(() => setMoving(false), 520);
    return () => window.clearTimeout(done);
  }, [index]);

  /** The swatch nearest to a pointer position. */
  const nearest = (clientX: number) => {
    const box = root.current?.getBoundingClientRect();
    if (!box || !centers.length) return index;
    const x = clientX - box.left;
    return centers.reduce((best, c, i) => (Math.abs(c - x) < Math.abs(centers[best] - x) ? i : best), 0);
  };
  const choose = (i: number) => { const color = colors[i]?.[1]; if (color && color !== value) onChange(color); };

  const x = centers[index] ?? 0;
  const color = colors[index]?.[1];
  return <div ref={root} role="group" aria-label={label} className="liquid-swatches" style={{ ["--dot" as string]: `${dot}px` }}
    data-moving={moving || undefined} data-dragging={dragging || undefined}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      drag.current = { id: event.pointerId, moved: false };
    }}
    onPointerMove={(event) => {
      const d = drag.current;
      if (!d || d.id !== event.pointerId) return;
      if (!d.moved) {
        d.moved = true;
        setDragging(true);
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
      }
      choose(nearest(event.clientX));
    }}
    onPointerUp={() => { drag.current = null; setDragging(false); }}
    onPointerCancel={() => { drag.current = null; setDragging(false); }}
    onKeyDown={(event) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = (index + step + colors.length) % colors.length;
      choose(next);
      root.current?.querySelectorAll<HTMLElement>(":scope > button")[next]?.focus();
    }}>
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <filter id={filter} x="-20%" y="-60%" width="140%" height="220%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
        <feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo" />
        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
      </filter>
    </svg>
    {centers.length > 0 && <>
      <span aria-hidden="true" className="liquid-layer" style={{ filter: `url(#${filter})` }}>
        {colors.map(([name, c], i) => <span key={name} className="liquid-dot" style={{ left: centers[i], background: c }} />)}
        <span className="liquid-blob" style={{ translate: `${x}px 0`, background: color }} />
      </span>
      <span aria-hidden="true" className="liquid-cap" style={{ translate: `${x}px 0`, background: color }} />
      <span aria-hidden="true" className="liquid-ring" style={{ translate: `${x}px 0` }} />
      {ripple > 0 && <span key={ripple} aria-hidden="true" className="liquid-ripple" style={{ left: x, borderColor: color }} />}
    </>}
    {colors.map(([name, c], i) => <button key={name} type="button" aria-label={name} title={name} aria-pressed={c === value}
      tabIndex={i === index ? 0 : -1}
      onClick={() => { if (!drag.current?.moved) choose(i); }}>
      {/* Before measuring, a plain dot keeps the swatch visible. */}
      {!centers.length && <span aria-hidden="true" style={{ background: c }} />}
    </button>)}
  </div>;
}
