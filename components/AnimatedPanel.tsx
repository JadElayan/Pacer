"use client";

import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** React context also reaches portaled children, whose DOM escapes the animation wrapper. */
export const PanelOpenContext = createContext(true);

export function AnimatedPanel({ open, motion = "rise", reduced, children }: {
  open: boolean;
  motion?: "rise" | "drawer" | "dialog" | "side" | "pop";
  reduced: boolean;
  children: ReactNode;
}) {
  const [retain, setRetain] = useState(open);
  const previous = useRef(children);
  useLayoutEffect(() => {
    if (open) {
      previous.current = children;
      setRetain(true);
    }
  }, [open, children]);
  useLayoutEffect(() => {
    if (open || !retain) return;
    if (reduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRetain(false);
      return;
    }
    const timer = window.setTimeout(() => setRetain(false), 170);
    return () => window.clearTimeout(timer);
  }, [open, retain, reduced]);

  if (!open && (!retain || reduced)) return null;
  return <PanelOpenContext.Provider value={open}><div className="panel-motion" data-motion={motion} data-open={open} inert={!open} aria-hidden={!open || undefined}>
    {open ? children : previous.current}
  </div></PanelOpenContext.Provider>;
}
