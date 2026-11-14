"use client";
import { MathView } from "./MathView";

export interface VisualData { steps: { caption: string; left: string; right: string }[] }

/** Balance-scale style walkthrough: each step keeps both sides equal. */
export function VisualView({ data }: { data: VisualData }) {
  const steps = (data.steps ?? []).slice(0, 6);
  if (!steps.length) return <p className="text-sm text-smoke">Couldn&apos;t build this visual.</p>;
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="rounded-2xl bg-taupe p-3">
          <p className="mb-2 text-xs font-medium text-smoke">Step {i + 1}: {s.caption}</p>
          <div className="flex items-end justify-center gap-2" role="img" aria-label={`${s.left} equals ${s.right}`}>
            <div className="flex min-w-[88px] flex-col items-center"><div className="rounded-xl border border-stone bg-white px-3 py-2 text-lg"><MathView tex={s.left} display={false} /></div><div className="h-1.5 w-full rounded-full bg-ink/80" /></div>
            <span aria-hidden className="pb-3 text-xl font-light">=</span>
            <div className="flex min-w-[88px] flex-col items-center"><div className="rounded-xl border border-stone bg-white px-3 py-2 text-lg"><MathView tex={s.right} display={false} /></div><div className="h-1.5 w-full rounded-full bg-ink/80" /></div>
          </div>
          <div aria-hidden className="mx-auto mt-0 h-3 w-1 bg-ink/60" />
        </li>
      ))}
      <li className="text-xs text-smoke">Both sides change in the same way, so the scale stays balanced.</li>
    </ol>
  );
}
