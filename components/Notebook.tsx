"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { GENERAL_NOTES, type NoteClip, type NotesStatus, type TopicNotes } from "@/lib/useTopicNotes";

type Topic = { id: string; title: string };
type Help = "lost" | "ask" | "catchup";

const BULLET = /^(\s*)(•|-|\*|(\d+)\.)\s/;

/** Keeps lists going like a doc: Enter continues a bullet, Enter on an empty bullet ends the list, "- " becomes "• ", Tab indents. */
function listKeys(event: React.KeyboardEvent<HTMLTextAreaElement>, commit: (value: string) => void) {
  const el = event.currentTarget;
  if (event.nativeEvent.isComposing || el.selectionStart !== el.selectionEnd) return;
  const caret = el.selectionStart;
  const lineStart = el.value.lastIndexOf("\n", caret - 1) + 1;
  const before = el.value.slice(lineStart, caret);
  const replace = (from: number, to: number, text: string) => {
    event.preventDefault();
    el.setRangeText(text, from, to, "end");
    commit(el.value);
  };
  if (event.key === " " && /^\s*[-*]$/.test(before)) return replace(caret - 1, caret, "• ");
  const match = el.value.slice(lineStart).match(BULLET);
  if (!match) return;
  if (event.key === "Enter" && !event.shiftKey) {
    const lineEnd = el.value.indexOf("\n", caret) === -1 ? el.value.length : el.value.indexOf("\n", caret);
    if (!el.value.slice(lineStart + match[0].length, lineEnd).trim()) return replace(lineStart, lineEnd, "");
    const marker = match[3] ? `${Number(match[3]) + 1}.` : match[2];
    return replace(caret, caret, `\n${match[1]}${marker} `);
  }
  if (event.key === "Tab") {
    if (event.shiftKey) {
      if (match[1].length) replace(lineStart, lineStart + Math.min(2, match[1].length), "");
      else event.preventDefault();
      return;
    }
    return replace(lineStart, lineStart, "  ");
  }
}

function NoteArea({ value, placeholder, label, onChange, onFocus }: {
  value: string; placeholder: string; label: string; onChange: (value: string) => void; onFocus: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el || !el.offsetParent) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  // Re-measure when the box first becomes visible (e.g. switching to Notes on a phone) or its width changes.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = -1;
    const observer = new ResizeObserver(([entry]) => {
      if (Math.abs(entry.contentRect.width - width) < 1) return;
      width = entry.contentRect.width;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <textarea ref={ref} className="nb-text" rows={2} aria-label={label} placeholder={placeholder} value={value} maxLength={20000}
    spellCheck onFocus={onFocus} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => listKeys(event, onChange)} />;
}

/** Turns an AI answer into plain note text: no markdown symbols, bullets as "•". */
export function plainNote(text: string) {
  return text.replace(/\r/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s*/gm, "").replace(/^(\s*)[-*]\s+/gm, "$1• ")
    .replace(/^catch-up:?\s*\n/i, "").replace(/\n{3,}/g, "\n\n").trim();
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fileName = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lesson"}-notes`;

export function Notebook({ lessonTitle, topics, liveId, notes, clips, status, ready, review, headerExtra, onChange, onRemoveClip, onHelp, onBackOnTrack, onViewBoard }: {
  lessonTitle: string; topics: Topic[]; liveId: string | null; notes: TopicNotes; clips: NoteClip[]; status: NotesStatus; ready: boolean; review: boolean;
  headerExtra?: ReactNode; onChange: (topic: string, text: string) => void; onRemoveClip: (id: string) => void;
  onHelp: (kind: Help, topic: Topic | null) => void; onBackOnTrack: (topic: Topic | null) => void; onViewBoard?: (topicId: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [liveVisible, setLiveVisible] = useState(true);
  const [lost, setLost] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const topicIds = new Set(topics.map((topic) => topic.id));
  // Clips whose topic no longer exists fall back to the general section.
  const clipsFor = (id: string) => clips.filter((clip) => clip.topicId === id || (id === GENERAL_NOTES && !topicIds.has(clip.topicId)));
  const sections: (Topic & { general?: boolean })[] = [
    ...(!topics.length || notes[GENERAL_NOTES]?.trim() || clipsFor(GENERAL_NOTES).length ? [{ id: GENERAL_NOTES, title: topics.length ? "General notes" : "Lesson notes", general: true }] : []),
    ...topics,
  ];
  const activeId = focused && sections.some((s) => s.id === focused) ? focused : liveId ?? sections.at(-1)?.id ?? GENERAL_NOTES;
  const active = topics.find((topic) => topic.id === activeId) ?? null;
  const activeKey = active?.id ?? GENERAL_NOTES;

  // Show "Back to live" only while the live topic is scrolled out of view.
  useEffect(() => {
    const root = scroller.current;
    const target = liveId ? root?.querySelector(`[data-topic="${CSS.escape(liveId)}"]`) : null;
    if (!root || !target) { setLiveVisible(true); return; }
    // On phones the page scrolls rather than the notebook, so watch the viewport there.
    const scrolls = getComputedStyle(root).overflowY !== "visible";
    const observer = new IntersectionObserver(([entry]) => setLiveVisible(entry.isIntersecting), { root: scrolls ? root : null, threshold: 0.01 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [liveId, topics.length]);

  // When the teacher moves on, bring the new topic into view unless the student is busy typing elsewhere.
  const previousLive = useRef(liveId);
  useEffect(() => {
    if (previousLive.current === liveId) return;
    previousLive.current = liveId;
    const typing = document.activeElement?.closest?.("[data-topic]");
    if (!liveId || (typing && scroller.current?.contains(typing))) return;
    scroller.current?.querySelector(`[data-topic="${CSS.escape(liveId)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [liveId]);

  const jumpToLive = () => {
    if (!liveId) return;
    const section = scroller.current?.querySelector<HTMLElement>(`[data-topic="${CSS.escape(liveId)}"]`);
    // Focus first: focusing after starting a smooth scroll cancels the scroll in some browsers.
    section?.querySelector("textarea")?.focus({ preventScroll: true });
    section?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const filled = sections.filter((s) => notes[s.id]?.trim() || clipsFor(s.id).length);
  const hasNotes = filled.length > 0;
  const asText = () => filled.map((s) => [s.title, notes[s.id]?.trim(),
    ...clipsFor(s.id).filter((clip) => clip.text).map((clip) => `[${clip.label ?? "From the board"}] ${clip.text}`)].filter(Boolean).join("\n")).join("\n\n");
  const copyAll = async () => {
    try { await navigator.clipboard.writeText(asText()); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${lessonTitle}\n\n${asText()}\n`], { type: "text/plain;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `${fileName(lessonTitle)}.txt` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Opens a clean page with headings, notes and saved pictures, ready to print or save as a PDF.
  const print = () => {
    const page = window.open("", "_blank");
    if (!page) return;
    const body = filled.map((s) => `<h2>${escapeHtml(s.title)}</h2>${notes[s.id]?.trim() ? `<p>${escapeHtml(notes[s.id].trim())}</p>` : ""}${clipsFor(s.id).map((clip) =>
      `<figure><figcaption>${escapeHtml(clip.label ?? "From the board")}</figcaption>${clip.image?.startsWith("data:image/") ? `<img src="${clip.image}" alt="">` : ""}${clip.text ? `<p>${escapeHtml(clip.text)}</p>` : ""}</figure>`).join("")}`).join("");
    page.document.write(`<!doctype html><meta charset="utf-8"><title>${escapeHtml(lessonTitle)} notes</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#1f2540;max-width:720px;margin:32px auto;padding:0 24px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 6px;padding-bottom:4px;border-bottom:1px solid #dcdfee}p{white-space:pre-wrap;margin:0 0 10px}figure{margin:10px 0;padding:10px;border:1px solid #dcdfee;border-radius:10px;break-inside:avoid}figcaption{font-size:12px;color:#6b655d;margin-bottom:6px}img{max-width:100%;max-height:260px}</style><h1>${escapeHtml(lessonTitle)}</h1>${body}`);
    page.document.close();
    page.focus();
    setTimeout(() => page.print(), 300);
  };

  return <section aria-label="Your notes" className="nb">
    <header className="nb-head">
      <h2 className="text-[.9375rem] font-semibold">Your notes</h2>
      <span role="status" className={`text-xs ${status === "error" ? "text-amber-800" : "text-smoke"}`}>
        {!ready ? "Loading…" : status === "saving" ? "Saving…" : status === "error" ? "Couldn't save in this browser" : "Saved"}
      </span>
      <span role="group" aria-label="Export notes" className="ml-auto flex items-center">
        <button type="button" className="nb-link" disabled={!hasNotes} onClick={() => void copyAll()}>{copied ? "Copied" : "Copy"}</button>
        <button type="button" className="nb-link" disabled={!hasNotes} onClick={download} title="Download as a text file">Download</button>
        <button type="button" className="nb-link" disabled={!hasNotes} onClick={print} title="Print or save as PDF">Print</button>
      </span>
    </header>
    {headerExtra && <div className="nb-extra">{headerExtra}</div>}

    <div ref={scroller} className="nb-page">
      {sections.map((section) => {
        const index = topics.findIndex((topic) => topic.id === section.id);
        const isLive = !review && section.id === liveId;
        return <div key={section.id} data-topic={section.id} className={`nb-section ${section.id === activeKey ? "nb-section-active" : ""}`}>
          <div className="flex items-center gap-2">
            {index >= 0 && <span className="nb-num">{index + 1}</span>}
            <h3 className="min-w-0 flex-1 truncate text-[.9375rem] font-semibold text-[#171d38]">{section.title}</h3>
            {isLive && <span className="nb-now">Now</span>}
            {onViewBoard && index >= 0 && !isLive && <button type="button" className="nb-link" onClick={() => onViewBoard(section.id)}>View board</button>}
          </div>
          <NoteArea value={notes[section.id] ?? ""} label={`Notes for ${section.title}`}
            placeholder={isLive || (section.general && !topics.length) ? "Start typing. “- ” starts a list." : "Add notes for this topic"}
            onFocus={() => setFocused(section.id)} onChange={(text) => onChange(section.id, text)} />
          {clipsFor(section.id).map((clip) => <figure key={clip.id} className="nb-clip">
            <figcaption className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{clip.label ?? "From the board"}</span>
              <button type="button" className="nb-clip-remove" aria-label="Remove this clip from your notes" onClick={() => onRemoveClip(clip.id)}>×</button>
            </figcaption>
            {clip.image && <img src={clip.image} alt={clip.text ? "" : "Saved from the board"} />}
            {clip.text && <p>{clip.text}</p>}
          </figure>)}
        </div>;
      })}
    </div>

    {!review && <footer className="nb-help">
      {liveId && !liveVisible && <button type="button" className="nb-live btn btn-primary btn-sm" onClick={jumpToLive}>Back to live topic ↓</button>}
      <p className="truncate text-xs text-smoke">{active ? <>Help with <b className="font-medium text-[#30385b]">{active.title}</b></> : "Help with this lesson"}</p>
      {lost[activeKey] ? <div role="status" className="nb-lost">
        <span>Your teacher was told someone is stuck. Your name wasn&apos;t shared.</span>
        <span className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-outline" onClick={() => onHelp("ask", active)}>Ask a question</button>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => onHelp("catchup", active)}>Catch me up</button>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => { setLost((map) => ({ ...map, [activeKey]: false })); onBackOnTrack(active); }}>I&apos;m back on track</button>
        </span>
      </div> : <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm nb-lost-btn" onClick={() => { setLost((map) => ({ ...map, [activeKey]: true })); onHelp("lost", active); }}>I&apos;m lost</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => onHelp("ask", active)}>Ask a question</button>
        <button type="button" className="btn btn-sm btn-outline" onClick={() => onHelp("catchup", active)}>Catch me up</button>
      </div>}
    </footer>}
  </section>;
}
