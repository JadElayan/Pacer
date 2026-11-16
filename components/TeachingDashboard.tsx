"use client";

import { useEffect, useState } from "react";
import { loadSavedLectures, savedLectures, type SavedLecture } from "@/lib/savedLectures";
import { BoardPreview } from "./ArchiveSheet";
import { SavedSlides } from "./SavedSlides";

export function TeachingDashboard({ userId, continuing, error, onContinue }: {
  userId?: string; continuing: boolean; error: string; onContinue: (lecture: SavedLecture) => void;
}) {
  const [lectures, setLectures] = useState<SavedLecture[]>([]);
  const [selected, setSelected] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    setSelected(undefined);
    setUnavailable(false);
    setLectures(savedLectures(userId));
    void loadSavedLectures(userId).then((items) => { if (active) setLectures(items); })
      .catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, [userId]);
  const lecture = lectures.find((item) => item.code === selected) ?? lectures[0];
  return <section aria-label="Teaching dashboard" className="relative mx-auto grid w-full max-w-[1280px] gap-5 px-6 pb-16 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
    <div className="rounded-[24px] border border-stone bg-eggshell p-5 shadow-[var(--shadow-whisper)]">
      <h2 className="display text-3xl">Your lectures</h2>
      {unavailable && <p role="status" className="mt-2 text-sm text-smoke">Account storage is unavailable. Showing lectures saved in this browser.</p>}
      {!lectures.length && <p className="mt-4 text-sm text-smoke">Saved lectures appear here after you choose Save and end in class.</p>}
      {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
      <div className="mt-4 grid gap-2">
        {lectures.map((item) => <button key={item.code} aria-pressed={lecture?.code === item.code}
          className="rounded-xl border border-stone p-3 text-left hover:bg-taupe aria-pressed:border-sky aria-pressed:bg-sky-soft"
          onClick={() => setSelected(item.code)}>
          <span className="block font-medium">{item.title}</span>
          <span className="text-xs text-smoke">{item.subject ? `${item.subject} · ` : ""}{new Date(item.ts).toLocaleDateString()}</span>
        </button>)}
      </div>
    </div>
    {lecture && <div className="space-y-5 rounded-[24px] border border-stone bg-eggshell p-6 shadow-[var(--shadow-whisper)]">
      <h2 className="display text-3xl">{lecture.title}</h2>
      <button className="btn btn-primary btn-sm" disabled={continuing} onClick={() => onContinue(lecture)}>
        {continuing ? "Preparing meeting…" : "Continue lecture"}
      </button>
      <p className="text-sm text-smoke">Start a new meeting with these materials.</p>
      <section aria-label="Class insights" className="rounded-2xl bg-sky-soft p-4">
        <h3 className="font-semibold">Where students got stuck</h3>
        {lecture.struggles.length ? <ul className="mt-2 space-y-2 text-sm">
          {lecture.struggles.map((row, i) => <li key={i}><strong>{row.label}</strong> · {row.unresolved} students still confused{row.topic && row.topic !== row.label ? ` · ${row.topic}` : ""}</li>)}
        </ul> : <p className="mt-2 text-sm text-smoke">No unresolved signals met the three-student privacy threshold.</p>}
        {lecture.checkIn && <p className="mt-3 text-sm"><strong>Latest check-in</strong> · {lecture.checkIn.text} · {lecture.checkIn.correct} of {lecture.checkIn.total} correct</p>}
      </section>
      <section aria-label="Lecture materials" className="space-y-3">
        <h3 className="font-semibold">Lecture materials</h3>
        {lecture.topics.map((topic, i) => <div key={i} className="rounded-xl bg-taupe p-3">
          <p className="font-medium">{topic.title}</p>
          {topic.summary && <p className="text-sm text-smoke">{topic.summary}</p>}
          {topic.notes.map((note, j) => <p key={j} className="mt-1 whitespace-pre-wrap text-sm">{note}</p>)}
        </div>)}
        {lecture.slides && <SavedSlides key={lecture.slides.id} deck={lecture.slides} userId={userId} />}
        {lecture.boards?.map((board) => <BoardPreview key={board.id} b={board} />)}
      </section>
    </div>}
  </section>;
}
