"use client";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PREFS, Mode, Prefs } from "./types";

const KEY = "pacer:prefs";
const EVENT = "pacer:prefs";
const announce = () => queueMicrotask(() => window.dispatchEvent(new Event(EVENT)));
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  // Every component using prefs re-reads them when one changes them, so a Settings switch applies at once.
  useEffect(() => {
    const read = () => { try { const v = localStorage.getItem(KEY); setPrefs(v ? { ...DEFAULT_PREFS, ...JSON.parse(v) } : DEFAULT_PREFS); } catch { /* ignore */ } };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  useEffect(() => {
    document.documentElement.style.fontSize = `${prefs.textSize}%`;
    document.documentElement.dataset.reduceMotion = String(prefs.reduceMotion);
  }, [prefs.textSize, prefs.reduceMotion]);
  const update = useCallback((p: Partial<Prefs>) => setPrefs((cur) => { const n = { ...cur, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); announce(); } catch { /* ignore */ } return n; }), []);
  const reset = useCallback(() => { setPrefs(DEFAULT_PREFS); try { localStorage.removeItem(KEY); announce(); } catch { /* ignore */ } }, []);
  const score = useCallback((m: Mode, d: number) => setPrefs((cur) => { const n = { ...cur, scores: { ...cur.scores, [m]: cur.scores[m] + d } }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; }), []);
  return { prefs, update, reset, score };
}
