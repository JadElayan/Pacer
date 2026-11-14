"use client";
import { useState } from "react";
import { isCorrect } from "@/lib/grade";

export interface QuizData { question: string; answer: string; hint?: string }

/** Private practice question. Checked on the student's device; never sent to the teacher. */
export function QuizView({ data, onResult }: { data: QuizData; onResult: (correct: boolean) => void }) {
  const [v, setV] = useState(""); const [res, setRes] = useState<boolean | null>(null); const [hint, setHint] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{data.question}</p>
      {res === null ? (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!v.trim()) return; const ok = isCorrect(v, data.answer); setRes(ok); onResult(ok); }}>
          <label className="sr-only" htmlFor="quiz-in">Your answer</label>
          <input id="quiz-in" className="input !min-h-10 !text-sm" value={v} onChange={(e) => setV(e.target.value)} placeholder="Your answer" autoComplete="off" />
          <button className="btn btn-primary btn-sm" disabled={!v.trim()}>Check</button>
        </form>
      ) : (
        <p role="status" className="rounded-xl bg-sky-soft p-2 text-sm font-medium">{res ? "Correct! " : `Not quite. The answer is ${data.answer}. `}<span className="font-normal text-smoke">This is just for you.</span></p>
      )}
      {res === null && data.hint && (hint ? <p className="text-xs text-smoke">Hint: {data.hint}</p> : <button className="text-xs underline" onClick={() => setHint(true)}>Show a hint</button>)}
    </div>
  );
}
