"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { accuracy, loadProfile, loadStudy, mergeStudy, summarize, type Profile, type StudyEntry } from "@/lib/profile";
import { loadLessons, markLessonEnded, mergeLessons, pullLessons, storeLessons, type Lesson } from "@/lib/lessons";
import { LIVE_WINDOW_MS, probeLesson, type LessonStatus } from "@/lib/lessonStatus";
import { BoardPreview } from "./ArchiveSheet";
import { mergeProfiles, pullLearning } from "@/lib/cloudProfile";
import { StudyHistory } from "./ProfileSheet";
import { SavedSlides } from "./SavedSlides";
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
  const pending = lessons.filter((lesson) => !lesson.ended && Date.now() - lesson.ts < LIVE_WINDOW_MS).map((lesson) => lesson.code).join(",");
  useEffect(() => {
    if (!pending) return;
    let active = true;
    const codes = pending.split(",");
    const check = () => codes.forEach((code) => void probeLesson(code).then((result) => {
      if (!active) return;
      setStatus((old) => ({ ...old, [code]: result }));
      if (result === "ended") setLessons(markLessonEnded(code, userId));
    }));
    check();
    const timer = setInterval(check, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [pending, userId]);
  const statusOf = (lesson: Lesson): LessonStatus => lesson.ended || Date.now() - lesson.ts >= LIVE_WINDOW_MS ? "ended" : status[lesson.code] ?? "checking";
  const ordered = [...lessons].sort((a, b) => Number(statusOf(b) === "live") - Number(statusOf(a) === "live") || b.ts - a.ts);
  return (
    <section aria-label="What you've learned" className="flex flex-col rounded-[28px] border border-stone bg-eggshell/95 p-6 shadow-[var(--shadow-whisper)] lg:min-h-[560px]">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">What you've learned</p>
      <h2 className="display mt-1 text-3xl">Your lessons</h2>
      <p className="mt-1 text-sm text-smoke">Pacer takes notes while you're in class, so you can go back over them any time.</p>
      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {lessons.length === 0 && <p className="rounded-2xl bg-taupe p-4 text-sm text-smoke">No lessons yet. Join a meeting and your notes will show up here.</p>}
        {ordered.map((l) => (
          <div key={l.code} className={`rounded-[20px] border p-4 ${statusOf(l) === "live" ? "border-emerald-300 bg-emerald-50/40" : "border-stone"}`}>
            <button className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open === l.code} onClick={() => setOpen(open === l.code ? null : l.code)}>
              <span><span className="flex flex-wrap items-center gap-2 font-medium">{l.title}<LessonBadge status={statusOf(l)} /></span><span className="text-xs text-smoke">{l.subject ? `${l.subject} · ` : ""}{when(l.ts)} · {l.topics.length} topic{l.topics.length === 1 ? "" : "s"}{l.boards?.length ? ` · ${l.boards.length} saved board${l.boards.length === 1 ? "" : "s"}` : ""}</span></span>
              <span aria-hidden className="text-smoke">{open === l.code ? "–" : "+"}</span>
            </button>
            <div className="mt-3 flex flex-wrap gap-2">
              {statusOf(l) === "live" && <Link href={`/room/${encodeURIComponent(l.code)}`} className="btn btn-primary btn-sm">Rejoin live class</Link>}
              <Link href={`/lesson/${encodeURIComponent(l.code)}`} className={`btn btn-sm ${statusOf(l) === "live" ? "btn-outline" : "btn-primary"}`}>
                {statusOf(l) === "live" ? "Review so far" : "Open lesson"}
              </Link>
            </div>
            {open === l.code && <ul className="mt-3 space-y-2">{l.topics.map((t, i) => (
              <li key={i} className="rounded-2xl bg-taupe p-3"><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-smoke">{t.summary}</p><p className="mt-1 text-xs">{t.notes.join("  ·  ")}</p></li>))}{(l.boards ?? []).map((b, i) => <li key={b.id}><p className="mb-1 text-xs text-smoke">Saved board {i + 1}</p><BoardPreview b={b} /></li>)}</ul>}
            {open === l.code && l.slides && <div className="mt-3"><SavedSlides key={l.slides.id} deck={l.slides} userId={userId} /></div>}
          </div>))}
      </div>
    </section>
  );
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

export function SignIn({ onGuest }: { onGuest: () => void }) {
  const { signIn } = useAuth();
  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-[28px] border border-stone bg-eggshell/95 p-8 text-center shadow-[var(--shadow-whisper)]">
      <h1 className="display text-4xl">Welcome to Pacer</h1>
      <p className="mt-2 text-smoke">Sign in to keep your notes and progress.</p>
      <button className="btn btn-dark mt-6 w-full text-base" onClick={() => void signIn()}>Sign in with Google</button>
      <button className="mt-3 text-sm text-smoke underline" onClick={onGuest}>Continue as guest</button>
      <p className="mt-6 text-xs text-smoke">Schools will sign in with their own accounts later. <Link href="/" className="hidden">home</Link></p>
    </div>
  );
}
