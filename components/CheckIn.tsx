"use client";
import { useEffect, useRef, useState } from "react";

/** Student card for a teacher's check-in question. Keyed by question id so it resets for each new question. */
export function CheckIn({ storageKey, text, open, grade, answer, correct, total, onSubmit }: { storageKey: string; text: string; open: boolean; grade?: boolean; answer?: string; correct?: number; total?: number; onSubmit: (v: string) => void }) {
  const [v, setV] = useState(() => {
    try { return sessionStorage.getItem(storageKey) ?? ""; } catch { return ""; }
  });
  const [savedGrade, setSavedGrade] = useState<boolean | undefined>(() => {
    try {
      const value = sessionStorage.getItem(`${storageKey}:grade`);
      if (value === "true" || value === "false") return value === "true";
    } catch { /* optional browser storage */ }
  });
  const result = grade ?? savedGrade;
  const [pending, setPending] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [hide, setHide] = useState(false);
  const submitting = useRef(false);
  useEffect(() => {
    if (grade === undefined) return;
    setSavedGrade(grade);
    try {
      sessionStorage.setItem(`${storageKey}:grade`, String(grade));
      sessionStorage.removeItem(storageKey);
    } catch { /* the result remains visible for this visit */ }
  }, [grade, storageKey]);
  useEffect(() => {
    if (!pending || result !== undefined || !open) return;
    const timer = setTimeout(() => {
      submitting.current = false;
      setPending(false);
      setTimedOut(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [pending, result, open]);
  if (hide || (!open && !answer && !v.trim() && result === undefined)) return null;
  return (
    <div role="group" aria-label="Check-in question" className="pop-in rounded-[20px] border-2 border-sky bg-sky-soft p-4">
      <p className="text-xs font-medium text-sky-deep">Question from your teacher (not graded)</p>
      <p className="mt-1 text-lg">{text}</p>
      {!open ? (
        <div className="mt-3 space-y-1" role="status">
          {answer && <p className="text-base font-medium">Answer: <span className="rounded-lg bg-white px-2 py-0.5">{answer}</span></p>}
          {result !== undefined && <p className="text-sm">{result ? "You got it right." : "Yours was not quite right."}</p>}
          {result === undefined && v.trim() && <p className="text-sm break-words">Question closed. Your draft: {v}</p>}
          {!!total && <p className="text-sm text-smoke">Class: {correct} of {total} got it right.</p>}
          <button className="btn btn-outline btn-sm mt-1" onClick={() => setHide(true)}>Close</button>
        </div>
      ) : result === undefined ? (
        pending ? <p className="mt-3 text-sm text-smoke" role="status">Checking your answer…</p> : (
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => {
            e.preventDefault();
            if (!v.trim() || submitting.current) return;
            submitting.current = true;
            setPending(true);
            setTimedOut(false);
            onSubmit(v.trim());
          }}>
            <label className="sr-only" htmlFor="ck-in">Your answer</label>
            <input id="ck-in" className="input !min-h-10 min-w-0 flex-1" placeholder="Type your answer" value={v} onChange={(e) => {
              const value = e.target.value;
              setV(value);
              try { sessionStorage.setItem(storageKey, value); } catch { /* draft remains in memory */ }
            }} autoComplete="off" />
            <button className="btn btn-primary btn-sm" disabled={!v.trim()}>Send answer</button>
            {timedOut && <p className="w-full text-sm" role="status">No confirmation from the teacher yet. You can send the answer again.</p>}
          </form>
        )
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="status" className="text-base font-medium">{result ? "Correct! Nice work." : "Not quite. Your teacher will go over it."}</p>
          <button className="btn btn-outline btn-sm" onClick={() => setHide(true)}>Close</button>
        </div>
      )}
    </div>
  );
}
