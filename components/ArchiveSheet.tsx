"use client";
import type { Archived } from "@/lib/types";
import { MathView } from "./MathView";
import { InkPath } from "./InkPath";
import { BoardObject } from "./BoardObjects";
import { Sheet } from "./Sheet";

/** Read-only look at a board the teacher cleared (notes + pen). */
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
    <div className="board-preview">
      {b.blocks.length > 0 && <div className="grid gap-2">{b.blocks.map((x) => (
        <div key={x.id} className="board-preview-note">{x.kind === "equation" ? <div className="text-xl"><MathView tex={x.content} /></div> : x.kind === "text" ? <p className="text-base">{x.content}</p> : <BoardObject kind={x.kind} content={x.content} stickyStyle={x.stickyStyle} />}</div>))}
      </div>}
      {b.strokes.length > 0 && (
        <svg className="board-preview-ink" style={{ aspectRatio: (b.inkAspect ?? 1.5) * width / height, marginTop: b.blocks.length ? 8 : 0 }} viewBox={`${left} ${top} ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Archived pen drawing">
          {b.strokes.map((s) => <InkPath key={s.id} stroke={s} />)}
        </svg>)}
      {!b.blocks.length && !b.strokes.length && <p className="px-2 py-6 text-center text-sm text-smoke">This board was empty.</p>}
    </div>
  );
}

export function ArchiveSheet({ boards, onClose }: { boards: Archived[]; onClose: () => void }) {
  const list = [...boards].reverse();
  const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <Sheet title="Board archive" label="Whiteboard archive" onClose={onClose}
      subtitle="Each time the board is cleared, the old one is saved here so you can look back at it.">
      {list.length === 0 ? (
        <div className="sheet-empty">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><rect x="3" y="4" width="18" height="13" rx="3" /><path d="M8 20h8M12 17v3" /></svg>
          <p className="font-medium text-[#30385b]">No cleared boards yet</p>
          <p>When you clear the board or start a topic with a fresh board, the old one shows up here.</p>
        </div>
      ) : (
        <ol className="grid gap-4">
          {list.map((b, i) => (
            <li key={b.id} className="sheet-card pop-in" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="sheet-pill">Board {list.length - i}</span>
                <span className="text-xs text-smoke">Cleared at {time(b.ts)}</span>
              </div>
              <BoardPreview b={b} />
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}
