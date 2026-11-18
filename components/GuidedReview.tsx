"use client";
import { useEffect, useState } from "react";
import { askAI } from "@/lib/ai";
import { guideKey, type GuideMark, type GuideStep } from "@/lib/guide";
import { loadStudy, mergeStudy, saveStudy } from "@/lib/profile";
import { RichText } from "./RichText";
import { Collapse } from "./Motion";
import { QuizView, type QuizData } from "./QuizView";

/**
 * Walks through a saved lesson one slide or topic at a time. Each step shows its key points and gives the student
 * something to do: try the slide's own questions, tap the parts of an overview that feel unclear, or explain it in
 * their own words. "Explain this" and "Quiz me" use AI only when clicked. Anything marked unsure goes into the
 * study plan on the dashboard. Turned off with Guided review in Settings.
 */
export function GuidedReview({ code, lessonTitle, steps, userId, onGo, onClose }: {
  code: string; lessonTitle: string; steps: GuideStep[]; userId?: string;
  onGo: (page: string) => void; onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [marks, setMarks] = useState<Record<string, GuideMark>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [ai, setAi] = useState<{ id: string; kind: "explain" | "quiz"; text?: string; quiz?: QuizData; error?: string; loading?: boolean }>();
  const [answer, setAnswer] = useState("");
  // Pick up where the student left off this session.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(guideKey(code)) ?? "null") as { index: number; marks: Record<string, GuideMark>; flagged?: Record<string, boolean> } | null;
      if (saved) { setIndex(Math.min(saved.index, steps.length)); setMarks(saved.marks ?? {}); setFlagged(saved.flagged ?? {}); }
    } catch { /* start at the beginning */ }
  }, [code, steps.length]);
  useEffect(() => { try { sessionStorage.setItem(guideKey(code), JSON.stringify({ index, marks, flagged })); } catch { /* not kept */ } }, [code, index, marks, flagged]);
  const done = index >= steps.length;
  const step = steps[Math.min(index, steps.length - 1)];
  useEffect(() => { setAnswer(""); if (!done && step) onGo(step.page); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Adds (or, with resolved, clears) a review item that the study plan on the dashboard picks up. */
  const review = (id: string, topic: string, resolved: boolean) => {
    const entry = { id: `guide-${code}-${id}`, ts: Date.now(), code, lecture: lessonTitle, topic, resolved };
    const existing = loadStudy(userId).some((e) => e.id === entry.id);
    if (!resolved || existing) saveStudy(mergeStudy(loadStudy(userId), [entry]), userId);
  };
  const mark = (value: GuideMark) => {
    setMarks((m) => ({ ...m, [step.id]: value }));
    review(step.id, step.title, value === "got");
    setIndex(index + 1);
  };
  const flag = (point: string) => {
    const key = `${step.id}:${point}`;
    const on = !flagged[key];
    setFlagged((f) => ({ ...f, [key]: on }));
    review(`${step.id}-${point.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`, point, !on);
  };
  const material = () => [step.title, ...(step.summary ? [step.summary] : []), ...step.points, ...step.questions].slice(0, 12);
  const askExplain = async () => {
    setAi({ id: step.id, kind: "explain", loading: true });
    try {
      const r = await askAI({ kind: "explain", mode: "standard", detail: "short", topicTitle: step.title, selected: material(), context: [] });
      setAi({ id: step.id, kind: "explain", text: r.text });
    } catch (e) { setAi({ id: step.id, kind: "explain", error: e instanceof Error ? e.message : "Couldn't get an explanation. Try again." }); }
  };
  const askQuiz = async () => {
    setAi({ id: step.id, kind: "quiz", loading: true });
    try {
      const r = await askAI({ kind: "quiz", mode: "standard", topicTitle: step.title, selected: material(), context: [] });
      const quiz = r.data as QuizData | undefined;
      if (!quiz?.question || !quiz.answer) throw new Error("Couldn't make a practice question. Try again.");
      setAi({ id: step.id, kind: "quiz", quiz });
    } catch (e) { setAi({ id: step.id, kind: "quiz", error: e instanceof Error ? e.message : "Couldn't make a practice question. Try again." }); }
  };
  const unsure = steps.filter((s) => marks[s.id] === "unsure").map((s) => s.title);
  const tapped = Object.entries(flagged).filter(([, on]) => on).map(([key]) => key.split(":").slice(1).join(":"));
  const busy = ai?.id === step?.id && ai.loading;

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
      <p className="mt-0.5 text-sm text-smoke">{unsure.length || tapped.length ? <>Added to your study plan: {[...unsure, ...tapped].join(", ")}.</> : "Nothing marked unsure. Nice work."}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setIndex(0); setMarks({}); setFlagged({}); }}>Start again</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
      </div>
    </div> : <div key={step.id} className="guide-step mt-2">
      <p className="text-xs text-smoke">Step {index + 1} of {steps.length} · {step.kind === "slide" ? (step.overview ? "Overview" : "Slide") : "Topic"}</p>
      <p className="mt-0.5 text-base font-semibold leading-snug">{step.title}</p>
      {step.summary && <p className="mt-1 text-sm">{step.summary}</p>}

      {step.overview ? <>
        <p className="mt-2 text-sm text-smoke">This part covers these. Tap any that feel unclear and they&apos;ll go into your study plan.</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">{step.points.map((p) => <li key={p}>
          <button type="button" className="guide-chip" aria-pressed={!!flagged[`${step.id}:${p}`]} onClick={() => flag(p)}>{p}</button>
        </li>)}</ul>
      </> : step.points.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm">{step.points.map((p, i) => <li key={i}>{p}</li>)}</ul>}

      {step.questions.length > 0 ? <div className="guide-try mt-2">
        <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">Try it before moving on</p>
        <p className="mt-0.5 text-sm font-medium">{step.questions[0]}</p>
        {step.questions.length > 1 && <p className="mt-0.5 text-xs text-smoke">The slide has {step.questions.length - 1} more question{step.questions.length > 2 ? "s" : ""} like this one.</p>}
        <textarea className="input mt-1.5 min-h-[2.5rem] py-1.5 text-sm" rows={2} placeholder="Your answer (just for you)" aria-label="Your answer" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </div> : !step.overview && <p className="mt-2 text-sm text-smoke">In your own words: {step.kind === "topic" ? `what is ${step.title.toLowerCase().startsWith("the ") ? step.title : `“${step.title}”`} about?` : "what is this slide saying?"} Say it out loud or jot it down.</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => mark("got")}>Got it</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => mark("unsure")}>Still unsure</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void askExplain()}>{busy && ai?.kind === "explain" ? "Explaining…" : "Explain this"}</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void askQuiz()}>{busy && ai?.kind === "quiz" ? "Making a question…" : "Quiz me"}</button>
        <span className="ml-auto flex gap-1">
          <button type="button" className="btn btn-outline btn-sm" aria-label="Previous step" disabled={index === 0} onClick={() => setIndex(index - 1)}>‹</button>
          <button type="button" className="btn btn-outline btn-sm" aria-label="Skip to next step" onClick={() => setIndex(index + 1)}>›</button>
        </span>
      </div>
      {busy && <p role="status" className="progress-loading mt-2 text-sm text-smoke">{ai?.kind === "quiz" ? "Making a question from this step…" : "Explaining from this step…"}</p>}
      <Collapse open={ai?.id === step.id && !ai.loading}>
        <div className="mt-2 rounded-xl bg-white p-3 text-sm">
          {ai?.error ? <p role="alert">{ai.error}</p>
            : ai?.quiz ? <QuizView key={ai.quiz.question} data={ai.quiz} onResult={(ok) => { if (!ok) review(`${step.id}-quiz`, step.title, false); }} />
            : <div className="whitespace-pre-wrap"><RichText text={ai?.text ?? ""} /></div>}
        </div>
      </Collapse>
    </div>}
  </section>;
}
