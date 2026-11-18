"use client";
import { useEffect, useState } from "react";
import { askAI } from "@/lib/ai";
import { guideKey, type GuideMark, type GuideStep } from "@/lib/guide";
import { loadStudy, mergeStudy, saveStudy } from "@/lib/profile";
import { RichText } from "./RichText";
import { Collapse } from "./Motion";

/**
 * Walks through a saved lesson one slide or topic at a time. Each step shows the key lines, asks a quick
 * "Got it / Still unsure", and can explain the step (AI, only when asked). "Still unsure" adds the step
 * to the student's study plan on the dashboard. Turned off with Guided review in Settings.
 */
export function GuidedReview({ code, lessonTitle, steps, userId, onGo, onClose }: {
  code: string; lessonTitle: string; steps: GuideStep[]; userId?: string;
  onGo: (page: string) => void; onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [marks, setMarks] = useState<Record<string, GuideMark>>({});
  const [explain, setExplain] = useState<{ id: string; text?: string; error?: string; loading?: boolean }>();
  // Pick up where the student left off this session.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(guideKey(code)) ?? "null") as { index: number; marks: Record<string, GuideMark> } | null;
      if (saved) { setIndex(Math.min(saved.index, steps.length)); setMarks(saved.marks ?? {}); }
    } catch { /* start at the beginning */ }
  }, [code, steps.length]);
  useEffect(() => { try { sessionStorage.setItem(guideKey(code), JSON.stringify({ index, marks })); } catch { /* not kept */ } }, [code, index, marks]);
  const done = index >= steps.length;
  const step = steps[Math.min(index, steps.length - 1)];
  useEffect(() => { if (!done && step) onGo(step.page); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const mark = (value: GuideMark) => {
    setMarks((m) => ({ ...m, [step.id]: value }));
    // "Still unsure" becomes a review item (and a study-plan topic); "Got it" clears one made earlier.
    const id = `guide-${code}-${step.id}`;
    const entry = { id, ts: Date.now(), code, lecture: lessonTitle, topic: step.title, resolved: value === "got" };
    const existing = loadStudy(userId).some((e) => e.id === id);
    if (value === "unsure" || existing) saveStudy(mergeStudy(loadStudy(userId), [entry]), userId);
    setIndex(index + 1);
  };
  const askExplain = async () => {
    setExplain({ id: step.id, loading: true });
    try {
      const r = await askAI({ kind: "explain", mode: "standard", detail: "short", topicTitle: step.title,
        selected: [step.title, ...(step.summary ? [step.summary] : []), ...step.points].slice(0, 12), context: [] });
      setExplain({ id: step.id, text: r.text });
    } catch (e) { setExplain({ id: step.id, error: e instanceof Error ? e.message : "Couldn't get an explanation. Try again." }); }
  };
  const unsure = steps.filter((s) => marks[s.id] === "unsure");

  return <section aria-label="Guided review" className="guide w-full rounded-[20px] p-4">
    <div className="flex items-center gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">Guided review</p>
      <div className="guide-progress" role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={Math.min(index, steps.length)}>
        <span style={{ width: `${(Math.min(index, steps.length) / steps.length) * 100}%` }} />
      </div>
      <button type="button" className="text-xs text-smoke hover:underline" onClick={onClose}>Hide guide</button>
    </div>

    {done ? <div className="mt-2" role="status">
      <p className="font-medium">You went through all {steps.length} steps.</p>
      <p className="mt-0.5 text-sm text-smoke">{unsure.length ? <>Added to your study plan: {unsure.map((s) => s.title).join(", ")}.</> : "Nothing marked unsure. Nice work."}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setIndex(0); setMarks({}); }}>Start again</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
      </div>
    </div> : <div key={step.id} className="guide-step mt-2">
      <p className="text-xs text-smoke">Step {index + 1} of {steps.length} · {step.kind === "slide" ? "Slide" : "Topic"}</p>
      <p className="mt-0.5 text-base font-medium">{step.title}</p>
      {step.summary && <p className="mt-1 text-sm">{step.summary}</p>}
      {step.points.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm">{step.points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      <p className="mt-2 text-sm text-smoke">Can you explain this in your own words?</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => mark("got")}>Got it</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => mark("unsure")}>Still unsure</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={explain?.id === step.id && explain.loading} onClick={() => void askExplain()}>
          {explain?.id === step.id && explain.loading ? "Explaining…" : "Explain this"}
        </button>
        <span className="ml-auto flex gap-1">
          <button type="button" className="btn btn-outline btn-sm" aria-label="Previous step" disabled={index === 0} onClick={() => setIndex(index - 1)}>‹</button>
          <button type="button" className="btn btn-outline btn-sm" aria-label="Skip to next step" onClick={() => setIndex(index + 1)}>›</button>
        </span>
      </div>
      <Collapse open={explain?.id === step.id && !explain.loading}>
        <div className="mt-2 rounded-xl bg-white p-3 text-sm">
          {explain?.error ? <p role="alert">{explain.error}</p> : <div className="whitespace-pre-wrap"><RichText text={explain?.text ?? ""} /></div>}
        </div>
      </Collapse>
    </div>}
  </section>;
}
