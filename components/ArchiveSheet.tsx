"use client";
import type { Archived } from "@/lib/types";
import { MathView } from "./MathView";
import { InkPath } from "./InkPath";
import { BoardObject } from "./BoardObjects";

/** Read-only look at every board the teacher cleared (notes + pen), newest first. */
export function BoardPreview({ b }: { b: Pick<Archived, "blocks" | "strokes" | "inkAspect"> }) {
  let left = 0, top = 0, right = 1, bottom = 1;
  for (const stroke of b.strokes) {
    for (const [x, y] of stroke.pts) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  const width = right - left;
  const height = bottom - top;
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-stone bg-taupe p-4">
      <div className="space-y-2">{b.blocks.map((x) => (
        <div key={x.id} className="rounded-2xl border border-stone bg-eggshell px-3 py-2">{x.kind === "equation" ? <div className="text-xl"><MathView tex={x.content} /></div> : x.kind === "text" ? <p className="text-base">{x.content}</p> : <BoardObject kind={x.kind} content={x.content} stickyStyle={x.stickyStyle} />}</div>))}
      </div>
      {b.strokes.length > 0 && (
        <svg className="block w-full rounded-2xl border border-stone bg-eggshell" style={{ aspectRatio: (b.inkAspect ?? 1.5) * width / height, marginTop: b.blocks.length ? 8 : 0 }} viewBox={`${left} ${top} ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Archived pen drawing">
          {b.strokes.map((s) => <InkPath key={s.id} stroke={s} />)}
        </svg>)}
    </div>
  );
}

export function ArchiveSheet({ boards, onClose }: { boards: Archived[]; onClose: () => void }) {
  const list = [...boards].reverse();
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside role="dialog" aria-label="Whiteboard archive" className="h-full w-[min(460px,100vw)] overflow-y-auto bg-eggshell p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="display text-3xl">Board archive</h2><button className="btn btn-outline btn-sm" onClick={onClose}>Done</button></div>
        <p className="mt-2 text-sm text-smoke">Every time the board is cleared, the old one is saved here so you can look back at it.</p>
        <div className="mt-5 space-y-5">
          {list.length === 0 && <p className="rounded-2xl bg-taupe p-4 text-sm text-smoke">Nothing yet. Cleared boards will show up here.</p>}
          {list.map((b, i) => (
            <section key={b.id}><p className="mb-2 text-xs font-medium text-smoke">Board {list.length - i} · cleared at {new Date(b.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p><BoardPreview b={b} /></section>))}
        </div>
      </aside>
    </div>
  );
}
