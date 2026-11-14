"use client";
import { useEffect, useRef, useState } from "react";
import { GraphView, type GraphData } from "./GraphView";
import { RichText } from "./RichText";
import { QuizView, type QuizData } from "./QuizView";
import { VisualView, type VisualData } from "./VisualView";
import type { Rect } from "./Whiteboard";

export interface Msg { role: "user" | "assistant"; text: string; source?: "ai" | "demo"; view?: { type: "graph" | "visual" | "quiz"; data: unknown } }
const TOOLS = [
  { kind: "snip", label: "Explain in depth", desc: "Why it works, plus a related idea" },
  { kind: "graph", label: "Graph it", desc: "Plot the equation and see the solution" },
  { kind: "visual", label: "Visualize it", desc: "Balance-scale steps" },
  { kind: "quiz", label: "Quiz me", desc: "A private practice question" },
];

const CHIPS: { label: string; kind: string; guided?: boolean }[] = [
  { label: "Explain this", kind: "explain" }, { label: "Why this step?", kind: "why" }, { label: "Simplify", kind: "simplify" },
  { label: "Give an example", kind: "example" }, { label: "Step by step", kind: "explain", guided: true },
];

export function AskPanel({ rect, boardW, boardH, excerpt, basedOn, msgs, loading, error, empty, suggestion, onSend, onQuiz, onClose, onFeedback, fed }: {
  rect: Rect; boardW: number; boardH: number; excerpt: string; basedOn: string; msgs: Msg[]; loading: boolean; error: string; empty: boolean; suggestion: string;
  onSend: (kind: string, q?: string, guided?: boolean) => void; onQuiz: (correct: boolean) => void; onClose: () => void; onFeedback: (k: "helped" | "confused" | "another") => void; fed: string;
}) {
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const lastRef = useRef<HTMLDivElement>(null);
  useEffect(() => { lastRef.current?.scrollIntoView({ block: "start", behavior: "auto" }); }, [msgs.length]);
  const W = 340;
  let left = rect.right + 12; if (left + W > boardW - 8) left = Math.max(8, rect.left - W - 12);
  const top = Math.max(8, Math.min(rect.top, boardH - 540));
  const maxH = Math.max(260, boardH - top - 8);
  const last = msgs[msgs.length - 1];
  const demo = msgs.some((m) => m.source === "demo");

  return (
    <aside aria-label="AI companion" className="pop-in z-30 flex md:max-h-[var(--mh)] flex-col rounded-[20px] border border-stone bg-eggshell shadow-[0_8px_30px_rgba(0,0,0,.12)] max-md:fixed max-md:inset-x-2 max-md:bottom-2 max-md:max-h-[70vh] md:absolute md:left-[var(--l)] md:top-[var(--t)] md:w-[340px]"
      style={{ ["--l" as string]: `${left}px`, ["--t" as string]: `${top}px`, ["--mh" as string]: `${maxH}px` }}>
      <div className="flex items-start justify-between gap-2 border-b border-stone p-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-smoke">About</p>
          <p className="truncate text-sm font-medium">{empty ? "(nothing inside the box)" : excerpt}</p>
          {!empty && <p className="text-xs text-smoke">Based on: {basedOn}</p>}
        </div>
        <button className="btn btn-outline btn-sm shrink-0" onClick={onClose} aria-label="Close AI panel">Close</button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {empty && <p className="text-sm text-smoke">There are no notes inside that box. Try drawing it around some writing.</p>}
        {msgs.map((m, i) => m.role === "user" ? (
          <p key={i} className="ml-8 rounded-2xl bg-taupe px-3 py-2 text-sm">{m.text}</p>
        ) : (
          <div key={i} ref={i === msgs.length - 1 ? lastRef : undefined} className="rounded-2xl border border-stone p-3 text-sm">
            <p className="mb-1 text-xs text-smoke">{m.source === "demo" ? "Demo response (no AI key set)" : "Extra explanation from AI, not from your teacher"}</p>
            {m.view?.type === "graph" ? <GraphView data={m.view.data as GraphData} /> : m.view?.type === "visual" ? <VisualView data={m.view.data as VisualData} /> : m.view?.type === "quiz" ? <QuizView data={m.view.data as QuizData} onResult={onQuiz} /> : <p className="whitespace-pre-wrap"><RichText text={m.text} /></p>}
          </div>
        ))}
        {loading && <p className="text-sm text-smoke" role="status">Thinking…</p>}
        {error && <p className="text-sm text-sky-deep" role="alert">{error} <button className="underline" onClick={() => onSend("explain")}>Try again</button></p>}
        {last?.role === "assistant" && !loading && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button className={`btn btn-outline btn-sm ${fed === "helped" ? "chip-on" : ""}`} onClick={() => onFeedback("helped")}>That helped</button>
            <button className={`btn btn-outline btn-sm ${fed === "confused" ? "chip-on" : ""}`} onClick={() => onFeedback("confused")}>Still confused</button>
            <button className="btn btn-outline btn-sm" onClick={() => onFeedback("another")}>Try another explanation</button>
          </div>
        )}
        {suggestion && <p className="text-xs text-smoke">{suggestion}</p>}
        {demo && <p className="text-xs text-smoke">Demo answers are prewritten, not generated.</p>}
      </div>
      {!empty && (
        <div className="space-y-2 border-t border-stone p-3">
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <button className="btn btn-primary btn-sm" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>Tools ▾</button>
              {menu && (
                <ul role="menu" className="absolute bottom-full left-0 z-10 mb-2 w-60 rounded-2xl border border-stone bg-eggshell p-1 shadow-lg">
                  {TOOLS.map((t) => <li key={t.kind} role="none"><button role="menuitem" disabled={loading} className="w-full rounded-xl px-3 py-2 text-left hover:bg-taupe" onClick={() => { setMenu(false); onSend(t.kind); }}><span className="block text-sm font-medium">{t.label}</span><span className="text-xs text-smoke">{t.desc}</span></button></li>)}
                </ul>
              )}
            </div>
            <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">{CHIPS.map((c) => <button key={c.label} disabled={loading} className="btn btn-outline btn-sm shrink-0 whitespace-nowrap" onClick={() => onSend(c.kind, undefined, c.guided)}>{c.label}</button>)}</div>
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { onSend("followup", q.trim()); setQ(""); } }}>
            <label className="sr-only" htmlFor="ask-q">Ask a question</label>
            <input id="ask-q" className="input !min-h-10 !text-sm" placeholder="Ask your own question…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={loading || !q.trim()}>Ask</button>
          </form>
        </div>
      )}
    </aside>
  );
}
