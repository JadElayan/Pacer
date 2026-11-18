"use client";
import Link from "next/link";
import { Collapse } from "./Motion";
import { useEffect, useState } from "react";
import { accuracy, loadProfile, loadStudy, mergeStudy, summarize, type Profile, type StudyEntry } from "@/lib/profile";
import { loadLessons, markLessonEnded, mergeLessons, pullLessons, removeLesson, storeLessons, type Lesson } from "@/lib/lessons";
import { groupLessons, isEmptyLesson, lessonName, LESSONS_SHOWN, matchesSearch, SEARCH_AFTER } from "@/lib/lessonList";
import { LIVE_WINDOW_MS, probeLesson, type LessonStatus } from "@/lib/lessonStatus";
import { LessonPreview, type LessonView } from "./LessonPreview";
import type { RoomState } from "@/lib/types";
import { mergeProfiles, pullLearning } from "@/lib/cloudProfile";
import { StudyHistory } from "./ProfileSheet";
import { useAuth } from "@/lib/useAuth";

const KHAN: Record<string, string> = { algebra: "math/algebra", trigonometry: "math/trigonometry", geometry: "math/geometry", calculus: "math/calculus-1" };
const study = (s: string) => { const k = KHAN[s.toLowerCase()]; return k ? `https://www.khanacademy.org/${k}` : `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(s)}`; };
const video = (s: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(s + " lesson for students")}`;
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Left and right boxes around the join/host area: what you learned, and how you're doing. */
export function LearnedBox() {
  const [lessons, setLessons] = useState<Lesson[]>([]); const [open, setOpen] = useState<string | null>(null);
  const { user, ready } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!ready) return;
    let active = true;
    setLessons(loadLessons(userId));
    if (userId) void pullLessons(userId).then((remote) => {
      if (!active) return;
      const merged = mergeLessons(loadLessons(userId), remote);
      storeLessons(merged, userId); setLessons(merged);
    }).catch(() => {});
    return () => { active = false; };
  }, [ready, userId]);
  // Which lessons are still running: ended ones are remembered; recent ones are checked now and every minute.
  const [status, setStatus] = useState<Record<string, LessonStatus>>({});
  const [rooms, setRooms] = useState<Record<string, RoomState>>({});
  const pending = lessons.filter((lesson) => !lesson.ended && Date.now() - lesson.ts < LIVE_WINDOW_MS).map((lesson) => lesson.code).join(",");
  useEffect(() => {
    if (!pending) return;
    let active = true;
    const codes = pending.split(",");
    const check = () => codes.forEach((code) => void probeLesson(code).then(({ status: result, room }) => {
      if (!active) return;
      setStatus((old) => ({ ...old, [code]: result }));
      if (room) setRooms((old) => ({ ...old, [code]: room }));
      if (result === "ended") setLessons(markLessonEnded(code, userId));
    }));
    check();
    const timer = setInterval(check, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [pending, userId]);
  const statusOf = (lesson: Lesson): LessonStatus => lesson.ended || Date.now() - lesson.ts >= LIVE_WINDOW_MS ? "ended" : status[lesson.code] ?? "checking";
  const ordered = [...lessons].filter((l) => !l.removed).sort((a, b) => Number(statusOf(b) === "live") - Number(statusOf(a) === "live") || b.ts - a.ts);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [confirming, setConfirming] = useState<string>();
  const [removeError, setRemoveError] = useState("");
  // Classes where nothing was taught are hidden unless asked for; a live class always shows.
  const empty = ordered.filter((l) => statusOf(l) !== "live" && isEmptyLesson(l));
  const worth = showEmpty ? ordered : ordered.filter((l) => !empty.includes(l));
  const matching = worth.filter((l) => matchesSearch(l, query));
  const searching = !!query.trim();
  const shown = searching || showAll ? matching : matching.slice(0, LESSONS_SHOWN);
  const groups = groupLessons(shown);
  const remove = async (code: string) => {
    setConfirming(undefined); setOpen(null); setRemoveError("");
    setLessons((items) => items.filter((item) => item.code !== code));
    try { setLessons(await removeLesson(code, userId)); }
    catch { setRemoveError("Removed here, but your account copy couldn't be updated. Try again later."); }
  };
  return (
    <section aria-label="What you've learned" className="flex flex-col rounded-[28px] border border-stone bg-eggshell/95 p-6 shadow-[var(--shadow-whisper)] lg:min-h-[560px]">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">What you've learned</p>
      <h2 className="display mt-1 text-3xl">Your lessons</h2>
      <p className="mt-1 text-sm text-smoke">Pacer takes notes while you're in class, so you can go back over them any time.</p>
      {worth.length > SEARCH_AFTER && <input type="search" aria-label="Search your lessons" placeholder="Search lessons" className="input mt-4 py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />}
      {removeError && <p role="alert" className="mt-2 text-sm">{removeError}</p>}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {ordered.length === 0 && <p className="rounded-2xl bg-taupe p-4 text-sm text-smoke">No lessons yet. Join a meeting and your notes will show up here.</p>}
        {searching && !matching.length && <p className="rounded-2xl bg-taupe p-4 text-sm text-smoke">No lessons match &ldquo;{query.trim()}&rdquo;.</p>}
        {groups.map((group) => <div key={group.label} className="lesson-group mt-4 first:mt-0">
          {(groups.length > 1 || showAll || searching) && <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-smoke">{group.label}</h3>}
          <ul className="space-y-2">
            {group.items.map((l) => {
              const live = statusOf(l) === "live";
              const name = lessonName(l);
              return <li key={l.code} data-open={open === l.code} className={`lesson-card lesson-row rounded-2xl border px-3 py-2.5 ${live ? "border-emerald-300 bg-emerald-50/40" : "border-stone"}`}>
                <div className="flex items-center gap-2">
                  <Link href={`/lesson/${encodeURIComponent(l.code)}`} className="min-w-0 flex-1 rounded-lg" aria-label={`${live ? "Review so far" : "Open lesson"}: ${name}`}>
                    <span className="flex items-center gap-2 font-medium"><span className="truncate">{name}</span>{live && <LessonBadge status="live" />}</span>
                    <span className="block truncate text-xs text-smoke">{name.endsWith(when(l.ts)) ? (isEmptyLesson(l) ? "Nothing saved" : "Notes saved") : <>{l.subject && !name.startsWith(l.subject) ? `${l.subject} · ` : ""}{when(l.ts)}{l.topics.length ? ` · ${l.topics.length} topic${l.topics.length === 1 ? "" : "s"}` : ""}</>}</span>
                  </Link>
                  {live && <Link href={`/room/${encodeURIComponent(l.code)}`} className="btn btn-primary btn-sm shrink-0">Rejoin</Link>}
                  <button className="lesson-card-toggle" aria-expanded={open === l.code} aria-label={`Preview ${name}`} onClick={() => setOpen(open === l.code ? null : l.code)}>
                    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3.5 8h9" /><path className="lesson-card-toggle-v" d="M8 3.5v9" /></svg>
                  </button>
                </div>
                <Collapse open={open === l.code}>
                  {(() => {
                    const room = live ? rooms[l.code] : undefined;
                    const view = viewOf(l, room);
                    return <div className="pt-3" data-lesson-preview>
                      {view ? <LessonPreview view={view} live={live} userId={userId} topic={room ? room.topics.find((t) => t.id === room.currentTopicId)?.title : l.currentTopic} />
                        : <p className="rounded-xl bg-taupe p-3 text-sm text-smoke">{live ? "Connecting to the live class…" : "Nothing was on the board or slides."}</p>}
                      {!live && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        {confirming === l.code ? <>
                          <span>Remove this lesson from your list?</span>
                          <button className="btn btn-outline btn-sm" onClick={() => void remove(l.code)}>Remove</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setConfirming(undefined)}>Cancel</button>
                        </> : <button className="text-smoke underline-offset-2 hover:underline" onClick={() => setConfirming(l.code)}>Remove from my lessons</button>}
                      </div>}
                    </div>;
                  })()}
                </Collapse>
              </li>;
            })}
          </ul>
        </div>)}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          {!searching && matching.length > LESSONS_SHOWN && <button className="font-medium text-sky-deep hover:underline" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all (${matching.length})`}</button>}
          {empty.length > 0 && <button className="text-smoke hover:underline" aria-pressed={showEmpty} onClick={() => setShowEmpty(!showEmpty)}>{showEmpty ? "Hide empty classes" : `${empty.length} empty class${empty.length === 1 ? "" : "es"} hidden`}</button>}
        </div>
      </div>
    </section>
  );
}

/** The slide or board to preview: live from the teacher when the class is running, otherwise as it was last saved. */
function viewOf(lesson: Lesson, room?: RoomState): LessonView | undefined {
  const slides = room ? room.slides : lesson.slides;
  const onSlides = room ? room.showSlides : lesson.showSlides;
  if (onSlides && slides?.pages[slides.current]) return { kind: "slide", deck: slides, number: slides.current };
  if (room) {
    const aspect = room.topics.find((topic) => topic.id === room.currentTopicId)?.inkAspect ?? 1.6;
    return { kind: "board", blocks: room.blocks.filter((block) => !block.surface), strokes: room.strokes, aspect };
  }
  const board = lesson.boards?.find((b) => b.id === `${lesson.code}-live`) ?? lesson.boards?.at(-1);
  if (board) return { kind: "board", blocks: board.blocks.filter((block) => !block.surface), strokes: board.strokes, aspect: board.inkAspect ?? 1.6 };
  if (slides?.pages[slides.current]) return { kind: "slide", deck: slides, number: slides.current };
  return undefined;
}

function LessonBadge({ status }: { status: LessonStatus }) {
  if (status === "live") return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"><span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" />Live now</span>;
  if (status === "ended") return <span className="rounded-full bg-taupe px-2 py-0.5 text-xs font-medium text-smoke">Ended</span>;
  return <span className="rounded-full bg-taupe px-2 py-0.5 text-xs font-medium text-smoke">Checking…</span>;
}

export function ProgressBox() {
  const { user, ready } = useAuth();
  const userId = user?.id;
  const [p, setP] = useState<Profile>({});
  const [studyEntries, setStudyEntries] = useState<StudyEntry[]>([]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    setP(loadProfile(userId)); setStudyEntries(loadStudy(userId));
    if (userId) void pullLearning(userId).then((remote) => {
      if (!active) return;
      setP(mergeProfiles(loadProfile(userId), remote.profile));
      setStudyEntries(mergeStudy(remote.study, loadStudy(userId)));
    }).catch(() => {});
    return () => { active = false; };
  }, [ready, userId]);
  const rows = Object.entries(p).filter(([, s]) => s.asks + s.checkRight + s.checkWrong + s.quizRight + s.quizWrong > 0);
  const weak = rows.filter(([, s]) => { const a = accuracy(s); return a !== null && a < 70; });
  const strong = rows.filter(([, s]) => { const a = accuracy(s); return a !== null && a >= 80; });
  return (
    <section aria-label="How you're doing" className="flex flex-col rounded-[28px] border border-stone bg-eggshell/95 p-6 shadow-[var(--shadow-whisper)] lg:min-h-[560px]">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">How you're doing</p>
      <h2 className="display mt-1 text-3xl">Your progress</h2>
      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
        {rows.length === 0 && <p className="rounded-2xl bg-taupe p-4 text-sm text-smoke">Answer check-in questions in class and your results will show up here, by subject.</p>}
        {rows.map(([name, s]) => { const a = accuracy(s); const right = s.checkRight + s.quizRight, wrong = s.checkWrong + s.quizWrong; return (
          <div key={name}>
            <div className="flex items-baseline justify-between"><p className="font-medium">{name}</p><p className="text-xs text-smoke">{right} right · {wrong} wrong</p></div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#fde8e8]" role="img" aria-label={a === null ? "No answers yet" : `${a} percent right`}><div className="h-3 rounded-full bg-[#2fbf71] transition-[width] duration-500" style={{ width: `${a ?? 0}%` }} /></div>
          </div>); })}
        {(weak.length > 0 || strong.length > 0) && (
          <div className="rounded-[20px] bg-sky-soft p-4">
            <p className="text-sm font-medium">What to study</p>
            <ul className="mt-2 space-y-2 text-sm">
              {weak.map(([n]) => <li key={n}>Review <b>{n}</b>: you're missing a lot of these. <a className="text-sky-deep underline" href={study(n)} target="_blank" rel="noreferrer">Khan Academy</a> · <a className="text-sky-deep underline" href={video(n)} target="_blank" rel="noreferrer">Videos</a></li>)}
              {strong.map(([n]) => <li key={n}>You're strong in <b>{n}</b>. Nice work.</li>)}
            </ul>
            <p className="mt-2 text-xs text-smoke">Later, this will link to your class on Canvas and other tools.</p>
          </div>)}
        {rows.length > 0 && summarize(p).length > 0 && weak.length === 0 && strong.length === 0 && <ul className="space-y-2">{summarize(p).map((l, i) => <li key={i} className="rounded-2xl bg-sky-soft p-3 text-sm">{l}</li>)}</ul>}
      </div>
      <StudyHistory entries={studyEntries} />
    </section>
  );
}
