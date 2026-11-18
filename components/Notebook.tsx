"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { escapeHtml, hasNoteText, htmlToText, noteHtml, sanitizeNoteHtml } from "@/lib/noteHtml";
import { FormatBar, RichNote } from "./NoteEditor";
import { InkCanvas } from "./InkCanvas";
import { SegmentedControl } from "./Motion";
import { LiquidSwatches } from "./LiquidSwatches";
import { INK_COLORS, PAGE_START, hasInk, inkBottom, inkOverImage, inkPageImage, type ClipPlace, type InkPage, type InkTool } from "@/lib/ink";
import { GENERAL_NOTES, clipInkKey, type NoteClip, type NoteInk, type NotesStatus, type TopicNotes } from "@/lib/useTopicNotes";
import { blocksFor, cardToText, normalizeBlocks, placedClips, removeBlock, serializeBlocks, type NoteBlock } from "@/lib/noteBlocks";

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
const blankHtml = (html: string) => !html.replace(/<br\s*\/?>|<\/?(div|p)>|&nbsp;|\s/gi, "");
/** Where a dragged clip or card would land: before block `at`, or splitting the text block at `at` into two halves. */
type Drop = { topic: string; at: number; split?: [string, string]; y: number };
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
  const writing = mode === "write" && !!onInk;
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
  const ownClips = (id: string) => clips.filter((clip) => clip.topicId === id || (id === GENERAL_NOTES && !topicIds.has(clip.topicId)));
  // Notes are blocks: text, clips and saved-answer cards. A clip shows where it was placed; one never placed (older notes) shows at the end of its topic.
  const placed = placedClips(notes);
  const clipById = new Map(clips.map((clip) => [clip.id, clip]));
  const blocksOf = (id: string) => blocksFor(notes[id] ?? "", clips.map((clip) => clip.id), ownClips(id).filter((clip) => !placed.has(clip.id)).map((clip) => clip.id));
  const setBlocks = (id: string, blocks: NoteBlock[]) => onChange(id, serializeBlocks(normalizeBlocks(blocks)));
  const clipsFor = (id: string) => blocksOf(id).flatMap((b) => b.kind === "clip" && clipById.has(b.id) ? [clipById.get(b.id)!] : []);
  const sections: (Topic & { general?: boolean })[] = [
    ...(!topics.length || hasNoteText(notes[GENERAL_NOTES]) || clipsFor(GENERAL_NOTES).length ? [{ id: GENERAL_NOTES, title: topics.length ? "General notes" : "Lesson notes", general: true }] : []),
    ...topics,
  ];
  const activeId = focused && sections.some((s) => s.id === focused) ? focused : liveId ?? sections.at(-1)?.id ?? GENERAL_NOTES;
  const active = topics.find((topic) => topic.id === activeId) ?? null;
  const activeKey = active?.id ?? GENERAL_NOTES;
  // The format bar works on the editor last typed in (a topic can have several text blocks between clips).
  const lastRich = useRef<HTMLElement | null>(null);
  const editorFor = (id: string) => {
    const section = scroller.current?.querySelector<HTMLElement>(`[data-topic="${CSS.escape(id)}"]`);
    return lastRich.current && section?.contains(lastRich.current) ? lastRich.current : section?.querySelector<HTMLElement>(".nb-rich") ?? null;
  };

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
  const asText = () => filled.map((s) => [s.title, ...blocksOf(s.id).map((b) => {
    if (b.kind === "text") return htmlToText(b.html);
    if (b.kind === "card") return `[${b.label}]\n${htmlToText(b.html)}`;
    const clip = clipById.get(b.id);
    return clip?.text ? `[${clipLabel(clip)}] ${clip.text}` : "";
  })].filter(Boolean).join("\n")).join("\n\n");
  // A clip's picture with any writing on it; uses the picture already on screen.
  const clipPicture = (clip: NoteClip) => {
    const page = ink[clipInkKey(clip.id)];
    const shown = scroller.current?.querySelector<HTMLImageElement>(`[data-clip="${CSS.escape(clip.id)}"] img`);
    return (hasInk(page) && shown && inkOverImage(shown, page!)) || clip.image;
  };
  const asHtml = (images: boolean) => filled.map((s) => `<h2>${escapeHtml(s.title)}</h2>${blocksOf(s.id).map((b) => {
    if (b.kind === "text") return blankHtml(b.html) ? "" : `<div class="n">${sanitizeNoteHtml(noteHtml(b.html))}</div>`;
    if (b.kind === "card") return `<figure><figcaption>${escapeHtml(b.label)}</figcaption><div class="n">${sanitizeNoteHtml(b.html)}</div></figure>`;
    const clip = clipById.get(b.id);
    if (!clip) return "";
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

  // ---- Clips are pictures placed anywhere on a topic's notes, in Type and Write mode. ----
  // Place and size are in INK_WIDTH units of the topic's note area (1000 = full width), stored on the topic's ink record.
  // Drag the picture (Type) or its grip (Write) to move; the corner resizes freely (Shift keeps the shape), edges one way.
  type FreeMode = "move" | "corner" | "right" | "bottom";
  type FreeDrag = { topic: string; id: string; mode: FreeMode; pointer: number; x0: number; y0: number; from: Required<ClipPlace>; now: Required<ClipPlace>; scale: number; moved: boolean };
  // Handlers read the ref (a quick drag can end before React re-renders); the state draws the clip while it moves.
  const [free, setFreeState] = useState<FreeDrag | null>(null);
  const freeRef = useRef<FreeDrag | null>(null);
  const setFree = (next: FreeDrag | null) => { freeRef.current = next; setFreeState(next); };
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  // Height of each topic's typed notes (in units), so clips not placed yet sit just below the text.
  const [textHeight, setTextHeight] = useState<Record<string, number>>({});
  const [aspects, setAspects] = useState<Record<string, number>>({});
  useEffect(() => {
    const root = scroller.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next: Record<string, number> = {};
      root.querySelectorAll<HTMLElement>(".nb-canvas").forEach((canvas) => {
        const topic = canvas.closest<HTMLElement>("[data-topic]")?.dataset.topic;
        const blocks = canvas.querySelector<HTMLElement>(".nb-blocks");
        if (topic && blocks && canvas.offsetWidth) next[topic] = Math.round((blocks.offsetHeight * 1000) / canvas.offsetWidth);
      });
      setTextHeight((old) => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    });
    root.querySelectorAll(".nb-canvas, .nb-blocks").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  });
  const placeOf = (topic: string, id: string, index: number): Required<ClipPlace> => {
    const saved = ink[topic]?.c?.[id];
    const w = saved?.w ?? 560;
    const h = saved?.h ?? Math.round(w * (aspects[id] ?? 0.5));
    return { x: saved?.x ?? 0, y: saved?.y ?? (textHeight[topic] ?? 0) + 24 + index * 420, w, h };
  };
  const clipBottom = (topic: string) => clipsFor(topic).reduce((max, clip, i) => { const p = free?.topic === topic && free.id === clip.id ? free.now : placeOf(topic, clip.id, i); return Math.max(max, p.y + p.h); }, 0);
  /** The writing page reaches down past the lowest clip, so you can write around every clip. */
  const pageWithClips = (topic: string): InkPage => {
    const page = pageFor(topic);
    const need = clipBottom(topic) - (textHeight[topic] ?? 0) + 60;
    return writing && need > (page.h ?? PAGE_START) ? { ...page, h: need } : page;
  };
  const commitPlace = (topic: string, id: string, place: Required<ClipPlace>) => {
    const page = pageFor(topic);
    changeInk(topic, { ...page, c: { ...page.c, [id]: { x: Math.round(place.x), y: Math.round(place.y), w: Math.round(place.w), h: Math.round(place.h) } } });
  };
  const startFree = (e: React.PointerEvent<HTMLElement>, topic: string, id: string, index: number, mode: FreeMode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (mode !== "move") e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
    const width = e.currentTarget.closest(".nb-canvas")?.getBoundingClientRect().width || 1000;
    const from = placeOf(topic, id, index);
    setSelectedClip(id);
    setFree({ topic, id, mode, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, from, now: from, scale: 1000 / width, moved: false });
  };
  const moveFree = (e: React.PointerEvent<HTMLElement>) => {
    const d = freeRef.current;
    if (d?.pointer !== e.pointerId) return;
    const dx = (e.clientX - d.x0) * d.scale, dy = (e.clientY - d.y0) * d.scale;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    const f = d.from;
    let now = f;
    if (d.mode === "move") now = { ...f, x: Math.min(1000 - f.w, Math.max(0, f.x + dx)), y: Math.max(0, f.y + dy) };
    else {
      let w = d.mode === "bottom" ? f.w : Math.min(1000 - f.x, Math.max(120, f.w + dx));
      let h = d.mode === "right" ? f.h : Math.max(60, f.h + dy);
      if (d.mode === "corner" && e.shiftKey) { const ratio = f.h / f.w; if (Math.abs(dx) > Math.abs(dy)) h = Math.max(60, w * ratio); else w = Math.min(1000 - f.x, Math.max(120, h / ratio)); }
      now = { ...f, w, h };
    }
    setFree({ ...d, now, moved: true });
  };
  const endFree = (e: React.PointerEvent<HTMLElement>) => {
    moveFree(e);
    const d = freeRef.current;
    if (d?.pointer !== e.pointerId) return;
    setFree(null);
    if (d.moved) commitPlace(d.topic, d.id, d.now);
  };
  const removeClip = (topic: string, id: string) => {
    const at = blocksOf(topic).findIndex((b) => b.kind === "clip" && b.id === id);
    if (at >= 0) setBlocks(topic, removeBlock(blocksOf(topic), at));
    setSelectedClip(null);
    onRemoveClip(id);
  };
  const keyNudge = (e: React.KeyboardEvent, topic: string, id: string, place: Required<ClipPlace>, resizing: boolean) => {
    const step = e.shiftKey ? 60 : 20;
    const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeClip(topic, id); return; }
    if (!d) return;
    e.preventDefault();
    commitPlace(topic, id, resizing
      ? { ...place, w: Math.min(1000 - place.x, Math.max(120, place.w + d[0])), h: Math.max(60, place.h + d[1]) }
      : { ...place, x: Math.min(1000 - place.w, Math.max(0, place.x + d[0])), y: Math.max(0, place.y + d[1]) });
  };

  // ---- Moving clips and cards: drag the ⋮⋮ handle, use Alt+↑ / Alt+↓, or the block menu. ----
  const [menu, setMenu] = useState<{ topic: string; index: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  type BlockDrag = { topic: string; index: number; label: string; x: number; y: number; moved: boolean; pointer: number };
  // Pointer handlers read refs: a quick drag can finish before React re-renders with the new state.
  const [drag, setDragState] = useState<BlockDrag | null>(null);
  const dragRef = useRef<BlockDrag | null>(null);
  const setDrag = (next: BlockDrag | null) => { dragRef.current = next; setDragState(next); };
  const dropRef = useRef<Drop | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  type BlockResize = { topic: string; index: number; w: number; pointer: number };
  const [resize, setResizeState] = useState<BlockResize | null>(null);
  const resizeRef = useRef<BlockResize | null>(null);
  const setResize = (next: BlockResize | null) => { resizeRef.current = next; setResizeState(next); };
  const focusBlock = (key: string) => requestAnimationFrame(() => scroller.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"] .nb-handle`)?.focus());
  const keyOf = (topic: string, b: NoteBlock, i: number) => b.kind === "clip" ? `clip-${b.id}` : `card-${topic}-${i}`;
  const move = (from: { topic: string; index: number }, to: { topic: string; at: number; split?: [string, string] }) => {
    const source = blocksOf(from.topic);
    const block = source[from.index];
    if (!block || block.kind === "text") return;
    if (from.topic === to.topic) {
      if (!to.split && (to.at === from.index || to.at === from.index + 1)) return;
      const insert: NoteBlock[] = to.split ? [{ kind: "text", html: to.split[0] }, block, { kind: "text", html: to.split[1] }] : [block];
      const replaced = to.split ? 1 : 0;
      const next = [...source];
      next.splice(to.at, replaced, ...insert);
      const shifted = from.index > to.at || (!to.split && from.index === to.at) ? from.index + insert.length - replaced : from.index;
      next.splice(shifted, 1);
      setBlocks(from.topic, next);
    } else {
      const target = blocksOf(to.topic);
      const next = [...target];
      if (to.split) next.splice(to.at, 1, { kind: "text", html: to.split[0] }, block, { kind: "text", html: to.split[1] });
      else next.splice(to.at, 0, block);
      setBlocks(from.topic, removeBlock(source, from.index));
      setBlocks(to.topic, next);
    }
    if (block.kind === "clip") focusBlock(`clip-${block.id}`);
  };
  const step = (topic: string, index: number, dir: -1 | 1) => {
    const blocks = blocksOf(topic);
    // Skip over an empty text block so each press visibly moves the block past something.
    let at = dir < 0 ? index - 1 : index + 2;
    if (dir < 0 && blocks[at]?.kind === "text" && blankHtml((blocks[at] as { html: string }).html)) at -= 1;
    if (dir > 0 && blocks[index + 1]?.kind === "text" && blankHtml((blocks[index + 1] as { html: string }).html)) at += 1;
    if (at < 0 || at > blocks.length) return;
    move({ topic, index }, { topic, at });
  };
  const remove = (topic: string, index: number) => {
    const block = blocksOf(topic)[index];
    setMenu(null);
    setBlocks(topic, removeBlock(blocksOf(topic), index));
    if (block?.kind === "clip") onRemoveClip(block.id);
  };
  /** Finds where a drop at (x, y) would land, including between the lines of a text block. */
  const findDrop = (x: number, y: number): Drop | null => {
    const root = scroller.current;
    const section = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-topic]");
    if (!root || !section || !root.contains(section)) return null;
    const topic = section.dataset.topic!;
    const base = root.getBoundingClientRect().top - root.scrollTop;
    const els = [...section.querySelectorAll<HTMLElement>(":scope > .nb-blocks > .nb-block")];
    for (const el of els) {
      const at = Number(el.dataset.blockIndex);
      const r = el.getBoundingClientRect();
      if (el.dataset.kind !== "text") { if (y < r.top + r.height / 2) return { topic, at, y: r.top - base }; continue; }
      const editor = el.querySelector<HTMLElement>(".nb-rich");
      const lines = editor ? [...editor.childNodes].filter((n) => n.nodeType === Node.ELEMENT_NODE || n.textContent?.trim()) : [];
      for (let k = 0; k < lines.length; k++) {
        const node = lines[k];
        const lr = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement).getBoundingClientRect() : (() => { const range = document.createRange(); range.selectNode(node); return range.getBoundingClientRect(); })();
        if (y < lr.top + lr.height / 2) {
          if (k === 0) return { topic, at, y: r.top - base };
          const html = (nodes: ChildNode[]) => nodes.map((n) => n.nodeType === Node.ELEMENT_NODE ? (n as HTMLElement).outerHTML : escapeHtml(n.textContent ?? "")).join("");
          const all = [...editor!.childNodes];
          const cut = all.indexOf(node);
          return { topic, at, split: [html(all.slice(0, cut)), html(all.slice(cut))], y: lr.top - base };
        }
      }
      if (y < r.bottom) return { topic, at: at + 1, y: r.bottom - base };
    }
    const last = els.at(-1)?.getBoundingClientRect();
    return { topic, at: blocksOf(topic).length, y: (last ? last.bottom : section.getBoundingClientRect().bottom) - base };
  };
  const handle = (topic: string, index: number, label: string) => <button type="button" className="nb-handle"
    aria-label={`Move or change: ${label}. Alt+Up or Alt+Down moves it.`} aria-haspopup="menu" aria-expanded={menu?.topic === topic && menu.index === index}
    onPointerDown={(e) => {
      if (e.button !== 0) return;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
      setDrag({ topic, index, label, x: e.clientX, y: e.clientY, moved: false, pointer: e.pointerId });
    }}
    onPointerMove={(e) => {
      const drag = dragRef.current;
      if (drag?.pointer !== e.pointerId) return;
      const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6;
      if (!moved) return;
      setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });
      dropRef.current = findDrop(e.clientX, e.clientY);
      setDrop(dropRef.current);
      setMenu(null);
    }}
    onPointerUp={(e) => {
      const drag = dragRef.current;
      if (drag?.pointer !== e.pointerId) return;
      const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6;
      const drop = moved ? findDrop(e.clientX, e.clientY) ?? dropRef.current : null;
      dropRef.current = null;
      if (moved) { if (drop) move({ topic, index }, drop); }
      else setMenu(menu?.topic === topic && menu.index === index ? null : { topic, index });
      setDrag(null); setDrop(null);
    }}
    onPointerCancel={() => { setDrag(null); setDrop(null); }}
    onKeyDown={(e) => {
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); step(topic, index, e.key === "ArrowUp" ? -1 : 1); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMenu({ topic, index }); }
      else if (e.key === "Escape") setMenu(null);
    }}>
    <svg viewBox="0 0 12 18" aria-hidden="true"><circle cx="3.5" cy="4" r="1.4" /><circle cx="8.5" cy="4" r="1.4" /><circle cx="3.5" cy="9" r="1.4" /><circle cx="8.5" cy="9" r="1.4" /><circle cx="3.5" cy="14" r="1.4" /><circle cx="8.5" cy="14" r="1.4" /></svg>
  </button>;
  const blockMenu = (topic: string, index: number, block: NoteBlock) => menu?.topic === topic && menu.index === index && <div role="menu" className="nb-block-menu" onKeyDown={(e) => e.key === "Escape" && setMenu(null)}>
    <button role="menuitem" type="button" onClick={() => { setMenu(null); step(topic, index, -1); }}>Move up</button>
    <button role="menuitem" type="button" onClick={() => { setMenu(null); step(topic, index, 1); }}>Move down</button>
    {sections.filter((s) => s.id !== topic).slice(0, 8).map((s) => <button key={s.id} role="menuitem" type="button"
      onClick={() => { setMenu(null); move({ topic, index }, { topic: s.id, at: blocksOf(s.id).length }); }}>Move to {s.title}</button>)}
    {block.kind === "card" && <button role="menuitem" type="button" onClick={() => { setMenu(null); setBlocks(topic, cardToText(blocksOf(topic), index)); }}>Turn into notes</button>}
    <button role="menuitem" type="button" className="nb-block-menu-danger" onClick={() => remove(topic, index)}>Remove</button>
  </div>;

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
      {onInk && <SegmentedControl label="Note style" value={mode} onChange={setMode}
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

    <div ref={scroller} className="nb-page" data-dragging={drag?.moved || undefined}
      onFocusCapture={(e) => { if ((e.target as HTMLElement).classList?.contains("nb-rich")) lastRich.current = e.target as HTMLElement; }}>
      {drop && <div aria-hidden="true" className="nb-drop-line" style={{ top: drop.y }} />}
      {drag?.moved && <div aria-hidden="true" className="nb-drag-ghost" style={{ left: drag.x, top: drag.y }}>{drag.label}</div>}
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
          <div className="nb-canvas" style={{ minHeight: `${clipBottom(section.id) / 10 + 2}cqw` }}
            onPointerDown={(e) => { if (!(e.target as Element).closest(".nb-free")) setSelectedClip(null); }}>
          <div className="nb-blocks">{(() => {
            const blocks = blocksOf(section.id);
            return blocks.map((b, i) => {
              if (b.kind === "text") {
                const empty = blankHtml(b.html);
                if (writing && empty && i > 0) return null;
                if (writing && empty && blocks.length === 1) return null;
                return <div key={`t-${i}`} className="nb-block" data-kind="text" data-block-index={i} data-gap={empty && i > 0 ? true : undefined}>
                  <RichNote value={b.html} label={`Notes for ${section.title}${i > 0 ? ", continued" : ""}`}
                    placeholder={i === 0 ? (isLive || (section.general && !topics.length) ? "Start typing. “- ” starts a list, “[] ” a checklist, “# ” a heading." : "Add notes for this topic") : ""}
                    onFocus={() => setFocused(section.id)} onChange={(html) => setBlocks(section.id, blocks.map((x, j) => j === i ? { kind: "text", html } : x))} />
                </div>;
              }
              const key = keyOf(section.id, b, i);
              if (b.kind === "card") {
                const shut = collapsed[key];
                return <div key={key} data-key={key} className="nb-block" data-kind="card" data-block-index={i}>
                  {handle(section.id, i, b.label)}
                  <div className="nb-card" data-collapsed={shut || undefined}>
                    <div className="nb-card-head">
                      <span className="min-w-0 flex-1 truncate">{b.label}</span>
                      <button type="button" className="nb-link" aria-expanded={!shut} onClick={() => setCollapsed((c) => ({ ...c, [key]: !shut }))}>{shut ? "Show" : "Hide"}</button>
                    </div>
                    {!shut && <RichNote value={b.html} label={`${b.label}, saved in ${section.title}`} placeholder=""
                      onFocus={() => setFocused(section.id)} onChange={(html) => setBlocks(section.id, blocks.map((x, j) => j === i ? { ...b, html } : x))} />}
                  </div>
                  {blockMenu(section.id, i, b)}
                </div>;
              }
              // Clips aren't rows in the text: they float on the topic's notes (rendered below).
              return null;
            });
          })()}</div>
          {(writing || hasInk(ink[section.id])) && <div className="nb-ink-page" data-writing={writing || undefined}
            onPointerDown={() => setFocused(section.id)}>
            {writing && !hasInk(ink[section.id]) && <span className="nb-ink-hint" aria-hidden="true">Write here with a pen, finger or mouse</span>}
            <InkCanvas page={pageWithClips(section.id)} editable={writing} tool={tool} label={`Handwritten notes for ${section.title}`}
              onChange={(page) => {
                const h = page.h ?? PAGE_START;
                changeInk(section.id, inkBottom(page.s) > h - 140 ? { ...page, h: h + GROW } : page);
              }} />
          </div>}
          {clipsFor(section.id).map((clip, i) => {
            const live = free?.topic === section.id && free.id === clip.id ? free.now : undefined;
            const place = live ?? placeOf(section.id, clip.id, i);
            const picked = selectedClip === clip.id;
            const handlers = (mode: FreeMode) => ({ onPointerDown: (e: React.PointerEvent<HTMLElement>) => startFree(e, section.id, clip.id, i, mode), onPointerMove: moveFree, onPointerUp: endFree, onPointerCancel: () => setFree(null) });
            return <figure key={clip.id} className="nb-free" data-clip={clip.id} data-picked={picked || undefined} data-moving={live ? true : undefined} data-writing={writing || undefined}
              title={clipLabel(clip)} tabIndex={0} aria-label={`${clipLabel(clip)}. Arrow keys move it, Delete removes it.`}
              onKeyDown={(e) => { if (e.target === e.currentTarget) keyNudge(e, section.id, clip.id, place, false); }}
              onFocus={() => setSelectedClip(clip.id)}
              style={{ left: `${place.x / 10}cqw`, top: `${place.y / 10}cqw`, width: `${place.w / 10}cqw`, height: clip.image ? `${place.h / 10}cqw` : undefined, minHeight: clip.image ? undefined : `${Math.min(place.h, 200) / 10}cqw` }}
              {...(!writing ? handlers("move") : {})}>
              {clip.image ? <>
                <img src={clip.image} alt={clip.text ? "" : "Saved from the board"} draggable={false}
                  onLoad={(e) => { const img = e.currentTarget; if (img.naturalWidth && !aspects[clip.id]) setAspects((a) => ({ ...a, [clip.id]: img.naturalHeight / img.naturalWidth })); }} />
                {(writing || hasInk(ink[clipInkKey(clip.id)])) && <InkCanvas fill page={ink[clipInkKey(clip.id)] ?? EMPTY} editable={writing} tool={tool}
                  label={`Your writing on ${clipLabel(clip)}`} onChange={(page) => changeInk(clipInkKey(clip.id), page)} />}
              </> : <p>{clip.text}</p>}
              {writing && <span className="nb-free-grip" role="button" tabIndex={0} aria-label={`Move ${clipLabel(clip)}`} {...handlers("move")}
                onKeyDown={(e) => keyNudge(e, section.id, clip.id, place, false)}>
                <svg viewBox="0 0 12 18" aria-hidden="true"><circle cx="3.5" cy="4" r="1.4" /><circle cx="8.5" cy="4" r="1.4" /><circle cx="3.5" cy="9" r="1.4" /><circle cx="8.5" cy="9" r="1.4" /><circle cx="3.5" cy="14" r="1.4" /><circle cx="8.5" cy="14" r="1.4" /></svg>
              </span>}
              <button type="button" className="nb-free-remove" aria-label={`Remove ${clipLabel(clip)} from your notes`} onPointerDown={(e) => e.stopPropagation()} onClick={() => removeClip(section.id, clip.id)}>×</button>
              <span className="nb-free-edge nb-free-right" aria-hidden="true" {...handlers("right")} />
              <span className="nb-free-edge nb-free-bottom" aria-hidden="true" {...handlers("bottom")} />
              <span className="nb-free-corner" role="slider" tabIndex={0} aria-label={`Size of ${clipLabel(clip)}. Arrow keys resize it.`} aria-valuenow={Math.round(place.w / 10)} {...handlers("corner")}
                onKeyDown={(e) => keyNudge(e, section.id, clip.id, place, true)} />
            </figure>;
          })}
          </div>
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
