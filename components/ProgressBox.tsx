"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { accuracy, loadProfile, loadStudy, mergeStudy, saveStudy, type Profile, type StudyEntry } from "@/lib/profile";
import { mergeProfiles, pullLearning, pushProfile } from "@/lib/cloudProfile";
import { addSignal, confidence, loadLog, mergeLogs, missedCheckins, nextUp, retryCheckin, saveLog, topicProgress, weekSummary, emptyLog, type ProgressLog } from "@/lib/progress";
import { isCorrect } from "@/lib/grade";
import { loadLessons } from "@/lib/lessons";
import { useAuth } from "@/lib/useAuth";
import { RichText } from "./RichText";
import { Collapse } from "./Motion";

const KHAN: Record<string, string> = { algebra: "math/algebra", trigonometry: "math/trigonometry", geometry: "math/geometry", calculus: "math/calculus-1" };
const khan = (topic: string, subject?: string) => { const k = KHAN[(subject ?? "").toLowerCase()]; return k && !topic ? `https://www.khanacademy.org/${k}` : `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent([topic, subject].filter(Boolean).join(" "))}`; };
const videos = (topic: string, subject?: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent([topic, subject, "lesson for students"].filter(Boolean).join(" "))}`;
const lessonLink = (code?: string) => code ? `/lesson/${encodeURIComponent(code)}?page=notes` : undefined;
const REVISIT_SHOWN = 3;

/** Right-hand box on the Learning dashboard: what to do next, how each topic is going, and what to revisit. Private to the student. */
export function ProgressBox() {
  const { user, ready } = useAuth();
  const userId = user?.id;
  const [profile, setProfile] = useState<Profile>({});
  const [study, setStudy] = useState<StudyEntry[]>([]);
  const [log, setLog] = useState<ProgressLog>(emptyLog());
  const [classTimes, setClassTimes] = useState<number[]>([]);
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    setSynced(false);
    setProfile(loadProfile(userId)); setStudy(loadStudy(userId)); setLog(loadLog(userId));
    setClassTimes(loadLessons(userId).filter((l) => !l.removed).map((l) => l.ts));
    if (userId) void pullLearning(userId).then((remote) => {
      if (!active) return;
      const nextLog = mergeLogs(loadLog(userId), remote.log);
      const nextStudy = mergeStudy(remote.study, loadStudy(userId));
      saveLog(nextLog, userId); saveStudy(nextStudy, userId);
      setProfile(mergeProfiles(loadProfile(userId), remote.profile)); setStudy(nextStudy); setLog(nextLog); setSynced(true);
    }).catch(() => {});
    return () => { active = false; };
  }, [ready, userId]);

  // Changes made here (retries, "Got it now") are saved on the device and, once synced, to the account.
  const save = (nextLog: ProgressLog, nextStudy: StudyEntry[]) => {
    setLog(nextLog); setStudy(nextStudy);
    saveLog(nextLog, userId); saveStudy(nextStudy, userId);
    if (userId && synced) void pushProfile(userId, profile, nextStudy, nextLog).catch(() => {});
  };

  const [retrying, setRetrying] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const week = weekSummary(log, classTimes);
  const next = nextUp(log, study);
  const topics = topicProgress(log);
  const missed = missedCheckins(log);
  const feel = confidence(log);
  const open = study.filter((entry) => !entry.resolved);
  const legacy = Object.entries(profile).filter(([, s]) => s.checkRight + s.checkWrong + s.quizRight + s.quizWrong > 0);
  const nothing = !log.checkins.length && !log.signals.length && !study.length && !legacy.length;

  const gotIt = (entry: StudyEntry) => {
    const nextStudy = study.map((item) => item.id === entry.id ? { ...item, resolved: true } : item);
    const nextLog = entry.code ? addSignal(log, { id: `resolved-${entry.id}`, ts: Date.now(), lesson: entry.code, topic: entry.topic, kind: "gotit" }) : log;
    save(nextLog, nextStudy);
  };

  return (
    <section aria-label="How you're doing" className="flex flex-col rounded-[28px] border border-stone bg-eggshell/95 p-6 shadow-[var(--shadow-whisper)] lg:min-h-[560px]">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">How you're doing</p>
      <h2 className="display mt-1 text-3xl">Your progress</h2>
      {(week.classes > 0 || week.answered > 0) && <p className="mt-1 text-sm text-smoke">
        This week: {week.classes} class{week.classes === 1 ? "" : "es"}{week.answered > 0 && <> · {week.right} of {week.answered} check-ins right</>}
        {week.streak > 1 && <span className="progress-streak ml-2">{week.streak} weeks in a row</span>}
      </p>}
      <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto">
        {nothing && <p className="rounded-2xl bg-taupe p-4 text-sm text-smoke">Answer check-ins and use I&apos;m lost or Got it in class. Your next steps will show up here. Only you can see this.</p>}

        {next && <div className="progress-next rounded-[20px] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">Next up</p>
          {next.kind === "missed" && <>
            <p className="mt-1 text-base">Review <b>{next.topic}</b></p>
            <p className="text-sm text-smoke">You missed {next.count} check-in{next.count === 1 ? "" : "s"} on this.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={lessonLink(next.lesson)!} className="btn btn-primary btn-sm">Open the lesson</Link>
              {missed.some((c) => c.topic === next.topic) && <button className="btn btn-outline btn-sm" onClick={() => setRetrying(next.topic)}>Try them again</button>}
            </div>
            <p className="mt-2 text-xs text-smoke">More help: <a className="text-sky-deep underline" href={khan(next.topic, next.subject)} target="_blank" rel="noreferrer">Khan Academy</a> · <a className="text-sky-deep underline" href={videos(next.topic, next.subject)} target="_blank" rel="noreferrer">Videos</a></p>
          </>}
          {next.kind === "review" && <>
            <p className="mt-1 text-base">Go back over <b>{next.topic}</b></p>
            <p className="text-sm text-smoke">You marked this for review.</p>
            {next.lesson && <Link href={lessonLink(next.lesson)!} className="btn btn-primary btn-sm mt-3">Open the lesson</Link>}
          </>}
          {next.kind === "clear" && <p className="mt-1 text-sm">You&apos;re all caught up. Nothing missed or marked for review.</p>}
        </div>}

        {missed.length > 0 && <div>
          {retrying === null
            ? <button className="btn btn-outline btn-sm w-full" onClick={() => setRetrying("")}>Retry missed check-ins ({missed.length})</button>
            : <Retry items={retrying ? missed.filter((c) => c.topic === retrying) : missed} onClose={() => setRetrying(null)}
              onAnswer={(id, given) => { const r = retryCheckin(log, id, given, isCorrect); save(r.log, study); return r.correct; }} />}
        </div>}

        {topics.length > 0 && <div className="space-y-3">
          <h3 className="text-sm font-medium">By topic</h3>
          {topics.map((group) => <div key={group.subject}>
            <p className="text-xs font-medium uppercase tracking-wide text-smoke">{group.subject}</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {group.topics.slice(0, 8).map((t) => <li key={t.topic} className="progress-topic" data-status={t.status}
                title={`${t.right} right, ${t.wrong} missed`}>
                <span aria-hidden className="progress-topic-dot" />{t.topic}<span className="sr-only">: {t.status}, {t.right} right, {t.wrong} missed</span>
              </li>)}
              {group.topics.length > 8 && <li className="px-2 py-1 text-xs text-smoke">+{group.topics.length - 8} more</li>}
            </ul>
          </div>)}
          <p className="flex flex-wrap gap-3 text-xs text-smoke"><span className="progress-key" data-status="strong">Strong</span><span className="progress-key" data-status="mixed">Mixed</span><span className="progress-key" data-status="needs work">Needs work</span></p>
        </div>}

        {!topics.length && legacy.length > 0 && <div className="space-y-3">
          {legacy.map(([name, s]) => { const a = accuracy(s); return <div key={name}>
            <div className="flex items-baseline justify-between"><p className="font-medium">{name}</p><p className="text-xs text-smoke">{s.checkRight + s.quizRight} right · {s.checkWrong + s.quizWrong} wrong</p></div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#fde8e8]" role="img" aria-label={a === null ? "No answers yet" : `${a} percent right`}><div className="h-2.5 rounded-full bg-[#2fbf71] transition-[width] duration-500" style={{ width: `${a ?? 0}%` }} /></div>
          </div>; })}
        </div>}

        {(feel.turnedAround.length > 0 || feel.stillLost.length > 0) && <div className="rounded-[20px] bg-taupe p-4 text-sm">
          <h3 className="font-medium">How it felt</h3>
          {feel.turnedAround.length > 0 && <p className="mt-1">You went from lost to <b>got it</b> on {list(feel.turnedAround)}. Nice work.</p>}
          {feel.stillLost.length > 0 && <p className="mt-1 text-smoke">Still unsure: {list(feel.stillLost)}.</p>}
        </div>}

        {open.length > 0 && <div>
          <h3 className="text-sm font-medium">To revisit</h3>
          <ul className="mt-2 space-y-2">
            {(showAll ? open : open.slice(0, REVISIT_SHOWN)).map((entry) => <li key={entry.id} className="rounded-2xl bg-taupe p-3 text-sm">
              <p className="font-medium">{entry.topic}</p>
              <p className="mt-0.5">{entry.question ?? "Marked for review"}</p>
              {entry.suggestion && <details className="mt-1.5"><summary className="cursor-pointer text-xs text-sky-deep">Study tip</summary><div className="mt-1 whitespace-pre-wrap"><RichText text={entry.suggestion} /></div></details>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button className="btn btn-outline btn-sm" onClick={() => gotIt(entry)}>Got it now</button>
                {entry.code && <Link href={lessonLink(entry.code)!} className="text-xs text-sky-deep hover:underline">Open the lesson</Link>}
              </div>
            </li>)}
          </ul>
          {open.length > REVISIT_SHOWN && <button className="mt-2 text-sm font-medium text-sky-deep hover:underline" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `See all (${open.length})`}</button>}
        </div>}
      </div>
    </section>
  );
}

const list = (items: string[]) => items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** Re-asks missed check-ins one at a time and grades them on the device (no AI, no cost). */
function Retry({ items, onAnswer, onClose }: { items: { id: string; question: string; given?: string; key?: string; topic: string }[]; onAnswer: (id: string, given: string) => boolean; onClose: () => void }) {
  const [queue] = useState(items);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const item = queue[index];
  const done = index >= queue.length;
  return <div className="progress-retry rounded-[20px] border border-sky p-4" role="group" aria-label="Retry missed check-ins">
    <div className="flex items-center justify-between text-xs text-smoke">
      <span>{done ? "Done" : `Question ${index + 1} of ${queue.length}`}</span>
      <button className="hover:underline" onClick={onClose}>Close</button>
    </div>
    {done ? <p className="mt-2 text-sm">You got {score} of {queue.length} right this time.{score < queue.length ? " The rest stay here so you can try again later." : " They're cleared from Next up."}</p> : <>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-sky-deep">{item.topic}</p>
      <p className="mt-0.5 font-medium">{item.question}</p>
      {item.given && <p className="mt-1 text-xs text-smoke">Last time you answered: {item.given}</p>}
      <form className="mt-3 flex gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (result !== null) { setIndex(index + 1); setValue(""); setResult(null); return; }
        if (!value.trim()) return;
        const ok = onAnswer(item.id, value.trim());
        setResult(ok); if (ok) setScore(score + 1);
      }}>
        <input className="input py-2 text-sm" aria-label="Your answer" value={value} disabled={result !== null} onChange={(e) => setValue(e.target.value)} autoFocus />
        <button className="btn btn-primary btn-sm shrink-0" type="submit">{result === null ? "Check" : "Next"}</button>
      </form>
      <Collapse open={result !== null}>
        <p role="status" className={`mt-2 text-sm ${result ? "text-emerald-800" : ""}`}>{result ? "Right. Nice work." : <>Not quite. The answer was <b>{item.key}</b>.</>}</p>
      </Collapse>
    </>}
  </div>;
}
