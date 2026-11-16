"use client";
import { accuracy, summarize, type Profile, type StudyEntry } from "@/lib/profile";
import { RichText } from "./RichText";

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
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside role="dialog" aria-label="My learning profile" className="h-full w-[min(420px,100vw)] overflow-y-auto bg-eggshell p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="display text-3xl">My profile</h2><button className="btn btn-outline btn-sm" onClick={onClose}>Done</button></div>
        <p className="mt-2 text-xs text-smoke">Private to you. It is built from your questions and answers, shows activity rather than proven understanding, and your teacher never sees it.</p>
        {syncError && <p role="status" className="mt-2 text-sm">Account sync is unavailable. Your activity is saved in this browser.</p>}
        <StudyHistory entries={study} />
        <h3 className="mt-6 text-sm font-medium">What we notice</h3>
        <ul className="mt-2 space-y-2">{summarize(profile).map((l, i) => <li key={i} className="rounded-2xl bg-sky-soft p-3 text-sm">{l}</li>)}</ul>
        {rows.length > 0 && <h3 className="mt-6 text-sm font-medium">By subject</h3>}
        <div className="mt-2 space-y-3">
          {rows.map(([name, s]) => { const acc = accuracy(s); return (
            <div key={name} className="rounded-[20px] border border-stone p-4">
              <p className="font-medium">{name}</p>
              <p className="mt-1 text-sm text-smoke">{s.asks} questions · {s.confused} still confused · {s.helped} helped</p>
              <div className="mt-2" role="img" aria-label={acc === null ? "No answers yet" : `${acc} percent of answers right`}>
                <div className="h-2 w-full rounded-full bg-taupe"><div className="h-2 rounded-full bg-sky" style={{ width: `${acc ?? 0}%` }} /></div>
                <p className="mt-1 text-xs text-smoke">{acc === null ? "No check-in or quiz answers yet" : `${acc}% of check-in and quiz answers right`}</p>
              </div>
            </div>); })}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn btn-outline btn-sm" onClick={onReset}>Reset my profile</button>
        </div>
      </aside>
    </div>
  );
}
