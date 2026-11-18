"use client";
import type { SharedRecap } from "@/lib/types";

/** The class recap a teacher shared from the post-class package (no teacher note). Practice answers stay folded. */
export function RecapView({ recap, compact }: { recap: SharedRecap; compact?: boolean }) {
  return <div className="grid gap-3 text-sm">
    <section><h4 className="recap-view-title">Recap</h4><p className="mt-1 whitespace-pre-wrap leading-relaxed">{recap.recap}</p></section>
    {!compact && recap.keyPoints.length > 0 && <section><h4 className="recap-view-title">Key points</h4>
      <ul className="mt-1 grid gap-1">{recap.keyPoints.map((p, i) => <li key={i} className="recap-point">{p}</li>)}</ul></section>}
    {!compact && recap.practice.length > 0 && <section><h4 className="recap-view-title">Practice</h4>
      <ol className="mt-1.5 grid gap-2">{recap.practice.map((p, i) => <li key={i} className="recap-question">
        <span className="recap-num">{i + 1}</span>
        <div><p>{p.question}</p><details className="recap-answer"><summary>Show answer</summary><p>{p.answer}</p></details></div>
      </li>)}</ol></section>}
    {!compact && recap.catchup && <section><h4 className="recap-view-title">If you missed class</h4><p className="mt-1 leading-relaxed">{recap.catchup}</p></section>}
  </div>;
}

export const recapDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
