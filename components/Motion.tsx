"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";

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
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
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

  // Press a tool and drag along the group: the highlight follows, and letting go picks the tool under it.
  const press = useRef<{ x: number; y: number; id: number; dragging: boolean }>(undefined);
  const [hover, setHover] = useState<HTMLButtonElement | null>(null);
  const suppressClick = useRef(false);
  const [hoverFresh, setHoverFresh] = useState(false);
  useEffect(() => {
    if (!hoverFresh) return;
    const frame = requestAnimationFrame(() => setHoverFresh(false));
    return () => cancelAnimationFrame(frame);
  }, [hoverFresh]);
  useEffect(() => {
    hover?.setAttribute("data-drag-over", "");
    return () => hover?.removeAttribute("data-drag-over");
  }, [hover]);
  const nearest = (x: number, y: number) => {
    let best: HTMLButtonElement | null = null; let bestDistance = Infinity;
    ref.current?.querySelectorAll<HTMLButtonElement>(":scope > button:not(:disabled)").forEach((button) => {
      const r = button.getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right); const dy = Math.max(r.top - y, 0, y - r.bottom);
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) { bestDistance = distance; best = button; }
    });
    return best as HTMLButtonElement | null;
  };
  useEffect(() => {
    const release = () => { window.setTimeout(() => { press.current = undefined; setHover(null); }, 0); };
    window.addEventListener("pointerup", release);
    window.addEventListener("blur", release);
    return () => { window.removeEventListener("pointerup", release); window.removeEventListener("blur", release); };
  }, []);
  const shown = hover ? { x: hover.offsetLeft, y: hover.offsetTop, w: hover.offsetWidth, h: hover.offsetHeight, on: true, jump: hoverFresh } : box;
  return <div ref={ref} className="notebook-tool-group tool-group-slide" data-dragging={!!hover}
    onPointerDown={(event) => {
      if (event.button !== 0 || !(event.target as HTMLElement).closest("button:not(:disabled)")) return;
      press.current = { x: event.clientX, y: event.clientY, id: event.pointerId, dragging: false };
    }}
    onPointerMove={(event) => {
      const p = press.current;
      if (!p || p.id !== event.pointerId) return;
      // The button was released somewhere we didn't hear about: this is a hover, not a drag.
      if (!(event.buttons & 1)) { press.current = undefined; setHover(null); return; }
      if (!p.dragging) {
        if (Math.hypot(event.clientX - p.x, event.clientY - p.y) < 6) return;
        p.dragging = true;
        setHoverFresh(!box?.on);
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
      }
      setHover(nearest(event.clientX, event.clientY));
    }}
    onPointerUp={(event) => {
      const p = press.current;
      press.current = undefined;
      if (!p?.dragging) return;
      const target = nearest(event.clientX, event.clientY);
      setHover(null);
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      if (target && target.getAttribute("aria-pressed") !== "true" && target.getAttribute("aria-expanded") !== "true") target.click();
    }}
    onPointerCancel={() => { press.current = undefined; setHover(null); }}
    onLostPointerCapture={() => { if (!press.current) setHover(null); }}
    onClickCapture={(event) => {
      // The click that follows a drag would land on the tool where the drag started.
      if (suppressClick.current && event.isTrusted) { event.preventDefault(); event.stopPropagation(); }
    }}>
    {shown && <span aria-hidden="true" className="tool-slider" data-on={shown.on} data-jump={shown.jump}
      style={{ width: shown.w, height: shown.h, transform: `translate(${shown.x}px, ${shown.y}px)` }} />}
    {children}
  </div>;
}

/**
 * When the children of an element jump to a new spot (a row wraps, something above grows), glide them
 * there instead (FLIP). Small, continuous moves, like a width that is already animating, are left alone.
 * Returns a callback ref, so it attaches whenever the element appears.
 */
export function useFlip(selector = ":scope > *") {
  return useCallback((root: HTMLElement | null) => {
    if (!root) return;
    const last = new Map<HTMLElement, { x: number; y: number }>();
    const quiet = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
      || !!document.querySelector('[data-reduce-motion="true"]') || document.documentElement.hasAttribute("data-view-transition");
    const measure = () => {
      const items = [...root.querySelectorAll<HTMLElement>(selector)];
      const skip = quiet();
      for (const el of items) {
        const now = { x: el.offsetLeft, y: el.offsetTop };
        const before = last.get(el);
        last.set(el, now);
        if (!before || skip || !el.offsetParent) continue;
        const dx = before.x - now.x, dy = before.y - now.y;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 14) continue;
        el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: 420, easing: "cubic-bezier(.22, .9, .25, 1)" });
      }
      for (const el of [...last.keys()]) if (!items.includes(el)) last.delete(el);
    };
    const resize = new ResizeObserver(measure);
    const watch = () => { resize.observe(root); root.querySelectorAll<HTMLElement>(selector).forEach((el) => resize.observe(el)); };
    const children = new MutationObserver(() => { watch(); measure(); });
    children.observe(root, { childList: true });
    watch();
    measure();
    return () => { resize.disconnect(); children.disconnect(); };
  }, [selector]);
}

/**
 * Runs a React state change inside a view transition, so the old screen morphs into the new one.
 * Elements with a `view-transition-name` glide between their old and new spots; the rest cross-fades.
 * `settle` can delay the "after" snapshot briefly (for example until an image decodes).
 * Falls back to an instant change without the API or under reduced motion.
 */
export function runViewTransition(update: () => void, { reduced, settle }: { reduced?: boolean; settle?: () => Promise<unknown> } = {}) {
  const doc = document as Document & { startViewTransition?: (update: () => void | Promise<void>) => { finished?: Promise<void>; ready?: Promise<void> } };
  // A hidden page can't animate (the browser would abort the transition), so just apply the change.
  if (!doc.startViewTransition || motionOff(reduced) || document.hidden) { update(); return; }
  // Tells useFlip to stay out of the way while the browser animates.
  document.documentElement.setAttribute("data-view-transition", "");
  const transition = doc.startViewTransition(async () => {
    flushSync(update);
    if (settle) await Promise.race([settle(), new Promise((done) => setTimeout(done, 250))]);
  });
  const done = () => window.setTimeout(() => document.documentElement.removeAttribute("data-view-transition"), 50);
  // A skipped transition rejects "ready"; the state change itself still happened, so there is nothing to report.
  transition?.ready?.catch(() => {});
  if (transition?.finished) transition.finished.then(done, done); else done();
}

/** Fades and lifts its content in the first time it scrolls into view. `delay` (ms) staggers siblings. */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: {
  children: ReactNode; delay?: number; className?: string; as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (motionOff() || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setShown(true); observer.disconnect(); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <Tag ref={ref as never} className={`reveal ${className}`} data-shown={shown} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>{children}</Tag>;
}
