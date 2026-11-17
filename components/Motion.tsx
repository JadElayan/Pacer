"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

const motionOff = (reduced?: boolean) => reduced || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/**
 * Opens and closes by animating its height, so whatever sits below slides smoothly instead of jumping.
 * Children stay rendered while closing; overflow is clipped only while it moves, so popups inside still show.
 */
export function Collapse({ open, reduced, className = "", innerClassName = "", children }: {
  open: boolean; reduced?: boolean; className?: string; innerClassName?: string; children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  const [settled, setSettled] = useState(open);
  const last = useRef(children);
  if (open) last.current = children;
  useLayoutEffect(() => {
    if (motionOff(reduced)) { setMounted(open); setExpanded(open); setSettled(open); return; }
    setSettled(false);
    // Finish even if transitionend never fires (background tab, interrupted transition).
    const done = window.setTimeout(() => { if (open) { setExpanded(true); setSettled(true); } else setMounted(false); }, 450);
    if (!open) { setExpanded(false); return () => window.clearTimeout(done); }
    setMounted(true);
    // Paint the closed state first so the browser has something to animate from.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setExpanded(true)); });
    return () => { cancelAnimationFrame(frame); window.clearTimeout(done); };
  }, [open, reduced]);
  if (!mounted) return null;
  return <div className={`collapse-motion ${className}`} data-open={expanded} data-settled={settled} inert={!open}
    onTransitionEnd={(event) => {
      if (event.target !== event.currentTarget || event.propertyName !== "grid-template-rows") return;
      if (expanded) setSettled(true); else setMounted(false);
    }}>
    <div className={innerClassName}>{open ? children : last.current}</div>
  </div>;
}

/**
 * A segmented control like iOS: a thumb slides to the chosen option. Click an option, or press and drag
 * the thumb across the options and let go to choose.
 */
export function SegmentedControl<T extends string>({ label, options, value, disabled, onChange }: {
  label: string; options: readonly { value: T; label: string; icon?: ReactNode }[]; value: T; disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  const shown = drag ?? selected;
  const indexAt = (x: number) => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return selected;
    const width = (box.width - 8) / options.length;
    return Math.min(options.length - 1, Math.max(0, Math.floor((x - box.left - 4) / width)));
  };
  const choose = (index: number) => { if (options[index] && index !== selected) onChange(options[index].value); };
  const keys = (event: KeyboardEvent) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step || disabled) return;
    event.preventDefault();
    const next = (selected + step + options.length) % options.length;
    choose(next);
    root.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };
  return <div ref={root} role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className="segmented"
    data-dragging={drag !== null} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    onKeyDown={keys}
    onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag(indexAt(event.clientX));
    }}
    onPointerMove={(event) => { if (drag !== null) setDrag(indexAt(event.clientX)); }}
    onPointerUp={() => { if (drag !== null) choose(drag); setDrag(null); }}
    onPointerCancel={() => setDrag(null)}
    onLostPointerCapture={() => setDrag(null)}>
    <span aria-hidden="true" className="segmented-thumb"
      style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${shown * 100}%)` }} />
    {options.map((option, index) => (
      <button key={option.value} type="button" role="radio" aria-checked={index === selected} data-under={index === shown}
        tabIndex={index === selected ? 0 : -1} disabled={disabled}
        // Pointer presses are handled above (so the thumb can be dragged); this handles Enter and Space.
        onClick={(event) => { if (event.detail === 0) choose(index); }}>
        {option.icon}{option.label}
      </button>
    ))}
  </div>;
}

/** A tool group whose highlight slides to the active tool instead of jumping. */
export function ToolGroup({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number; on: boolean; jump: boolean }>();
  useLayoutEffect(() => {
    const group = ref.current;
    if (!group) return;
    const update = () => {
      const active = group.querySelector<HTMLElement>(':scope > button:is([aria-pressed="true"], [aria-expanded="true"])');
      setBox((prev) => {
        if (!active) return prev && prev.on ? { ...prev, on: false, jump: false } : prev;
        const next = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight, on: true,
          // Appearing in a group that had no active tool: place it without sliding in from the old spot.
          jump: !prev?.on };
        return prev && prev.on === next.on && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next;
      });
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(group);
    const attributes = new MutationObserver(update);
    attributes.observe(group, { subtree: true, attributes: true, attributeFilter: ["aria-pressed", "aria-expanded"] });
    return () => { resize.disconnect(); attributes.disconnect(); };
  }, []);
  useEffect(() => {
    if (!box?.jump) return;
    const frame = requestAnimationFrame(() => setBox((prev) => prev && { ...prev, jump: false }));
    return () => cancelAnimationFrame(frame);
  }, [box?.jump]);
  return <div ref={ref} className="notebook-tool-group tool-group-slide">
    {box && <span aria-hidden="true" className="tool-slider" data-on={box.on} data-jump={box.jump}
      style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }} />}
    {children}
  </div>;
}
