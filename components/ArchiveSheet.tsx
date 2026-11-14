"use client";
import type { Archived } from "@/lib/types";
import { MathView } from "./MathView";

/** Read-only look at every board the teacher cleared (notes + pen), newest first. */
export function BoardPreview({ b }: { b: Pick<Archived, "blocks" | "strokes"> }) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-stone bg-taupe p-4">
      <div className="space-y-2">{b.blocks.map((x) => (
        <div key={x.id} className="rounded-2xl border border-stone bg-eggshell px-3 py-2">{x.kind === "equation" ? <div className="text-xl"><MathView tex={x.content} /></div> : <p className="text-base">{x.content}</p>}</div>))}
        {b.blocks.length === 0 && b.strokes.length > 0 && <div className="h-40" />}
      </div>
      {b.strokes.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="Pen drawing">
          {b.strokes.map((s) => <path key={s.id} d={s.pts.map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join(" ")} fill="none" stroke="#000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
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
