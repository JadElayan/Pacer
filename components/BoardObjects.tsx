"use client";
import { useContext, useLayoutEffect, useRef, useState } from "react";
import { PanelOpenContext } from "./AnimatedPanel";
import { LiquidSwatches } from "./LiquidSwatches";
import { createPortal } from "react-dom";

import type { Block, BlockKind, BoardShape, StickyStyle } from "@/lib/types";

const shapes = ["rectangle", "circle", "diamond", "arrow"] as const;
const templates = {
  "Brainstorm": ["What do we know?", "What questions do we have?", "Ideas to try"],
  "Compare and contrast": ["First idea", "What they share", "Second idea"],
  "Lesson recap": ["Key idea", "Worked example", "What to practice"],
};

type Anchor = { top: number; left: number; right: number; bottom: number };

/** Opens beside the button that opened it (right of a side rail, or below a top bar), kept inside the window. */
function usePlacement(anchor: Anchor | undefined, mounted: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!anchor || !el) { setStyle(undefined); return; }
    const place = () => {
      const w = el.offsetWidth, h = el.offsetHeight, gap = 10, edge = 8;
      const vw = window.innerWidth, vh = window.innerHeight;
      const clamp = (v: number, max: number) => Math.max(edge, Math.min(max - edge, v));
      let left: number, top: number;
      if (anchor.right + gap + w <= vw - edge) { left = anchor.right + gap; top = clamp(anchor.top - 16, vh - h); }
      else if (anchor.left - gap - w >= edge) { left = anchor.left - gap - w; top = clamp(anchor.top - 16, vh - h); }
      else { left = clamp(anchor.left, vw - w); top = anchor.bottom + gap + h <= vh - edge ? anchor.bottom + gap : clamp(anchor.top - gap - h, vh - h); }
      setStyle({ position: "fixed", left, top, transformOrigin: left > anchor.left ? "left top" : "right top" });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor, mounted]);
  return [ref, style] as const;
}

export function BoardObjects({ panel, anchor, onAdd, onChooseShape, onClose, reduced = false }: {
  panel: "shapes" | "templates"; anchor?: Anchor; onAdd: (items: Pick<Block, "kind" | "content" | "stickyStyle">[]) => void;
  onChooseShape: (shape: BoardShape) => void; onClose: () => void; reduced?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const open = useContext(PanelOpenContext);
  const [ref, style] = usePlacement(anchor, mounted);
  useLayoutEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(<section key={panel} ref={ref} data-open={open} inert={!open} aria-hidden={!open || undefined} data-reduce-motion={reduced} style={style ?? { position: "fixed", left: 12, top: 80 }} id="board-insert-panel" aria-label={panel} className="board-insert-panel z-[100] w-[min(25rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-stone bg-eggshell p-3 shadow-xl"
    onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <div className="mb-2 flex items-center justify-between">
      <h2 className="font-semibold capitalize">{panel}</h2>
      <button type="button" className="btn btn-outline btn-sm" aria-label={`Close ${panel}`} onClick={onClose}>×</button>
    </div>
    <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-auto p-1">
      {panel === "shapes" && shapes.map((kind) => <button key={kind} type="button"
        className="rounded-xl p-2 text-sm capitalize hover:bg-sky-soft"
        onClick={() => onChooseShape(kind)}>
        <span className="mb-1 grid h-20 place-items-center rounded-lg bg-taupe"><BoardObject kind={kind} content={kind} /></span>
        {kind}
      </button>)}
      {panel === "templates" && Object.entries(templates).map(([name, prompts]) => {
        const notes = prompts.map((content, index) => ({ kind: "sticky" as const, content, stickyStyle: { color: stickyColors[index] } }));
        return <button key={name} type="button" className="rounded-xl p-2 text-left text-sm hover:bg-sky-soft" onClick={() => onAdd(notes)}>
          <span aria-hidden="true" className="mb-1 grid grid-cols-3 gap-1 rounded-lg bg-taupe p-2">
            {notes.map((note) => <span key={note.content} className={`min-h-14 rounded px-1 py-2 text-[9px] ${colorClasses[note.stickyStyle.color]}`}>{note.content}</span>)}
          </span>
          {name}
        </button>;
      })}
    </div>
  </section>, document.body);
}

const stickyColors = ["yellow", "pink", "blue", "green"] as const;
const colorClasses = { yellow: "bg-amber-100", pink: "bg-pink-100", blue: "bg-sky-100", green: "bg-emerald-100" };

// Swatch colours for sticky notes (a stronger version of each note colour, so the dots read at a glance).
const STICKY_SWATCHES = [["Yellow", "#f7c948"], ["Pink", "#f18bc4"], ["Blue", "#62b8ef"], ["Green", "#4fcf9a"]] as const;
const stickyByHex: Record<string, NonNullable<StickyStyle["color"]>> = { "#f7c948": "yellow", "#f18bc4": "pink", "#62b8ef": "blue", "#4fcf9a": "green" };
export const SHAPE_COLORS = [["Blue", "#2454e8"], ["Purple", "#7f5bd6"], ["Green", "#1d9e75"], ["Red", "#d0453b"], ["Orange", "#e08a1e"], ["Gray", "#4a5272"]] as const;
const SHAPE_DEFAULT: Partial<Record<BlockKind, string>> = { rectangle: "#2454e8", circle: "#7f5bd6", diamond: "#1d9e75", arrow: "#2454e8" };
export const shapeColor = (kind: BlockKind, color?: string) => color ?? SHAPE_DEFAULT[kind] ?? "#2454e8";

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 20 20" aria-hidden="true"><path d={d} /></svg>;
const Sep = () => <span className="object-toolbar-sep" aria-hidden="true" />;

/**
 * Floating toolbar for a selected sticky note, in the style of Miro: one row above the note with colour, size,
 * bold, alignment, edit, duplicate and delete. Colour changes flow like paint (LiquidSwatches).
 */
export function StickyTools({ style = {}, onChange, onEdit, onDuplicate, onDelete }: {
  style?: StickyStyle; onChange: (style: StickyStyle) => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const hex = STICKY_SWATCHES.find(([name]) => name.toLowerCase() === (style.color ?? "yellow"))?.[1] ?? STICKY_SWATCHES[0][1];
  return <div role="toolbar" aria-label="Sticky note" className="object-toolbar" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <LiquidSwatches label="Sticky note color" colors={STICKY_SWATCHES} value={hex} dot={16} onChange={(value) => onChange({ ...style, color: stickyByHex[value] })} />
    <Sep />
    <div role="radiogroup" aria-label="Size" className="object-toolbar-sizes">
      {([["small", "S"], ["medium", "M"], ["large", "L"]] as const).map(([size, short]) => <button key={size} type="button" role="radio"
        aria-checked={(style.size ?? "medium") === size} aria-label={`${size[0].toUpperCase()}${size.slice(1)}`} title={size[0].toUpperCase() + size.slice(1)}
        onClick={() => onChange({ ...style, size })}>{short}</button>)}
    </div>
    <Sep />
    <button type="button" className="connector-tool object-toolbar-bold" aria-pressed={!!style.bold} title="Bold" aria-label="Bold" onClick={() => onChange({ ...style, bold: !style.bold })}>B</button>
    <button type="button" className="connector-tool" aria-pressed={style.align === "center"} title="Center text" aria-label="Center text"
      onClick={() => onChange({ ...style, align: style.align === "center" ? "left" : "center" })}><Icon d="M4 5h12M6.5 10h7M4 15h12" /></button>
    <Sep />
    <button type="button" className="connector-tool" title="Edit text" aria-label="Edit text" onClick={onEdit}><Icon d="M4 16l1-4 8-8 3 3-8 8z M11.5 5.5l3 3" /></button>
    <button type="button" className="connector-tool" title="Duplicate" aria-label="Duplicate" onClick={onDuplicate}><Icon d="M7 7h9v9H7z M4 13V4h9" /></button>
    <button type="button" className="connector-tool connector-delete" title="Delete" aria-label="Delete" onClick={onDelete}><Icon d="M4.5 6h11 M8 6V4.5h4V6 M6 6l.7 10h6.6L14 6" /></button>
  </div>;
}

/** Floating toolbar for a selected shape: colour (flows like paint) and delete. */
export function ShapeTools({ kind, color, onChange, onDelete }: { kind: BlockKind; color?: string; onChange: (color: string) => void; onDelete: () => void }) {
  return <div role="toolbar" aria-label="Shape" className="object-toolbar" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <LiquidSwatches label="Shape color" colors={SHAPE_COLORS} value={shapeColor(kind, color)} dot={16} onChange={onChange} />
    <Sep />
    <button type="button" className="connector-tool connector-delete" title="Delete" aria-label="Delete" onClick={onDelete}><Icon d="M4.5 6h11 M8 6V4.5h4V6 M6 6l.7 10h6.6L14 6" /></button>
  </div>;
}

const stickyClasses = (style?: StickyStyle) => `sticky-note min-h-16 max-w-full rounded p-4 text-slate-900 shadow-sm ${
  { small: "w-28 text-sm", medium: "w-40 text-base", large: "w-56 text-lg" }[style?.size ?? "medium"]} ${colorClasses[style?.color ?? "yellow"]} ${
  style?.bold ? "font-bold" : ""} ${style?.align === "center" ? "text-center" : ""}`;

/** Edits a sticky note in place: Enter or clicking away saves, Shift+Enter adds a line, Escape cancels. */
export function StickyEditor({ content, style, size, onCommit, onCancel }: {
  content: string; style?: StickyStyle; size?: Block["shapeSize"]; onCommit: (content: string) => void; onCancel: () => void;
}) {
  const done = useRef(false);
  const finish = (save: boolean, value: string) => {
    if (done.current) return;
    done.current = true;
    const next = value.trim().slice(0, 500);
    if (save && next && next !== content) onCommit(next); else onCancel();
  };
  // Like Miro: the note keeps its look while you type, with the cursor at the end rather than everything selected.
  return <textarea data-board-editor autoFocus aria-label="Edit sticky note" defaultValue={content} maxLength={500}
    style={size ? { width: size.width, minHeight: size.height } : undefined}
    className={`${stickyClasses(style)} sticky-editing block resize-none whitespace-pre-wrap break-words outline-none [field-sizing:content]`}
    onFocus={(event) => { const el = event.currentTarget; el.setSelectionRange(el.value.length, el.value.length); }}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onBlur={(event) => finish(true, event.currentTarget.value)}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); finish(false, ""); }
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); finish(true, event.currentTarget.value); }
    }} />;
}

export function BoardObject({ kind, content, stickyStyle, shapeSize, color }: { kind: BlockKind; content: string; stickyStyle?: StickyStyle; shapeSize?: Block["shapeSize"]; color?: string }) {
  // A resized note keeps its exact width and height; long text scrolls inside it.
  if (kind === "sticky") return <p style={shapeSize ? { width: shapeSize.width, height: shapeSize.height } : undefined}
    className={`${stickyClasses(stickyStyle)} whitespace-pre-wrap break-words ${shapeSize ? "overflow-hidden" : ""}`}>{content}</p>;
  // Shapes take their colour from --shape (outline) and a light tint of it (fill); both blend smoothly when changed.
  const tint = { ["--shape" as string]: shapeColor(kind, color) } as React.CSSProperties;
  if (kind === "rectangle") return <span role="img" aria-label="Rectangle" style={{ ...shapeSize, ...tint }} className="board-shape block h-16 w-28 rounded border-2" />;
  if (kind === "circle") return <span role="img" aria-label="Circle" style={{ ...shapeSize, ...tint }} className="board-shape block size-16 rounded-full border-2" />;
  if (kind === "diamond" && shapeSize) return <span role="img" aria-label="Diamond" style={{ ...shapeSize, ...tint }}
    className="board-shape-solid relative block [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]">
    <span className="board-shape-fill absolute inset-[3px] [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />
  </span>;
  if (kind === "diamond") return <span role="img" aria-label="Diamond" style={tint} className="board-shape m-3 block size-12 rotate-45 border-2" />;
  if (kind === "arrow") return <span role="img" aria-label="Arrow" style={tint} className="board-shape-text block text-5xl">→</span>;
  return <p className="text-xl leading-snug">{content}</p>;
}
