"use client";
import { accuracy, summarize, type Profile, type StudyEntry } from "@/lib/profile";
import { RichText } from "./RichText";
import { Sheet } from "./Sheet";

export function StudyHistory({ entries }: { entries: StudyEntry[] }) {
  if (!entries.length) return null;
  return <div className="mt-4 space-y-3">
    <h3 className="text-sm font-medium">Questions and review</h3>
    {entries.map((entry) => <div key={entry.id} className="rounded-2xl bg-taupe p-3 text-sm">
      <p className="font-medium">{entry.topic}</p>
      <p className="text-xs text-smoke">{entry.lecture}</p>
      {entry.question ? <p className="mt-1">{entry.question}</p> : <p className="mt-1">Marked for review</p>}
      {entry.suggestion && <div className="mt-2 whitespace-pre-wrap"><p className="text-xs text-smoke">AI study suggestion</p><RichText text={entry.suggestion} /></div>}
    </div>)}
  </div>;
}

export function ProfileSheet({ profile, study, syncError, onReset, onClose }: { profile: Profile; study: StudyEntry[]; syncError: boolean; onReset: () => void; onClose: () => void }) {
  const rows = Object.entries(profile);
  const notes = summarize(profile);
  return (
    <Sheet title="My profile" label="My learning profile" onClose={onClose}
      subtitle="Private to you. Built from your questions and answers. Your teacher never sees it."
      footer={<button className="btn btn-outline btn-sm" onClick={onReset}>Reset my profile</button>}>
      {syncError && <p role="status" className="mb-3 rounded-2xl bg-[#fff7e8] px-3 py-2 text-sm text-[#7a4a00]">Account sync is unavailable. Your activity is saved in this browser.</p>}
      {notes.length > 0 && <section className="sheet-card">
        <h3 className="sheet-card-title">What we notice</h3>
        <ul className="mt-2 grid gap-2">{notes.map((line, i) => <li key={i} className="recap-point">{line}</li>)}</ul>
      </section>}
      {rows.length > 0 && <section className="mt-3 grid gap-3">
        {rows.map(([name, s]) => {
          const acc = accuracy(s);
          return <div key={name} className="sheet-card">
            <div className="flex items-baseline justify-between gap-2"><h3 className="font-semibold text-[#171d38]">{name}</h3><span className="sheet-pill">{s.asks} question{s.asks === 1 ? "" : "s"}</span></div>
            <p className="mt-1 text-sm text-smoke">{s.confused} still confused · {s.helped} helped</p>
            <div className="mt-3" role="img" aria-label={acc === null ? "No answers yet" : `${acc} percent of answers right`}>
              <div className="profile-bar"><span style={{ width: `${acc ?? 0}%` }} /></div>
              <p className="mt-1.5 text-xs text-smoke">{acc === null ? "No check-in or quiz answers yet" : `${acc}% of check-in and quiz answers right`}</p>
            </div>
          </div>;
        })}
      </section>}
      {study.length > 0 && <section className="sheet-card mt-3">
        <h3 className="sheet-card-title">Questions and review</h3>
        <ul className="mt-2 grid gap-2">
          {study.map((entry) => <li key={entry.id} className="recap-question flex-col !gap-1">
            <p className="font-medium text-[#171d38]">{entry.topic} <span className="font-normal text-smoke">· {entry.lecture}</span></p>
            <p>{entry.question || "Marked for review"}</p>
            {entry.suggestion && <div className="whitespace-pre-wrap text-sm"><p className="text-xs text-smoke">AI study suggestion</p><RichText text={entry.suggestion} /></div>}
          </li>)}
        </ul>
      </section>}
      {!rows.length && !study.length && !notes.length && <div className="sheet-empty">
        <p className="font-medium text-[#30385b]">Nothing here yet</p>
        <p>Ask questions and answer check-ins in class, and your progress will show up here.</p>
      </div>}
    </Sheet>
  );
}
