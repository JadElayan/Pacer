"use client";
import { useMemo, useState } from "react";
import { askAI } from "@/lib/ai";
import type { FeedbackEvent, RoomState } from "@/lib/types";

const MIN_GROUP = 3;
interface Row { key: string; label: string; topic: string; asks: number; students: number; unresolved: number }

export function Insights({ state, events, connected }: { state: RoomState; events: FeedbackEvent[]; connected: number }) {
  const [showSmall, setShowSmall] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [tip, setTip] = useState<Record<string, string>>({});

  const { rows, hidden, needHelp, totalAsks } = useMemo(() => {
    const by = new Map<string, FeedbackEvent[]>();
    events.forEach((e) => { const k = e.blockId ?? e.topicId ?? "?"; by.set(k, [...(by.get(k) ?? []), e]); });
    const rs: Row[] = []; const helpSet = new Set<string>();
    by.forEach((evs, key) => {
      const b = state.blocks.find((x) => x.id === key); const tp = state.topics.find((x) => x.id === (b?.topicId ?? key));
      const last = new Map<string, FeedbackEvent["kind"]>();
      [...evs].sort((a, c) => a.ts - c.ts).forEach((e) => { if (e.kind !== "ask") last.set(e.sid, e.kind); });
      const unresolved = [...last.entries()].filter(([, k]) => k === "confused");
      unresolved.forEach(([s]) => helpSet.add(s));
      rs.push({ key, label: b?.content ?? tp?.title ?? "Unknown", topic: tp?.title ?? "", asks: evs.filter((e) => e.kind === "ask").length, students: new Set(evs.map((e) => e.sid)).size, unresolved: unresolved.length });
    });
    rs.sort((a, b) => b.unresolved - a.unresolved || b.asks - a.asks);
    const vis = rs.filter((r) => showSmall || r.students >= MIN_GROUP);
    return { rows: vis, hidden: rs.length - vis.length, needHelp: helpSet.size, totalAsks: events.filter((e) => e.kind === "ask").length };
  }, [events, state, showSmall]);

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
    <aside aria-label="Live insights" className="w-full shrink-0 overflow-y-auto rounded-[24px] border border-stone bg-eggshell p-5 md:w-[320px]">
      <h2 className="display text-2xl">Live insights</h2>
      <p className="mt-1 text-xs text-smoke">Anonymous and aggregated. You never see individual questions or settings.</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[["Connected", connected], ["Need help", needHelp], ["Questions", totalAsks]].map(([l, v]) => (
          <div key={l as string} className="rounded-[16px] bg-taupe p-3"><div className="text-2xl font-light">{v}</div><div className="text-xs text-smoke">{l}</div></div>))}
      </div>
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
      {hidden > 0 && <p className="mt-2 text-xs text-smoke">{hidden} item(s) hidden: fewer than {MIN_GROUP} students, to protect privacy.</p>}
      <label className="mt-4 flex items-center gap-2 text-xs text-smoke"><input type="checkbox" className="accent-black" checked={showSmall} onChange={(e) => setShowSmall(e.target.checked)} /> Demo: show small groups</label>
    </aside>
  );
}
