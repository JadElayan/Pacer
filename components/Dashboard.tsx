"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { accuracy, loadProfile, sampleProfile, saveProfile, summarize, type Profile } from "@/lib/profile";
import { loadLessons, mergeLessons, pullLessons, storeLessons, type Lesson } from "@/lib/lessons";
import { BoardPreview } from "./ArchiveSheet";
import { mergeProfiles, pullProfile } from "@/lib/cloudProfile";
import { useAuth } from "@/lib/useAuth";

const KHAN: Record<string, string> = { algebra: "math/algebra", trigonometry: "math/trigonometry", geometry: "math/geometry", calculus: "math/calculus-1" };
const study = (s: string) => { const k = KHAN[s.toLowerCase()]; return k ? `https://www.khanacademy.org/${k}` : `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent(s)}`; };
const video = (s: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(s + " lesson for students")}`;
const when = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Left and right boxes around the join/host area: what you learned, and how you're doing. */
export function LearnedBox() {
  const [lessons, setLessons] = useState<Lesson[]>([]); const [open, setOpen] = useState<string | null>(null);
  const { user } = useAuth();
  useEffect(() => { setLessons(loadLessons()); }, []);
  useEffect(() => { if (user) void pullLessons(user.id).then((r) => { const m = mergeLessons(loadLessons(), r); storeLessons(m); setLessons(m); }).catch(() => {}); }, [user]);
  return (
    <section aria-label="What you've learned" className="flex min-h-[420px] flex-col rounded-[28px] border border-stone bg-eggshell/95 p-6 shadow-[var(--shadow-whisper)] lg:min-h-[560px]">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">What you've learned</p>
      <h2 className="display mt-1 text-3xl">Your lessons</h2>
      <p className="mt-1 text-sm text-smoke">Pacer takes notes while you're in class, so you can go back over them any time.</p>
      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
        {lessons.length === 0 && <p className="rounded-2xl bg-taupe p-4 text-sm text-smoke">No lessons yet. Join a meeting and your notes will show up here.</p>}
        {lessons.map((l) => (
          <div key={l.code} className="rounded-[20px] border border-stone p-4">
            <button className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open === l.code} onClick={() => setOpen(open === l.code ? null : l.code)}>
              <span><span className="block font-medium">{l.title}</span><span className="text-xs text-smoke">{l.subject ? `${l.subject} · ` : ""}{when(l.ts)} · {l.topics.length} topic{l.topics.length === 1 ? "" : "s"}{l.boards?.length ? ` · ${l.boards.length} saved board${l.boards.length === 1 ? "" : "s"}` : ""}</span></span>
              <span aria-hidden className="text-smoke">{open === l.code ? "–" : "+"}</span>
            </button>
            {open === l.code && <ul className="mt-3 space-y-2">{l.topics.map((t, i) => (
              <li key={i} className="rounded-2xl bg-taupe p-3"><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-smoke">{t.summary}</p><p className="mt-1 text-xs">{t.notes.join("  ·  ")}</p></li>))}{(l.boards ?? []).map((b, i) => <li key={b.id}><p className="mb-1 text-xs text-smoke">Saved board {i + 1}</p><BoardPreview b={b} /></li>)}</ul>}
          </div>))}
      </div>
    </section>
  );
}

export function ProgressBox() {
  const { user } = useAuth();
  const [p, setP] = useState<Profile>({});
  useEffect(() => { setP(loadProfile()); }, []);
  useEffect(() => { if (user) void pullProfile(user.id).then((r) => { if (r) setP(mergeProfiles(loadProfile(), r)); }).catch(() => {}); }, [user]);
  const rows = Object.entries(p).filter(([, s]) => s.asks + s.checkRight + s.checkWrong + s.quizRight + s.quizWrong > 0);
  const weak = rows.filter(([, s]) => { const a = accuracy(s); return a !== null && a < 70; });
  const strong = rows.filter(([, s]) => { const a = accuracy(s); return a !== null && a >= 80; });
  return (
    <section aria-label="How you're doing" className="flex min-h-[420px] flex-col rounded-[28px] border border-stone bg-eggshell/95 p-6 shadow-[var(--shadow-whisper)] lg:min-h-[560px]">
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
      <button className="mt-3 self-start text-xs text-smoke underline" onClick={() => { saveProfile(sampleProfile()); setP(loadProfile()); }}>Load sample data (demo)</button>
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
