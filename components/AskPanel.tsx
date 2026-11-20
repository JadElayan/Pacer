"use client";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PanelOpenContext } from "./AnimatedPanel";
import { ChoiceMenu } from "./ChoiceMenu";
import { createPortal } from "react-dom";
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

export function AskPanel({ rect, boardW, boardH, excerpt, basedOn, msgs, loading, error, empty, suggestion, onSend, onQuiz, onClose, onFeedback, fed, onSaveClip, onSaveAnswer, reduced = false }: {
  rect: Rect; boardW: number; boardH: number; excerpt: string; basedOn: string; msgs: Msg[]; loading: boolean; error: string; empty: boolean; suggestion: string; reduced?: boolean;
  onSend: (kind: string, q?: string, guided?: boolean) => void; onQuiz: (correct: boolean) => void; onClose: () => void; onFeedback: (k: "helped" | "confused" | "another") => void; fed: string;
  /** Saves the snipped board content to the student's notes. */ onSaveClip?: () => void;
  /** Saves an AI answer to the student's notes. */ onSaveAnswer?: (text: string) => void;
}) {
  const [q, setQ] = useState("");
  const open = useContext(PanelOpenContext);
  const [clipSaved, setClipSaved] = useState(false);
  const [savedAnswers, setSavedAnswers] = useState<Set<number>>(() => new Set());
  const lastRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const [initial, setInitial] = useState<{ left: number; top: number; width: number; height: number }>();
  const [frame, setFrame] = useState<{ left: number; top: number; width: number; height: number }>();
  const moving = useRef<{ pointer: number; x: number; y: number; kind: "move" | "resize"; frame: { left: number; top: number; width: number; height: number } } | undefined>(undefined);
  const fit = (value: NonNullable<typeof frame>) => {
    const view = window.visualViewport;
    const edge = 8, vw = view?.width ?? innerWidth, vh = view?.height ?? innerHeight;
    const width = Math.min(vw - edge * 2, Math.max(300, value.width));
    const height = Math.min(vh - edge * 2, Math.max(240, value.height));
    return { width, height, left: Math.max(edge, Math.min(vw - width - edge, value.left)), top: Math.max(edge, Math.min(vh - height - edge, value.top)) };
  };
  useEffect(() => {
    const resize = () => {
      setFrame((current) => current ? fit(current) : current);
      setInitial((current) => current ? fit(current) : current);
    };
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); };
  }, []);
  const start = (event: React.PointerEvent, kind: "move" | "resize") => {
    if (event.button !== 0 || !event.isPrimary || !panelRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const box = panelRef.current.getBoundingClientRect();
    moving.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, kind,
      frame: { left: box.left, top: box.top, width: box.width, height: box.height } };
  };
  const move = (event: React.PointerEvent) => {
    const drag = moving.current;
    if (drag?.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    setFrame(fit(drag.kind === "move" ? { ...drag.frame, left: drag.frame.left + dx, top: drag.frame.top + dy }
      : { ...drag.frame, width: drag.frame.width + dx, height: drag.frame.height + dy }));
  };
  const finish = () => { moving.current = undefined; };
  useEffect(() => {
    const content = contentRef.current, reply = lastRef.current;
    if (!content || !reply) return;
    // Scroll only the conversation; scrollIntoView also scrolled the clipped panel and hid its Close bar.
    content.scrollTop += reply.getBoundingClientRect().top - content.getBoundingClientRect().top;
  }, [msgs.length]);
  const W = 340;
  let left = rect.right + 12; if (left + W > boardW - 8) left = Math.max(8, rect.left - W - 12);
  // Stay level with what was asked about; near the bottom, sit just above the edge instead of jumping to the middle.
  const top = Math.max(8, Math.min(rect.top, boardH - 340));
  const maxH = Math.max(260, boardH - top - 8);
  useLayoutEffect(() => {
    const host = hostRef.current?.parentElement;
    const bounds = (host?.classList.contains("panel-motion") ? host.parentElement : host)?.getBoundingClientRect();
    if (!bounds) return;
    setInitial(fit({ left: bounds.left + left, top: bounds.top + top, width: W, height: Math.min(440, maxH) }));
  }, [left, top, maxH]);
  const last = msgs[msgs.length - 1];
  const demo = msgs.some((m) => m.source === "demo");

  return <><span ref={hostRef} hidden />{initial && createPortal(
    <aside ref={panelRef} aria-label="AI companion" data-open={open} inert={!open} aria-hidden={!open || undefined} data-reduce-motion={reduced} className="ai-companion flex flex-col rounded-[20px] border border-stone bg-eggshell shadow-[0_8px_30px_rgba(0,0,0,.12)]"
      onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
      style={{ position: "fixed", zIndex: 160, ...(frame ?? initial) }}>
      <div className="flex shrink-0 items-center justify-between border-b border-stone px-2 py-1">
        <button type="button" aria-label="Move AI panel" title="Drag to move. Arrow keys move the panel."
          className="min-h-8 flex-1 cursor-move touch-none text-left text-xs text-smoke"
          onPointerDown={(event) => start(event, "move")} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || !panelRef.current) return;
            event.preventDefault();
            const box = panelRef.current.getBoundingClientRect();
            setFrame(fit({ width: box.width, height: box.height, left: box.left + (event.key === "ArrowLeft" ? -20 : event.key === "ArrowRight" ? 20 : 0),
              top: box.top + (event.key === "ArrowUp" ? -20 : event.key === "ArrowDown" ? 20 : 0) }));
          }}>⠿ Move</button>
        {frame && <button type="button" className="btn btn-outline btn-sm ml-1" onClick={() => setFrame(undefined)}>Reset</button>}
        <button type="button" className="nb-link text-smoke" onClick={onClose} aria-label="Close AI panel" title="Close">×</button>
      </div>
      <div ref={contentRef} className="ai-companion-content min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="ai-companion-summary flex items-start justify-between gap-2 border-b border-stone p-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-smoke">Ask about</p>
          <p className="break-words text-sm font-medium">{empty ? "(nothing inside the box)" : excerpt}</p>
          {!empty && <p className="text-xs text-smoke">Based on: {basedOn}</p>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {onSaveClip && !empty && <button type="button" className="nb-link" disabled={clipSaved} onClick={() => { onSaveClip(); setClipSaved(true); }}>{clipSaved ? "Saved" : "Save selection"}</button>}
        </div>
      </div>
      <div className="ai-conversation space-y-3 p-4" aria-live="polite">
        {empty && <p className="text-sm text-smoke">There are no notes inside that box. Try drawing it around some writing.</p>}
        {!empty && msgs.length === 0 && !loading && <p className="text-sm text-smoke">What would you like to understand?</p>}
        {msgs.map((m, i) => m.role === "user" ? (
          <p key={i} className="ml-8 rounded-2xl bg-taupe px-3 py-2 text-sm">{m.text}</p>
        ) : (
          <div key={i} ref={i === msgs.length - 1 ? lastRef : undefined} className="rounded-2xl border border-stone p-3 text-sm">
            <p className="mb-1 text-xs text-smoke">{m.source === "demo" ? "Demo response (no AI key set)" : "Extra explanation from AI, not from your teacher"}</p>
            {m.view?.type === "graph" ? <GraphView data={m.view.data as GraphData} /> : m.view?.type === "visual" ? <VisualView data={m.view.data as VisualData} /> : m.view?.type === "quiz" ? <QuizView data={m.view.data as QuizData} onResult={onQuiz} /> : <p className="whitespace-pre-wrap"><RichText text={m.text} /></p>}
            {onSaveAnswer && !m.view && m.text.trim() && <button type="button" className="nb-link mt-2 -ml-1" disabled={savedAnswers.has(i)}
              onClick={() => { onSaveAnswer(m.text); setSavedAnswers((set) => new Set(set).add(i)); }}>{savedAnswers.has(i) ? "Saved to notes" : "Save to notes"}</button>}
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
      </div>
      {!empty && (
        <div className="ai-composer space-y-2 border-t border-stone p-3">
          <form className="ai-question-form" onSubmit={(e) => { e.preventDefault(); if (!loading && q.trim()) { onSend("followup", q.trim()); setQ(""); } }}>
            <label className="sr-only" htmlFor="ask-q">Ask a question</label>
            <input id="ask-q" autoFocus placeholder="Ask a question…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" aria-label="Ask" title="Send question" disabled={loading || !q.trim()}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5m-4 4 4-4 4 4" /></svg>
            </button>
          </form>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="ai-tools">
              <ChoiceMenu label="Tools" value="" disabled={loading} onChange={(kind) => onSend(kind)}>
                <option value="" disabled>Tools</option>
                {TOOLS.map((tool) => <option key={tool.kind} value={tool.kind}>
                  <span className="block text-left"><span className="block font-medium">{tool.label}</span><span className="block text-xs text-smoke">{tool.desc}</span></span>
                </option>)}
              </ChoiceMenu>
            </div>
            <button type="button" className="nb-link" disabled={loading} onClick={() => onSend("explain")}>Explain this</button>
            <ChoiceMenu label="More actions" value="" disabled={loading} onChange={(value) => {
              const action = CHIPS.find((chip) => (chip.guided ? "guided" : chip.kind) === value);
              onSend(action?.kind ?? value, undefined, action?.guided);
            }}>
              <option value="" disabled>More actions</option>
              {CHIPS.slice(1).map((chip) => <option key={chip.label} value={chip.guided ? "guided" : chip.kind}>{chip.label}</option>)}
            </ChoiceMenu>
          </div>
        </div>
      )}
      <button type="button" aria-label="Resize AI panel" title="Drag to resize. Arrow keys adjust the size."
        className="ml-auto grid size-8 shrink-0 cursor-nwse-resize touch-none place-items-center text-smoke"
        onPointerDown={(event) => start(event, "resize")} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || !panelRef.current) return;
          event.preventDefault();
          const box = panelRef.current.getBoundingClientRect();
          setFrame(fit({ left: box.left, top: box.top, width: box.width + (event.key === "ArrowLeft" ? -20 : event.key === "ArrowRight" ? 20 : 0),
            height: box.height + (event.key === "ArrowUp" ? -20 : event.key === "ArrowDown" ? 20 : 0) }));
        }}>◢</button>
    </aside>, document.body)}</>;
}
