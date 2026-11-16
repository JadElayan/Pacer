"use client";
import { ChoiceMenu } from "./ChoiceMenu";

import type { Block, BlockKind, BoardShape, StickyStyle } from "@/lib/types";

const shapes = ["rectangle", "circle", "diamond", "arrow"] as const;
const templates = {
  "Brainstorm": ["What do we know?", "What questions do we have?", "Ideas to try"],
  "Compare and contrast": ["First idea", "What they share", "Second idea"],
  "Lesson recap": ["Key idea", "Worked example", "What to practice"],
};

export function BoardObjects({ panel, onAdd, onChooseShape, onClose }: {
  panel: "shapes" | "templates"; onAdd: (items: Pick<Block, "kind" | "content" | "stickyStyle">[]) => void;
  onChooseShape: (shape: BoardShape) => void; onClose: () => void;
}) {
  return <section id="board-insert-panel" aria-label={panel} className="absolute left-3 top-3 z-30 w-[min(25rem,calc(100%-1.5rem))] max-w-[calc(100%-1.5rem)] rounded-2xl border border-stone bg-eggshell p-3 shadow-xl"
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
  </section>;
}

const stickyColors = ["yellow", "pink", "blue", "green"] as const;
const colorClasses = { yellow: "bg-amber-100", pink: "bg-pink-100", blue: "bg-sky-100", green: "bg-emerald-100" };

export function StickyTools({ style = {}, onChange, onEdit, onDuplicate }: {
  style?: StickyStyle; onChange: (style: StickyStyle) => void; onEdit: () => void; onDuplicate: () => void;
}) {
  return <div role="group" aria-label="Sticky note formatting" className="mt-2 flex flex-wrap items-center gap-1" onClick={(event) => event.stopPropagation()}>
    <button type="button" className="btn btn-outline btn-sm" onClick={onEdit}>Edit</button>
    <button type="button" className="btn btn-outline btn-sm" aria-pressed={!!style.bold}
      onClick={() => onChange({ ...style, bold: !style.bold })}>Bold</button>
    <button type="button" className="btn btn-outline btn-sm" aria-pressed={style.align === "center"}
      onClick={() => onChange({ ...style, align: style.align === "center" ? "left" : "center" })}>Center</button>
    <ChoiceMenu label="Sticky note color" value={style.color ?? "yellow"} onChange={(value) => onChange({ ...style, color: value as StickyStyle["color"] })}>
      {stickyColors.map((color) => <option key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</option>)}
    </ChoiceMenu>
    <ChoiceMenu label="Sticky note size" value={style.size ?? "medium"} onChange={(value) => onChange({ ...style, size: value as StickyStyle["size"] })}>
      <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
    </ChoiceMenu>
    <button type="button" className="btn btn-outline btn-sm" onClick={onDuplicate}>Duplicate</button>
  </div>;
}

export function BoardObject({ kind, content, stickyStyle, shapeSize }: { kind: BlockKind; content: string; stickyStyle?: StickyStyle; shapeSize?: Block["shapeSize"] }) {
  if (kind === "sticky") {
    const size = { small: "w-28 text-sm", medium: "w-40 text-base", large: "w-56 text-lg" }[stickyStyle?.size ?? "medium"];
    return <p className={`min-h-16 max-w-full whitespace-pre-wrap break-words rounded p-4 text-slate-900 shadow-sm ${size} ${colorClasses[stickyStyle?.color ?? "yellow"]} ${stickyStyle?.bold ? "font-bold" : ""} ${stickyStyle?.align === "center" ? "text-center" : ""}`}>{content}</p>;
  }
  if (kind === "rectangle") return <span role="img" aria-label="Rectangle" style={shapeSize} className="block h-16 w-28 rounded border-2 border-blue-600 bg-blue-100" />;
  if (kind === "circle") return <span role="img" aria-label="Circle" style={shapeSize} className="block size-16 rounded-full border-2 border-violet-600 bg-violet-100" />;
  if (kind === "diamond" && shapeSize) return <span role="img" aria-label="Diamond" style={shapeSize}
    className="relative block bg-emerald-600 [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]">
    <span className="absolute inset-[3px] bg-emerald-100 [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]" />
  </span>;
  if (kind === "diamond") return <span role="img" aria-label="Diamond" className="m-3 block size-12 rotate-45 border-2 border-emerald-600 bg-emerald-100" />;
  if (kind === "arrow") return <span role="img" aria-label="Arrow" className="block text-5xl text-blue-700">→</span>;
  return <p className="text-xl leading-snug">{content}</p>;
}
