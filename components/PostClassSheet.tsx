"use client";
import { useEffect, useState } from "react";
import { askAI } from "@/lib/ai";
import { track } from "@/lib/track";
import type { RoomState, SharedRecap } from "@/lib/types";
import { lectureContent } from "@/lib/recapContent";
import { Sheet } from "./Sheet";

interface Recap { recap: string; keyPoints: string[]; practice: { question: string; answer: string }[]; catchup: string; nextTime: string }
interface Saved { data: Recap; source: "ai" | "demo"; ts: number; rev: number }

const toMarkdown = (title: string, r: Recap) =>
  `# ${title}: class recap\n\n${r.recap}\n\n## Key points\n${r.keyPoints.map((p) => `- ${p}`).join("\n")}\n\n## Practice\n${r.practice.map((p, i) => `${i + 1}. ${p.question}\n   Answer: ${p.answer}`).join("\n")}\n\n## If you missed class\n${r.catchup}\n\n## Teacher note\n${r.nextTime}\n`;

const INCLUDES = ["Recap", "Key points", "3 practice questions", "Catch-up note", "Teacher note"];

/**
 * Recap, practice, catch-up note and a teacher follow-up note, copied or downloaded as Markdown.
 * The AI only runs when the teacher presses Generate, and the result is kept for this room so reopening is free.
 */
export function PostClassSheet({ state, onClose, onShare }: { state: RoomState; onClose: () => void; onShare?: (recap: SharedRecap | null) => void }) {
  const key = `pacer:recap:${state.code}`;
  const [saved, setSaved] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    try { setSaved(JSON.parse(localStorage.getItem(key) ?? "null")); } catch { /* nothing saved */ }
  }, [key]);

  const lines = lectureContent(state);
  const empty = !lines.length && !state.topics.some((topic) => topic.summary || topic.slides?.pages.length);
  const slides = new Set(state.slides?.presented ?? []).size;

  const generate = async () => {
    setBusy(true); setErr(""); setCopied(false);
    try {
      if (empty) throw new Error("There is nothing to recap yet. Present slides or write on the board first");
      const r = await askAI({ kind: "recap", mode: "standard", selected: [], context: lines, topicTitle: state.title, topics: state.topics.map((t) => ({ title: t.title, summary: t.summary })) });
      const d = r.data as Partial<Recap> | undefined;
      if (!d || typeof d.recap !== "string") throw new Error("The AI didn't return a recap. Please try again");
      const next: Saved = { data: { recap: d.recap, keyPoints: d.keyPoints ?? [], practice: (d.practice ?? []).slice(0, 3), catchup: d.catchup ?? "", nextTime: d.nextTime ?? "" },
        source: r.source, ts: Date.now(), rev: state.rev };
      setSaved(next);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* kept for this session only */ }
      track("recap", "teacher", state.code);
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  const data = saved?.data;
  // Sharing sends students everything except the teacher note. Re-sharing replaces it; Stop sharing removes it.
  const shared = state.sharedRecap;
  const outdated = !!(shared && saved && saved.ts > shared.ts);
  const share = () => data && onShare?.({ recap: data.recap, keyPoints: data.keyPoints, practice: data.practice, catchup: data.catchup, ts: saved!.ts });
  const md = data ? toMarkdown(state.title, data) : "";
  const fileName = `${state.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "lecture"}-recap.md`;
  const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <Sheet title="Post-class package" label="Post-class package" wide onClose={onClose}
      subtitle="A recap, practice questions and a catch-up note built from your slides and board notes, ready to paste into an email or your LMS."
      footer={data && !busy ? <>
        <button className="btn btn-primary btn-sm" onClick={() => { void navigator.clipboard?.writeText(md).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy as text"}</button>
        <a className="btn btn-outline btn-sm" href={`data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`} download={fileName}>Download .md</a>
        {onShare && (!shared || outdated
          ? <button className="btn btn-outline btn-sm" onClick={share}>{shared ? "Share the new version" : "Share with class"}</button>
          : <button className="btn btn-outline btn-sm" onClick={() => onShare(null)}>Stop sharing</button>)}
        <button className="btn btn-outline btn-sm ml-auto" onClick={() => void generate()}>Regenerate</button>
      </> : undefined}>
      {!data && !busy && (
        <div className="sheet-card recap-start">
          <div className="recap-start-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z" /><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-[#171d38]">Generate the package when you&apos;re ready</h3>
          <p className="mt-1 text-sm text-smoke">
            {empty ? "Present slides or write on the board first, then come back here."
              : `Pacer will write it from ${state.topics.length} topic${state.topics.length === 1 ? "" : "s"}${slides ? ` and ${slides} slide${slides === 1 ? "" : "s"}` : ""}. It uses AI once, when you press Generate.`}
          </p>
          <ul className="recap-chips">{INCLUDES.map((item) => <li key={item}>{item}</li>)}</ul>
          <button className="btn btn-primary mt-5 w-full" disabled={empty} onClick={() => void generate()}>Generate post-class package</button>
          {err && <p role="alert" className="mt-3 text-sm text-[#992f34]">{err}</p>}
        </div>
      )}
      {busy && (
        <div className="grid gap-3" role="status" aria-label="Writing the recap">
          <p className="text-sm text-smoke">Writing the recap…</p>
          {[0, 1, 2].map((i) => <div key={i} className="sheet-card recap-skeleton"><span /><span /><span /></div>)}
        </div>
      )}
      {data && !busy && (
        <div className="grid gap-3">
          <p className="text-xs text-smoke">
            {saved.source === "demo" ? "Demo response (no AI key set)" : `Written by AI at ${time(saved.ts)} from your slides and board notes. Check it before sharing.`}
            {saved.rev < state.rev && " The lesson has changed since then, so Regenerate to include the latest."}
          </p>
          {err && <p role="alert" className="text-sm text-[#992f34]">{err}</p>}
          {onShare && <p role="status" className={`recap-share-note ${shared ? "recap-share-note-on" : ""}`}>
            {shared ? <>Shared with your class at {time(shared.ts)}. Students see it in class and with this lesson on their dashboard.{outdated && " You regenerated since then: share the new version to update it."}</>
              : "Share with class sends the recap, key points, practice and catch-up note to students. The teacher note stays private."}
          </p>}
          <section className="sheet-card pop-in"><h3 className="sheet-card-title">Recap</h3><p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{data.recap}</p></section>
          {data.keyPoints.length > 0 && <section className="sheet-card pop-in"><h3 className="sheet-card-title">Key points</h3>
            <ul className="mt-1.5 grid gap-1.5">{data.keyPoints.map((p, i) => <li key={i} className="recap-point">{p}</li>)}</ul></section>}
          {data.practice.length > 0 && <section className="sheet-card pop-in"><h3 className="sheet-card-title">Practice</h3>
            <ol className="mt-2 grid gap-2">{data.practice.map((p, i) => <li key={i} className="recap-question">
              <span className="recap-num">{i + 1}</span>
              <div><p>{p.question}</p><details className="recap-answer"><summary>Show answer</summary><p>{p.answer}</p></details></div>
            </li>)}</ol></section>}
          {data.catchup && <section className="sheet-card pop-in"><h3 className="sheet-card-title">If you missed class</h3><p className="mt-1.5 leading-relaxed">{data.catchup}</p></section>}
          {data.nextTime && <section className="sheet-card sheet-card-note pop-in"><h3 className="sheet-card-title">Teacher note · not for students</h3><p className="mt-1.5 text-sm leading-relaxed">{data.nextTime}</p></section>}
        </div>
      )}
    </Sheet>
  );
}
