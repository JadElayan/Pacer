"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { askAI } from "@/lib/ai";
import { DEMO_STEPS } from "@/lib/demo";
import { AIKind, Mode, uid } from "@/lib/types";
import { useRoom } from "@/lib/useRoom";
import { usePrefs } from "@/lib/usePrefs";
import { AskPanel, Msg } from "./AskPanel";
import { ConceptColumn } from "./ConceptColumn";
import { Insights } from "./Insights";
import { Logo } from "./Logo";
import { Popup, PopupData } from "./Popup";
import { SettingsSheet } from "./SettingsSheet";
import { Anchor, Whiteboard } from "./Whiteboard";

export function Classroom({ code }: { code: string }) {
  const sp = useSearchParams();
  const wantTeacher = sp.get("role") === "teacher";
  const { state, events, status, isTeacher, mutate, sendEvent, connected, transportKind, getState } = useRoom(code, wantTeacher);
  const { prefs, update, reset, score } = usePrefs();
  const boardRef = useRef<HTMLDivElement>(null);

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fed, setFed] = useState("");
  const [snip, setSnip] = useState(false);
  const [pen, setPen] = useState(false);
  const [draft, setDraft] = useState(""); const [kind, setKind] = useState<"text" | "equation">("text");
  const [pendingNew, setPendingNew] = useState(false);
  const [showInsights, setShowInsights] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [catchup, setCatchup] = useState<{ text: string; source: string } | null>(null);
  const [catchupLoading, setCatchupLoading] = useState(false);
  const [lastViewed, setLastViewed] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupData | null>(null);
  const lastPopup = useRef(0); const prevTopics = useRef<number | null>(null); const demoIdx = useRef(0);
  const sumTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const live = state?.currentTopicId ?? state?.topics[state.topics.length - 1]?.id ?? null;
  const focus = prefs.mode === "focus" && !isTeacher;
  const blocks = (state?.blocks ?? []).filter((b) => !focus || b.topicId === live);
  const topics = (state?.topics ?? []).filter((t) => !focus || t.id === live);
  const roleQ = isTeacher ? "?role=teacher" : "";

  // ---- teacher actions ----
  const scheduleSummary = useCallback((topicId: string) => {
    clearTimeout(sumTimers.current[topicId]);
    sumTimers.current[topicId] = setTimeout(async () => {
      const s = getState(); const tp = s?.topics.find((t) => t.id === topicId);
      if (!s || !tp || !tp.auto) return;
      try {
        const r = await askAI({ kind: "summarize", selected: s.blocks.filter((b) => b.topicId === topicId).map((b) => b.content), context: [], mode: "standard" });
        if (r.title) mutate((st) => ({ ...st, topics: st.topics.map((t) => (t.id === topicId && t.auto ? { ...t, title: r.title!, summary: r.summary ?? "" } : t)) }));
      } catch { /* keep placeholder */ }
    }, 1500);
  }, [getState, mutate]);

  const addBlock = (k: "text" | "equation", content: string, forceTopic?: { title: string; summary: string }) => {
    const s = getState(); if (!s || !content.trim()) return;
    let tid = s.currentTopicId; let tps = s.topics;
    const existing = forceTopic ? tps.find((t) => t.title === forceTopic.title) : undefined;
    if (existing) tid = existing.id;
    else if (!tid || pendingNew || forceTopic) { tid = uid(); tps = [...tps, { id: tid, title: forceTopic?.title ?? "New topic", summary: forceTopic?.summary ?? "", ts: Date.now(), auto: !forceTopic }]; }
    const topicId = tid!;
    mutate((st) => ({ ...st, topics: tps, currentTopicId: topicId, blocks: [...st.blocks, { id: uid(), topicId, kind: k, content: content.trim(), order: st.blocks.length, ts: Date.now() }] }));
    setPendingNew(false);
    if (!forceTopic) scheduleSummary(topicId);
  };
  const demoStep = () => { const d = DEMO_STEPS[demoIdx.current % DEMO_STEPS.length]; demoIdx.current++; addBlock(d.kind, d.content, { title: d.topic, summary: d.summary }); };

  // ---- student: AI ----
  const selectedBlocks = (a: Anchor | null) => (a && state ? state.blocks.filter((b) => a.ids.includes(b.id)) : []);
  const ask = async (a: Anchor, k: AIKind, question?: string, guided?: boolean) => {
    if (!state) return;
    const sel = selectedBlocks(a); const tp = state.topics.find((t) => t.id === sel[0]?.topicId);
    const label = { explain: "Explain this", why: "Why this step?", simplify: "Simplify", example: "Give an example", snip: "Explain this in depth", followup: question ?? "", another: "Try another explanation", deeper: "More depth", catchup: "", summarize: "", clarify: "" }[k];
    const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: guided ? "Step by step" : label }]); setLoading(true); setError(""); setFed("");
    sendEvent("ask", sel[0]?.id ?? null, sel[0]?.topicId ?? null);
    try {
      const r = await askAI({ kind: k, selected: sel.map((b) => b.content), context: state.blocks.map((b) => b.content), topicTitle: tp?.title, mode: guided ? "guided" : prefs.mode, question, history });
      setMsgs((m) => [...m, { role: "assistant", text: r.text, source: r.source }]);
    } catch (e) { setError(e instanceof Error ? `${e.message}.` : "Something went wrong."); }
    finally { setLoading(false); }
  };
  const openAnchor = (a: Anchor, auto?: AIKind) => {
    setAnchor(a); setMsgs([]); setError(""); setFed(""); setSnip(false);
    const first = state?.blocks.find((b) => b.id === a.ids[0]); if (first) setLastViewed(first.topicId);
    if (auto && a.ids.length) void ask(a, auto);
  };
  const feedback = (f: "helped" | "confused" | "another") => {
    if (!anchor) return; const sel = selectedBlocks(anchor)[0];
    if (f === "another") { void ask(anchor, "another"); return; }
    setFed(f); sendEvent(f, sel?.id ?? null, sel?.topicId ?? null); score(prefs.mode, f === "helped" ? 1 : -1);
  };
  const suggestion = (() => {
    const best = (Object.entries(prefs.scores) as [Mode, number][]).sort((a, b) => b[1] - a[1])[0];
    return best && best[1] > 0 && best[0] !== prefs.mode ? `Based on your taps, ${best[0]} mode may suit you. (This is a preference score, not a measure of understanding.)` : "";
  })();

  const openCatchup = async (detail: "short" | "long" = "short") => {
    if (!state) return; setCatchupLoading(true);
    const idx = state.topics.findIndex((t) => t.id === lastViewed);
    const t = state.topics.slice(idx + 1 || 0).map((x) => ({ title: x.title, summary: x.summary }));
    setCatchup((c) => c ?? { text: "", source: "demo" });
    try { const r = await askAI({ kind: "catchup", selected: [], context: state.blocks.map((b) => b.content), topics: t.length ? t : state.topics.map((x) => ({ title: x.title, summary: x.summary })), mode: prefs.mode, detail }); setCatchup({ text: r.text, source: r.source }); }
    catch { setCatchup({ text: "Couldn't load the catch-up. Try again.", source: "demo" }); }
    finally { setCatchupLoading(false); }
  };

  // ---- AI pop-ups (one at a time, cooldown, never over the board centre) ----
  const offer = useCallback((p: PopupData) => {
    if (!prefs.popups || popup || anchor || snip) return;
    const gap = prefs.mode === "focus" ? 75000 : 25000;
    if (Date.now() - lastPopup.current < gap) return;
    lastPopup.current = Date.now(); setPopup(p);
  }, [prefs.popups, prefs.mode, popup, anchor, snip]);
  useEffect(() => { if (!popup) return; const t = setTimeout(() => setPopup(null), 15000); return () => clearTimeout(t); }, [popup]);
  useEffect(() => {
    if (isTeacher || !anchor || anchor.source !== "block" || msgs.length) return;
    const a = anchor; const t = setTimeout(() => offer({ id: uid(), text: "Want a simpler explanation of this step?", action: "Simplify it", run: () => void ask(a, "simplify") }), 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, msgs.length, isTeacher]);
  useEffect(() => {
    if (!state || isTeacher) return;
    const n = state.topics.length;
    if (prevTopics.current !== null && n > prevTopics.current) {
      const t = state.topics[n - 1]; offer({ id: uid(), text: `New topic: "${t.title}". Want a quick catch-up?`, action: "Catch me up", run: () => void openCatchup() });
    }
    prevTopics.current = n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.topics.length]);

  // ---- render ----
  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <Logo />
          {status === "notfound" ? (<><p className="mt-6 text-xl">We couldn&apos;t find meeting {code}.</p><p className="mt-1 text-smoke">Check the code, or ask your teacher whether the meeting has started.</p><Link className="btn btn-primary mt-6" href="/">Back to home</Link></>)
            : (<p className="mt-6 text-smoke" role="status">Connecting to meeting {code}…</p>)}
        </div>
      </main>
    );
  }

  const sel = selectedBlocks(anchor);
  const board = boardRef.current?.getBoundingClientRect();
  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${code}` : "";
  const pill = status === "live" ? "Connected" : status === "waiting" ? "Waiting for teacher…" : "Connecting…";

  return (
    <div className="flex min-h-screen flex-col bg-eggshell md:h-screen">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone px-4 py-2 md:px-6">
        <Link href="/" aria-label="Pacer home"><Logo height={24} /></Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-medium">{state.title}</h1>
        <span className="inline-flex items-center gap-2 rounded-full border border-stone px-3 py-1 text-xs"><span aria-hidden className={`h-2 w-2 rounded-full ${isTeacher || status === "live" ? "bg-sky" : "bg-ash"}`} />{isTeacher ? `${connected} connected` : pill}</span>
        {isTeacher ? (
          <>
            <button className="btn btn-outline btn-sm" onClick={() => setShowInvite((v) => !v)}>Invite · {code}</button>
            <button className="btn btn-outline btn-sm" onClick={() => setShowInsights((v) => !v)} aria-pressed={showInsights}>Insights</button>
            <button className="btn btn-dark btn-sm" onClick={() => mutate((s) => ({ ...s, ended: true }))}>End lecture</button>
          </>
        ) : (
          <>
            <button className={`btn btn-sm ${snip ? "btn-primary" : "btn-outline"}`} aria-pressed={snip} onClick={() => { setSnip((v) => !v); setAnchor(null); }}>Snip</button>
            <button className="btn btn-outline btn-sm" onClick={() => void openCatchup()}>Catch me up</button>
            <button className="btn btn-outline btn-sm" onClick={() => setShowSettings(true)}>Mode: {prefs.mode}</button>
          </>
        )}
      </header>
      {transportKind === "local" && <p className="bg-taupe px-4 py-1 text-center text-xs text-smoke">Local demo sync: students must use tabs in this same browser. Add Supabase keys for real multi-device sync.</p>}
      {state.ended && <p role="status" className="bg-ink px-4 py-2 text-center text-sm text-white">This lecture has ended.</p>}

      {showInvite && isTeacher && (
        <div className="absolute right-4 top-16 z-40 w-[260px] rounded-[20px] border border-stone bg-eggshell p-4 text-center shadow-xl">
          <p className="text-xs text-smoke">Meeting code</p><p className="text-3xl font-light tracking-[0.2em]">{code}</p>
          <div className="mx-auto my-3 w-fit rounded-xl border border-stone bg-white p-2"><QRCodeSVG value={joinUrl} size={140} /></div>
          <button className="btn btn-outline btn-sm" onClick={() => navigator.clipboard?.writeText(joinUrl)}>Copy link</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row">
        <aside className="shrink-0 md:w-[220px] md:overflow-y-auto">
          <ConceptColumn topics={topics} currentId={live} canEdit={isTeacher} hrefFor={(id) => `/room/${code}/topic/${id}${roleQ}`}
            onEdit={(id, p) => mutate((s) => ({ ...s, topics: s.topics.map((t) => (t.id === id ? { ...t, ...p, auto: false } : t)) }))} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-3">
          <Whiteboard boardRef={boardRef} blocks={blocks} strokes={state.strokes} isTeacher={isTeacher} selectedIds={anchor?.ids ?? []}
            onSelect={(a) => { if (!isTeacher) openAnchor(a); }} snipActive={snip && !isTeacher} penActive={pen}
            onSnip={(a) => { if (!a) { setSnip(false); return; } openAnchor(a, "snip"); }}
            onStroke={(pts) => mutate((s) => ({ ...s, strokes: [...s.strokes, { id: uid(), pts }] }))}
            onDelete={(id) => mutate((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== id) }))}>
            {anchor && !isTeacher && board && (
              <AskPanel rect={anchor.rect} boardW={board.width} boardH={board.height} empty={anchor.ids.length === 0}
                excerpt={sel.map((b) => b.content).join("  ·  ")} basedOn={`${state.topics.find((t) => t.id === sel[0]?.topicId)?.title ?? "lecture"} · ${sel.length} note${sel.length === 1 ? "" : "s"}, plus nearby lecture context`}
                msgs={msgs} loading={loading} error={error} suggestion={suggestion} fed={fed}
                onSend={(k, q, g) => void ask(anchor, k as AIKind, q, g)} onClose={() => { setAnchor(null); setMsgs([]); }} onFeedback={feedback} />
            )}
          </Whiteboard>

          {isTeacher && !state.ended && (
            <form className="flex flex-wrap items-center gap-2 rounded-[20px] border border-stone bg-eggshell p-3" onSubmit={(e) => { e.preventDefault(); addBlock(kind, draft); setDraft(""); }}>
              <div role="group" aria-label="Note type" className="flex gap-1">
                {(["text", "equation"] as const).map((k) => <button type="button" key={k} aria-pressed={kind === k} className={`btn btn-sm btn-outline ${kind === k ? "chip-on" : ""}`} onClick={() => setKind(k)}>{k === "text" ? "Note" : "Equation"}</button>)}
              </div>
              <label className="sr-only" htmlFor="draft">New {kind}</label>
              <input id="draft" className="input !min-h-10 min-w-[160px] flex-1" placeholder={kind === "equation" ? "2x + 6 = 14  (LaTeX works)" : "Type a note…"} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={!draft.trim()}>Add</button>
              <button type="button" className={`btn btn-sm btn-outline ${pendingNew ? "chip-on" : ""}`} aria-pressed={pendingNew} onClick={() => setPendingNew((v) => !v)}>{pendingNew ? "Next note starts a new topic" : "Start new topic"}</button>
              <button type="button" className={`btn btn-sm btn-outline ${pen ? "chip-on" : ""}`} aria-pressed={pen} onClick={() => setPen((v) => !v)}>Pen</button>
              {state.strokes.length > 0 && <button type="button" className="btn btn-sm btn-outline" onClick={() => mutate((s) => ({ ...s, strokes: [] }))}>Clear pen</button>}
              <button type="button" className="btn btn-sm btn-outline" onClick={demoStep}>Add demo step</button>
            </form>
          )}
        </main>

        {isTeacher && showInsights && <Insights state={state} events={events} connected={connected} />}
      </div>

      {popup && !isTeacher && <Popup p={popup} onDismiss={() => setPopup(null)} onNever={() => { update({ popups: false }); setPopup(null); }} />}
      {showSettings && <SettingsSheet prefs={prefs} update={update} reset={reset} onClose={() => setShowSettings(false)} />}
      {catchup && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setCatchup(null)}>
          <aside role="dialog" aria-label="Catch me up" className="h-full w-[min(380px,100vw)] overflow-y-auto bg-eggshell p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="display text-3xl">Catch me up</h2>
            <p className="mt-1 text-xs text-smoke">{catchup.source === "demo" ? "Demo response (no AI key set)" : "AI summary of what changed"}</p>
            <p className="mt-4 whitespace-pre-wrap" aria-live="polite">{catchupLoading ? "Thinking…" : catchup.text}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button className="btn btn-outline" disabled={catchupLoading} onClick={() => void openCatchup("long")}>Explain more</button>
              <button className="btn btn-primary" onClick={() => { setCatchup(null); setLastViewed(live); setAnchor(null); boardRef.current?.querySelector("[role=region]")?.scrollTo({ top: 1e6 }); }}>Return to live</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
