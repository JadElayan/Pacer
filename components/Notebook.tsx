"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { escapeHtml, hasNoteText, htmlToText, noteHtml, sanitizeNoteHtml } from "@/lib/noteHtml";
import { FormatBar, RichNote } from "./NoteEditor";
import { InkCanvas } from "./InkCanvas";
import { SegmentedControl } from "./Motion";
import { LiquidSwatches } from "./LiquidSwatches";
import { INK_COLORS, PAGE_START, hasInk, inkBottom, inkOverImage, inkPageImage, type InkPage, type InkTool } from "@/lib/ink";
import { GENERAL_NOTES, clipInkKey, type NoteClip, type NoteInk, type NotesStatus, type TopicNotes } from "@/lib/useTopicNotes";

type Topic = { id: string; title: string };
type Help = "lost" | "ask" | "catchup";

/** Turns an AI answer into plain note text: no markdown symbols, bullets as "•". */
export function plainNote(text: string) {
  return text.replace(/\r/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s*/gm, "").replace(/^(\s*)[-*]\s+/gm, "$1• ")
    .replace(/^catch-up:?\s*\n/i, "").replace(/\n{3,}/g, "\n\n").trim();
}

const fileName = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lesson"}-notes`;

const EMPTY: InkPage = { s: [] };
const GROW = 360;
const readMode = () => { try { return localStorage.getItem("pacer:notes-input") === "write" ? "write" : "type"; } catch { return "type"; } };

export function Notebook({ lessonTitle, topics, liveId, notes, clips, ink = {}, status, ready, review, headerExtra, onChange, onRemoveClip, onInk, onHelp, onBackOnTrack, onViewBoard }: {
  lessonTitle: string; topics: Topic[]; liveId: string | null; notes: TopicNotes; clips: NoteClip[]; ink?: NoteInk; status: NotesStatus; ready: boolean; review: boolean;
  headerExtra?: ReactNode; onChange: (topic: string, html: string) => void; onRemoveClip: (id: string) => void;
  onInk?: (id: string, page: InkPage | null) => void;
  onHelp: (kind: Help, topic: Topic | null) => void; onBackOnTrack: (topic: Topic | null) => void; onViewBoard?: (topicId: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Tablets: when the on-screen keyboard opens, keep the line being typed in view.
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const keep = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && scroller.current?.contains(active)) active.scrollIntoView({ block: "nearest" });
    };
    view.addEventListener("resize", keep);
    return () => view.removeEventListener("resize", keep);
  }, []);
  // Type or Write: Write turns each topic into a lined page for a pen or finger, and lets you write over clips.
  const [mode, setModeState] = useState<"type" | "write">("type");
  useEffect(() => { setModeState(readMode()); }, []);
  const setMode = (next: "type" | "write") => { setModeState(next); try { localStorage.setItem("pacer:notes-input", next); } catch { /* not saved */ } };
  const writing = mode === "write" && !review && !!onInk;
  const [tool, setTool] = useState<InkTool>({ kind: "pen", color: INK_COLORS[0][1] });
  const history = useRef<{ id: string; page?: InkPage }[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const changeInk = (id: string, page: InkPage) => {
    history.current = [...history.current.slice(-49), { id, page: ink[id] }];
    setCanUndo(true);
    onInk?.(id, page.s.length || page.h ? page : null);
  };
  const undo = () => {
    const last = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (last) onInk?.(last.id, last.page ?? null);
  };
  const pageFor = (id: string): InkPage => ({ ...(ink[id] ?? EMPTY), h: ink[id]?.h ?? PAGE_START });
  const [focused, setFocused] = useState<string | null>(null);
  const [liveVisible, setLiveVisible] = useState(true);
  const [lost, setLost] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const topicIds = new Set(topics.map((topic) => topic.id));
  // Clips whose topic no longer exists fall back to the general section.
  const clipsFor = (id: string) => clips.filter((clip) => clip.topicId === id || (id === GENERAL_NOTES && !topicIds.has(clip.topicId)));
  const sections: (Topic & { general?: boolean })[] = [
    ...(!topics.length || hasNoteText(notes[GENERAL_NOTES]) || clipsFor(GENERAL_NOTES).length ? [{ id: GENERAL_NOTES, title: topics.length ? "General notes" : "Lesson notes", general: true }] : []),
    ...topics,
  ];
  const activeId = focused && sections.some((s) => s.id === focused) ? focused : liveId ?? sections.at(-1)?.id ?? GENERAL_NOTES;
  const active = topics.find((topic) => topic.id === activeId) ?? null;
  const activeKey = active?.id ?? GENERAL_NOTES;
  const editorFor = (id: string) => scroller.current?.querySelector<HTMLElement>(`[data-topic="${CSS.escape(id)}"] .nb-rich`) ?? null;

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
    editorFor(liveId)?.focus({ preventScroll: true });
    section?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const filled = sections.filter((s) => hasNoteText(notes[s.id]) || clipsFor(s.id).length || hasInk(ink[s.id]));
  const hasNotes = filled.length > 0;
  const clipLabel = (clip: NoteClip) => clip.label ?? "From the board";
  const asText = () => filled.map((s) => [s.title, htmlToText(notes[s.id]),
    ...clipsFor(s.id).filter((clip) => clip.text).map((clip) => `[${clipLabel(clip)}] ${clip.text}`)].filter(Boolean).join("\n")).join("\n\n");
  // A clip's picture with any writing on it; uses the picture already on screen.
  const clipPicture = (clip: NoteClip) => {
    const page = ink[clipInkKey(clip.id)];
    const shown = scroller.current?.querySelector<HTMLImageElement>(`[data-clip="${CSS.escape(clip.id)}"] img`);
    return (hasInk(page) && shown && inkOverImage(shown, page!)) || clip.image;
  };
  const asHtml = (images: boolean) => filled.map((s) => `<h2>${escapeHtml(s.title)}</h2>${hasNoteText(notes[s.id]) ? `<div class="n">${sanitizeNoteHtml(noteHtml(notes[s.id]))}</div>` : ""}${clipsFor(s.id).map((clip) => {
    const picture = images ? clipPicture(clip) : undefined;
    return `<figure><figcaption>${escapeHtml(clipLabel(clip))}</figcaption>${picture?.startsWith("data:image/") ? `<img src="${picture}" alt="">` : ""}${clip.text ? `<p>${escapeHtml(clip.text)}</p>` : ""}</figure>`;
  }).join("")}${images && hasInk(ink[s.id]) ? `<img class="ink" src="${inkPageImage(ink[s.id])}" alt="Handwritten notes">` : ""}`).join("");
  // Copies formatting too, so pasting into Google Docs keeps headings, bold and lists.
  const copyAll = async () => {
    try {
      const text = asText();
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([`<h1>${escapeHtml(lessonTitle)}</h1>${asHtml(false)}`], { type: "text/html" }),
          "text/plain": new Blob([`${lessonTitle}\n\n${text}`], { type: "text/plain" }),
        })]);
      } else await navigator.clipboard.writeText(`${lessonTitle}\n\n${text}`);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${lessonTitle}\n\n${asText()}\n`], { type: "text/plain;charset=utf-8" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `${fileName(lessonTitle)}.txt` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Opens a clean page with headings, formatted notes and saved pictures, ready to print or save as a PDF.
  const print = () => {
    const page = window.open("", "_blank");
    if (!page) return;
    page.document.write(`<!doctype html><meta charset="utf-8"><title>${escapeHtml(lessonTitle)} notes</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#1f2540;max-width:720px;margin:32px auto;padding:0 24px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 6px;padding-bottom:4px;border-bottom:1px solid #dcdfee}h3{font-size:15.5px;margin:12px 0 2px}.n h2{font-size:19px;border:0;margin:14px 0 4px;padding:0}h4{font-size:14.5px;margin:10px 0 2px;color:#4a5272}blockquote{margin:0 0 0 28px}ul,ol{margin:4px 0 8px;padding-left:24px}ul[data-checklist]{list-style:none;padding-left:4px}ul[data-checklist] li::before{content:"±0  "}ul[data-checklist] li[data-checked=true]::before{content:"±1  "}li[data-checked=true]{text-decoration:line-through;color:#8a90a8}mark{background:#fde68a}a{color:#1d4ed8}p{white-space:pre-wrap;margin:0 0 10px}figure{margin:10px 0;padding:10px;border:1px solid #dcdfee;border-radius:10px;break-inside:avoid}figcaption{font-size:12px;color:#6b655d;margin-bottom:6px}img{max-width:100%;max-height:260px}</style><h1>${escapeHtml(lessonTitle)}</h1>${asHtml(true)}`);
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
        <button type="button" className="nb-link" disabled={!hasNotes} onClick={() => void copyAll()} title="Copy with formatting, ready to paste into Google Docs">{copied ? "Copied" : "Copy"}</button>
        <button type="button" className="nb-link" disabled={!hasNotes} onClick={download} title="Download as a text file">Download</button>
        <button type="button" className="nb-link" disabled={!hasNotes} onClick={print} title="Print or save as PDF">Print</button>
      </span>
    </header>
    <div className="nb-tools" data-mode={writing ? "write" : "type"}>
      {onInk && !review && <SegmentedControl label="Note style" value={mode} onChange={setMode}
        options={[{ value: "type", label: "Type" }, { value: "write", label: "Write" }] as const} />}
      {writing ? <div role="toolbar" aria-label="Pen" className="nb-ink-bar">
        <LiquidSwatches label="Pen color" colors={INK_COLORS} value={tool.color} dot={16} onChange={(color) => setTool({ kind: "pen", color })} />
        <span className="nb-format-sep" aria-hidden="true" />
        <button type="button" className="connector-tool" aria-pressed={tool.kind === "highlighter"} title="Highlighter" aria-label="Highlighter"
          onClick={() => setTool((t) => ({ ...t, kind: t.kind === "highlighter" ? "pen" : "highlighter" }))}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 15 3-1 8-8-2-2-8 8z M11 6l2 2 M4 17h7" /></svg>
        </button>
        <button type="button" className="connector-tool" aria-pressed={tool.kind === "eraser"} title="Eraser: touch a line to remove it" aria-label="Eraser"
          onClick={() => setTool((t) => ({ ...t, kind: t.kind === "eraser" ? "pen" : "eraser" }))}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 16 8.5-8.5-4-4L3 13l3 3h10 M6.5 9.5l4 4" /></svg>
        </button>
        <button type="button" className="connector-tool" title="Undo" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5 3.5 8.5 7 12 M4 8.5h8a4 4 0 0 1 0 8H9" /></svg>
        </button>
      </div> : <FormatBar target={() => editorFor(activeKey)} />}
    </div>
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
          {(!writing || hasNoteText(notes[section.id])) && <RichNote value={notes[section.id] ?? ""} label={`Notes for ${section.title}`}
            placeholder={isLive || (section.general && !topics.length) ? "Start typing. “- ” starts a list, “[] ” a checklist, “# ” a heading." : "Add notes for this topic"}
            onFocus={() => setFocused(section.id)} onChange={(html) => onChange(section.id, html)} />}
          {clipsFor(section.id).map((clip) => <figure key={clip.id} className="nb-clip" data-clip={clip.id} data-writing={writing || undefined}>
            {clip.image && <div className="nb-clip-media">
              <img src={clip.image} alt={clip.text ? "" : "Saved from the board"} draggable={false} />
              {(writing || hasInk(ink[clipInkKey(clip.id)])) && <InkCanvas fill page={ink[clipInkKey(clip.id)] ?? EMPTY} editable={writing} tool={tool}
                label={`Your writing on ${clipLabel(clip)}`} onChange={(page) => changeInk(clipInkKey(clip.id), page)} />}
            </div>}
            {clip.text && <p>{clip.text}</p>}
            <figcaption>
              <span className="min-w-0 flex-1 truncate">{clipLabel(clip)}</span>
              <button type="button" className="nb-clip-remove" aria-label="Remove this clip from your notes" onClick={() => onRemoveClip(clip.id)}>×</button>
            </figcaption>
          </figure>)}
          {(writing || hasInk(ink[section.id])) && <div className="nb-ink-page" data-writing={writing || undefined}
            onPointerDown={() => setFocused(section.id)}>
            {writing && !hasInk(ink[section.id]) && <span className="nb-ink-hint" aria-hidden="true">Write here with a pen, finger or mouse</span>}
            <InkCanvas page={pageFor(section.id)} editable={writing} tool={tool} label={`Handwritten notes for ${section.title}`}
              onChange={(page) => {
                const h = page.h ?? PAGE_START;
                changeInk(section.id, inkBottom(page.s) > h - 140 ? { ...page, h: h + GROW } : page);
              }} />
          </div>}
          {writing && <button type="button" className="nb-link nb-more-space" onClick={() => { const page = pageFor(section.id); changeInk(section.id, { ...page, h: (page.h ?? PAGE_START) + GROW }); }}>
            More space
          </button>}
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
