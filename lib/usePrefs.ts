"use client";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PREFS, Mode, Prefs } from "./types";

const KEY = "pacer:prefs";
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => { try { const v = localStorage.getItem(KEY); if (v) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(v) }); } catch { /* ignore */ } }, []);
  useEffect(() => {
    document.documentElement.style.fontSize = `${prefs.textSize}%`;
    document.documentElement.dataset.reduceMotion = String(prefs.reduceMotion);
  }, [prefs.textSize, prefs.reduceMotion]);
  const update = useCallback((p: Partial<Prefs>) => setPrefs((cur) => { const n = { ...cur, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; }), []);
  const reset = useCallback(() => { setPrefs(DEFAULT_PREFS); try { localStorage.removeItem(KEY); } catch { /* ignore */ } }, []);
  const score = useCallback((m: Mode, d: number) => setPrefs((cur) => { const n = { ...cur, scores: { ...cur.scores, [m]: cur.scores[m] + d } }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; }), []);
  return { prefs, update, reset, score };
}
