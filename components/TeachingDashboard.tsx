"use client";

import { useEffect, useState } from "react";
import { loadSavedLectures, removeLecture, savedLectures, type SavedLecture } from "@/lib/savedLectures";
import { BoardPreview } from "./ArchiveSheet";
import { SavedSlides } from "./SavedSlides";
import { groupLessons, lessonName, LESSONS_SHOWN, matchesSearch, SEARCH_AFTER } from "@/lib/lessonList";

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
  const [confirming, setConfirming] = useState<string>();
  const [removeError, setRemoveError] = useState("");
  const remove = async (code: string) => {
    setConfirming(undefined);
    setLectures((items) => items.filter((item) => item.code !== code));
    setSelected(undefined);
    try { await removeLecture(code, userId); }
    catch { setRemoveError("Removed from this browser, but your account copy is still saved. Try again later."); }
  };
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const matching = lectures.filter((item) => matchesSearch(item, query));
  const searching = !!query.trim();
  const shown = searching || showAll ? matching : matching.slice(0, LESSONS_SHOWN);
  const groups = groupLessons(shown);
  const lecture = lectures.find((item) => item.code === selected) ?? lectures[0];
  return <section aria-label="Teaching dashboard" className={`relative mx-auto grid w-full gap-5 px-6 pb-16 ${lecture ? "max-w-[1280px] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" : "max-w-xl"}`}>
    <div className="rounded-[24px] border border-stone bg-eggshell p-5 shadow-[var(--shadow-whisper)]">
      <h2 className="display text-3xl">Your lectures</h2>
      {unavailable && <p role="status" className="mt-2 text-sm text-smoke">Account storage is unavailable. Showing lectures saved in this browser.</p>}
      {!lectures.length && <p className="mt-4 text-sm text-smoke">Saved lectures appear here after you choose Save and end in class.</p>}
      {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
      {lectures.length > SEARCH_AFTER && <input type="search" aria-label="Search your lectures" placeholder="Search lectures" className="input mt-4 py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />}
      {searching && !matching.length && <p className="mt-4 text-sm text-smoke">No lectures match &ldquo;{query.trim()}&rdquo;.</p>}
      <div className="mt-4">
        {groups.map((group) => <div key={group.label} className="mt-4 first:mt-0">
          {(groups.length > 1 || showAll || searching) && <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-smoke">{group.label}</h3>}
          <div className="grid gap-1.5">
            {group.items.map((item) => <button key={item.code} aria-pressed={lecture?.code === item.code}
              className="rounded-xl border border-stone px-3 py-2 text-left hover:bg-taupe aria-pressed:border-sky aria-pressed:bg-sky-soft"
              onClick={() => setSelected(item.code)}>
              <span className="block truncate font-medium">{lessonName(item)}</span>
              <span className="block truncate text-xs text-smoke">{item.subject ? `${item.subject} · ` : ""}{new Date(item.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </button>)}
          </div>
        </div>)}
        {!searching && matching.length > LESSONS_SHOWN && <button className="mt-3 text-sm font-medium text-sky-deep hover:underline" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all (${matching.length})`}</button>}
      </div>
    </div>
    {lecture && <div className="space-y-5 rounded-[24px] border border-stone bg-eggshell p-6 shadow-[var(--shadow-whisper)]">
      <h2 className="display text-3xl">{lessonName(lecture)}</h2>
      <button className="btn btn-primary btn-sm" disabled={continuing} onClick={() => onContinue(lecture)}>
        {continuing ? "Preparing meeting…" : "Continue lecture"}
      </button>
      <p className="text-sm text-smoke">Start a new meeting with these materials.</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {confirming === lecture.code ? <>
          <span>Remove this lecture? This can&apos;t be undone.</span>
          <button className="btn btn-outline btn-sm" onClick={() => void remove(lecture.code)}>Remove</button>
          <button className="btn btn-outline btn-sm" onClick={() => setConfirming(undefined)}>Cancel</button>
        </> : <button className="btn btn-outline btn-sm" onClick={() => { setRemoveError(""); setConfirming(lecture.code); }}>Remove lecture</button>}
        {removeError && <p role="alert">{removeError}</p>}
      </div>
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
