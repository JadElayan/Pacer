"use client";
import { useState } from "react";

/** Student card for a teacher's check-in question. Keyed by question id so it resets for each new question. */
export function CheckIn({ text, open, grade, onSubmit }: { text: string; open: boolean; grade?: boolean; onSubmit: (v: string) => void }) {
  const [v, setV] = useState(""); const [sent, setSent] = useState(false); const [hide, setHide] = useState(false);
  if (hide || (!open && !sent)) return null;
  return (
    <div role="group" aria-label="Check-in question" className="pop-in rounded-[20px] border-2 border-sky bg-sky-soft p-4">
      <p className="text-xs font-medium text-sky-deep">Question from your teacher (not graded)</p>
      <p className="mt-1 text-lg">{text}</p>
      {grade === undefined ? (
        sent ? <p className="mt-3 text-sm text-smoke" role="status">Checking your answer…</p> : (
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim() && open) { onSubmit(v.trim()); setSent(true); } }}>
            <label className="sr-only" htmlFor="ck-in">Your answer</label>
            <input id="ck-in" className="input !min-h-10 flex-1" placeholder="Type your answer" value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" />
            <button className="btn btn-primary btn-sm" disabled={!v.trim() || !open}>Send answer</button>
          </form>
        )
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="status" className="text-base font-medium">{grade ? "Correct! Nice work." : "Not quite. Your teacher will go over it."}</p>
          <button className="btn btn-outline btn-sm" onClick={() => setHide(true)}>Close</button>
        </div>
      )}
    </div>
  );
}
