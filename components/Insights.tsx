"use client";
import { useMemo, useState } from "react";
import { askAI } from "@/lib/ai";
import { checkinStats, computeRows, MIN_GROUP, type Row } from "@/lib/insights";
import type { FeedbackEvent, RoomState } from "@/lib/types";

/** Live check-in poll: two rounded bars (correct / incorrect) that grow with each answer. Counts only, never names. */
function Poll({ ck, classSize }: { ck: { text: string; open: boolean; total: number; correct: number }; classSize: number }) {
  const wrong = ck.total - ck.correct;
  const denom = Math.max(classSize, ck.total, 1);
  const pct = ck.total ? Math.round((100 * ck.correct) / ck.total) : 0;
  const bar = (label: string, n: number, color: string, soft: string) => (
    <div className="flex flex-1 flex-col items-center gap-2">
      <span className="text-2xl font-light tabular-nums">{n}</span>
      <div className="relative h-28 w-full max-w-[72px] overflow-hidden rounded-full" style={{ background: soft }} role="img" aria-label={`${label}: ${n} of ${denom}`}>
        <div className="absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-500 ease-out" style={{ height: `${n ? Math.max(14, (n / denom) * 100) : 0}%`, background: color }} />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
  return (
    <div className="mt-4 rounded-[20px] border border-stone p-4">
      <div className="flex items-center justify-between"><p className="text-xs text-smoke">Check-in poll</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ck.open ? "bg-sky-soft text-sky-deep" : "bg-taupe text-smoke"}`}>{ck.open ? "Live" : "Closed"}</span></div>
      <p className="mt-1 truncate text-sm font-medium">{ck.text}</p>
      <div className="mt-3 flex gap-4">{bar("Correct", ck.correct, "#2fbf71", "#e3f6ec")}{bar("Incorrect", wrong, "#ef5b5b", "#fde8e8")}</div>
      <p className="mt-3 text-center text-xs text-smoke">{ck.total} of {Math.max(classSize, ck.total)} in class answered{ck.total ? ` · ${pct}% correct` : ""}</p>
      {ck.total >= 2 && wrong / ck.total >= 0.5 && <p className="mt-2 rounded-xl bg-taupe p-2 text-center text-xs">Half the class missed this. Consider re-explaining.</p>}
    </div>
  );
}

export function Insights({ state, events, connected, demo }: { state: RoomState; events: FeedbackEvent[]; connected: number; demo: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [tip, setTip] = useState<Record<string, string>>({});
  const { all, needHelp, totalAsks } = useMemo(() => { const r = computeRows(state, events); return { all: r.rows, needHelp: r.needHelp, totalAsks: r.totalAsks }; }, [events, state]);
  const rows = all.filter((r) => demo || r.students >= MIN_GROUP);
  const hidden = all.length - rows.length;
  const ck = checkinStats(state, events);

  const bars = useMemo(() => {
    const end = Date.now(); const out = Array(10).fill(0) as number[];
    events.filter((e) => e.kind === "confused").forEach((e) => { const i = 9 - Math.floor((end - e.ts) / 60000); if (i >= 0 && i < 10) out[i]++; });
    return out;
  }, [events]);
  const maxBar = Math.max(1, ...bars);

  const suggest = async (r: Row) => {
    setOpen(r.key);
    if (tip[r.key]) return;
    try {
      const res = await askAI({ kind: "clarify", selected: [r.label], context: state.blocks.map((b) => b.content), mode: "standard", topicTitle: r.topic, stats: `${r.students} students interacted, ${r.unresolved} still unresolved, ${r.asks} questions` });
      setTip((t) => ({ ...t, [r.key]: (res.source === "demo" ? "Demo suggestion: " : "") + res.text }));
    } catch { setTip((t) => ({ ...t, [r.key]: "Couldn't load a suggestion. Try again." })); }
  };

  return (
    <aside aria-label="Live insights" style={{ viewTransitionName: "pacer-insights" }} className="w-full shrink-0 overflow-y-auto rounded-[24px] border border-stone bg-eggshell p-5 md:w-[320px]">
      <h2 className="display text-2xl">Live insights</h2>
      <p className="mt-1 text-xs text-smoke">Anonymous and aggregated. You never see individual questions or settings.</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[["Connected", connected], ["Need help", needHelp], ["Questions", totalAsks]].map(([l, v]) => (
          <div key={l as string} className="rounded-[16px] bg-taupe p-3"><div className="text-2xl font-light">{v}</div><div className="text-xs text-smoke">{l}</div></div>))}
      </div>
      {ck && <Poll ck={ck} classSize={connected} />}
      <div className="mt-4"><p className="text-xs text-smoke">Confusion flags, last 10 minutes</p>
        <div className="mt-1 flex h-10 items-end gap-1" role="img" aria-label={`Confusion flags per minute: ${bars.join(", ")}`}>{bars.map((n, i) => <div key={i} className="flex-1 rounded-sm bg-sky" style={{ height: `${Math.max(6, (n / maxBar) * 100)}%`, opacity: n ? 1 : 0.25 }} />)}</div></div>
      <h3 className="mt-5 text-sm font-medium">Concepts needing attention</h3>
      <ul className="mt-2 space-y-2">
        {rows.length === 0 && <li className="text-sm text-smoke">No signals yet.</li>}
        {rows.map((r) => (
          <li key={r.key} className="rounded-[16px] border border-stone p-3">
            <button className="w-full text-left" onClick={() => suggest(r)} aria-expanded={open === r.key}>
              <span className="block truncate text-sm font-medium">{r.label}</span>
              <span className="text-xs text-smoke">{r.asks} questions · {r.students} students · {r.unresolved} unresolved</span>
            </button>
            {open === r.key && <p className="mt-2 rounded-xl bg-sky-soft p-2 text-xs">{tip[r.key] ?? "Thinking…"}<br /><span className="text-smoke">A suggestion only. You decide.</span></p>}
          </li>))}
      </ul>
      {hidden > 0 && <p className="mt-2 text-xs text-smoke">{hidden} item(s) hidden: fewer than {MIN_GROUP} students, to protect privacy. Turn on "Small group insights" in the header for tutoring or groups of 1 or 2.</p>}
    </aside>
  );
}
