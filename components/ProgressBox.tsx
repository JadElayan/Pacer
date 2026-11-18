"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { accuracy, loadProfile, loadStudy, mergeStudy, saveStudy, subjectOf, type Profile, type StudyEntry } from "@/lib/profile";
import { PROGRESS_CHANGED } from "@/lib/progress";
import { mergeProfiles, pullLearning, pushProfile } from "@/lib/cloudProfile";
import { addSignal, confidence, loadLog, mergeLogs, missedCheckins, retryCheckin, saveLog, topicProgress, upsertCheckin, weekSummary, emptyLog, type CheckinRecord, type ProgressLog } from "@/lib/progress";
import { forLessons, isPlaceholderTitle, planFocus, planMaterial, planSteps, resolveReview, stepsDone, today, type PlanFocus, type PlanProgress, type ReviewItem, type StepId } from "@/lib/studyPlan";
import { lessonName } from "@/lib/lessonList";
import { isCorrect } from "@/lib/grade";
import { askAI } from "@/lib/ai";
import { loadLessons, type Lesson } from "@/lib/lessons";
import { uid } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";
import { RichText } from "./RichText";
import { Collapse } from "./Motion";
import { QuizView, type QuizData } from "./QuizView";

const KHAN: Record<string, string> = { algebra: "math/algebra", trigonometry: "math/trigonometry", geometry: "math/geometry", calculus: "math/calculus-1" };
const khan = (topic: string, subject?: string) => { const k = KHAN[(subject ?? "").toLowerCase()]; return k && !topic ? `https://www.khanacademy.org/${k}` : `https://www.khanacademy.org/search?page_search_query=${encodeURIComponent([topic, subject].filter(Boolean).join(" "))}`; };
const videos = (topic: string, subject?: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent([topic, subject, "lesson for students"].filter(Boolean).join(" "))}`;
const lessonLink = (code: string) => `/lesson/${encodeURIComponent(code)}?page=notes`;
const REVISIT_SHOWN = 3;
const planKey = (userId?: string) => `pacer:plan:${userId ?? "guest"}`;
const STEP_TEXT: Record<StepId, { title: string; detail: string }> = {
  reread: { title: "Re-read the notes", detail: "Open the lesson where it was taught." },
  explain: { title: "Have it explained", detail: "A short explanation from your class notes." },
  retry: { title: "Retry what you missed", detail: "Answer the check-ins again." },
  practice: { title: "Try a practice question", detail: "One new question like the ones in class." },
};

/** Right-hand box on the Learning dashboard: a short study plan, how each topic is going, and what to revisit. Private to the student. */
export function ProgressBox() {
  const { user, ready } = useAuth();
  const userId = user?.id;
  const [profile, setProfile] = useState<Profile>({});
  const [study, setStudy] = useState<StudyEntry[]>([]);
  const [log, setLog] = useState<ProgressLog>(emptyLog());
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [synced, setSynced] = useState(false);
  const [plan, setPlan] = useState<PlanProgress | null>(null);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    setSynced(false);
    const readLocal = () => {
      setProfile(loadProfile(userId)); setStudy(loadStudy(userId)); setLog(loadLog(userId));
      setLessons(loadLessons(userId).filter((l) => !l.removed));
    };
    readLocal();
    // Removing a lesson on the left purges its progress; re-read so this box updates at once.
    window.addEventListener(PROGRESS_CHANGED, readLocal);
    try { setPlan(JSON.parse(localStorage.getItem(planKey(userId)) ?? "null")); } catch { setPlan(null); }
    if (userId) void pullLearning(userId).then((remote) => {
      if (!active) return;
      const nextLog = mergeLogs(loadLog(userId), remote.log);
      const nextStudy = mergeStudy(remote.study, loadStudy(userId));
      saveLog(nextLog, userId); saveStudy(nextStudy, userId);
      setProfile(mergeProfiles(loadProfile(userId), remote.profile)); setStudy(nextStudy); setLog(nextLog); setSynced(true);
    }).catch(() => {});
    return () => { active = false; window.removeEventListener(PROGRESS_CHANGED, readLocal); };
  }, [ready, userId]);

  // Changes made here (retries, practice, "Got it now") are saved on the device and, once synced, to the account.
  const save = (nextLog: ProgressLog, nextStudy: StudyEntry[]) => {
    setLog(nextLog); setStudy(nextStudy);
    saveLog(nextLog, userId); saveStudy(nextStudy, userId);
    if (userId && synced) void pushProfile(userId, profile, nextStudy, nextLog).catch(() => {});
  };

  const [chosen, setChosen] = useState<string>();
  const [skip, setSkip] = useState<string[]>([]);
  const [retryAll, setRetryAll] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const planRef = useRef<HTMLDivElement>(null);
  // Only progress from lessons the student still has (removed lessons leave nothing behind).
  const shown = forLessons(log, study, lessons);
  const review = resolveReview(shown.study, lessons, lessonName);
  const focus = planFocus(shown.log, review, chosen, skip);
  const week = weekSummary(shown.log, lessons.map((l) => l.ts));
  const topics = topicProgress(shown.log);
  const missed = missedCheckins(shown.log);
  const feel = confidence(shown.log);
  const open = review.filter((entry) => !entry.resolved);
  const subjects = new Set(lessons.map((l) => subjectOf(l.title, l.subject)));
  const legacy = Object.entries(profile).filter(([name, s]) => subjects.has(name) && s.checkRight + s.checkWrong + s.quizRight + s.quizWrong > 0);
  const nothing = !shown.log.checkins.length && !shown.log.signals.length && !shown.study.length && !legacy.length;

  const study_ = (topic: string) => {
    setChosen(topic); setSkip([]);
    planRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const gotIt = (ids: string[], topic: string, lesson?: string) => {
    const nextStudy = study.map((item) => ids.includes(item.id) ? { ...item, resolved: true } : item);
    const nextLog = addSignal(log, { id: `resolved-${ids[0] ?? topic}-${Date.now()}`, ts: Date.now(), lesson: lesson ?? "", topic, kind: "gotit" });
    save(nextLog, nextStudy);
  };
  const markStep = (topic: string, step: StepId) => {
    const done = [...new Set([...stepsDone(plan, topic), step])];
    const next = { topic, day: today(), done };
    setPlan(next);
    try { localStorage.setItem(planKey(userId), JSON.stringify(next)); } catch { /* the plan still works for this visit */ }
  };

  return (
    <section aria-label="How you're doing" className="flex flex-col rounded-[28px] border border-stone bg-eggshell/95 p-6 shadow-[var(--shadow-whisper)] lg:min-h-[560px]">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">How you're doing</p>
      <h2 className="display mt-1 text-3xl">Your progress</h2>
      {(week.classes > 0 || week.answered > 0) && <p className="mt-1 text-sm text-smoke">
        This week: {week.classes} class{week.classes === 1 ? "" : "es"}{week.answered > 0 && <> · {week.right} of {week.answered} check-ins right</>}
        {week.streak > 1 && <span className="progress-streak ml-2">{week.streak} weeks in a row</span>}
      </p>}
      <div className="-mx-1 mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-1">
        {nothing && <p className="rounded-2xl bg-taupe p-4 text-sm text-smoke">Answer check-ins and use I&apos;m lost or Got it in class. A study plan will show up here. Only you can see this.</p>}

        <div ref={planRef}>
          {focus ? <StudyPlan key={focus.topic} focus={focus} lessons={lessons} log={shown.log} done={stepsDone(plan, focus.topic)}
            onStep={(step) => { markStep(focus.topic, step); setChosen(focus.topic); }}
            onRetry={(id, given) => { const r = retryCheckin(log, id, given, isCorrect); save(r.log, study); return r.correct; }}
            onPractice={(record) => save(upsertCheckin(log, record), study)}
            onNext={(f) => { if (f.reviewIds.length) gotIt(f.reviewIds, f.topic, f.lesson); setSkip([...skip, f.topic]); setChosen(undefined); }}
            onClose={chosen ? () => setChosen(undefined) : undefined} />
            : !nothing && <div className="progress-next rounded-[20px] p-4 text-sm"><p className="text-xs font-medium uppercase tracking-wide text-sky-deep">Study plan</p><p className="mt-1">You&apos;re all caught up. Nothing missed or marked for review.</p></div>}
        </div>

        {missed.length > (focus?.retryIds.length ?? 0) && missed.length > 1 && !retryAll && <button className="text-sm font-medium text-sky-deep hover:underline" onClick={() => setRetryAll(true)}>Retry all missed check-ins ({missed.length})</button>}
        {retryAll && <Retry items={missed} onClose={() => setRetryAll(false)} onAnswer={(id, given) => { const r = retryCheckin(log, id, given, isCorrect); save(r.log, study); return r.correct; }} />}

        {topics.length > 0 && <div className="space-y-3">
          <h3 className="text-sm font-medium">By topic <span className="font-normal text-smoke">· choose one to study it</span></h3>
          {topics.map((group) => <div key={group.subject}>
            <p className="text-xs font-medium uppercase tracking-wide text-smoke">{group.subject}</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {group.topics.slice(0, 8).map((t) => <li key={t.topic}>
                <button className="progress-topic" data-status={t.status} aria-pressed={focus?.topic === t.topic} onClick={() => study_(t.topic)}
                  aria-label={`Study ${t.topic}: ${t.status}, ${t.right} right, ${t.wrong} missed`}>
                  <span aria-hidden className="progress-topic-dot" />{t.topic}
                </button>
              </li>)}
              {group.topics.length > 8 && <li className="px-2 py-1 text-xs text-smoke">+{group.topics.length - 8} more</li>}
            </ul>
          </div>)}
          <p className="flex flex-wrap gap-3 text-xs text-smoke"><span className="progress-key" data-status="strong">Strong</span><span className="progress-key" data-status="mixed">Mixed</span><span className="progress-key" data-status="needs work">Needs work</span></p>
        </div>}

        {!topics.length && legacy.length > 0 && <div className="space-y-3">
          <p className="text-xs text-smoke">Check-in results from earlier classes. Topics show up here after your next check-in.</p>
          {legacy.map(([name, s]) => { const a = accuracy(s); return <div key={name}>
            <div className="flex items-baseline justify-between"><p className="font-medium">{isPlaceholderTitle(name) ? "Earlier classes" : name}</p><p className="text-xs text-smoke">{s.checkRight + s.quizRight} right · {s.checkWrong + s.quizWrong} wrong</p></div>
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
            {(showAll ? open : open.slice(0, REVISIT_SHOWN)).map((entry) => <RevisitItem key={entry.id} entry={entry} lessons={lessons}
              active={focus?.topic === entry.label} onStudy={() => study_(entry.label)} onGotIt={() => gotIt([entry.id], entry.label, entry.code)} />)}
          </ul>
          {open.length > REVISIT_SHOWN && <button className="mt-2 text-sm font-medium text-sky-deep hover:underline" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `See all (${open.length})`}</button>}
        </div>}
      </div>
    </section>
  );
}

const list = (items: string[]) => items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

function RevisitItem({ entry, lessons, active, onStudy, onGotIt }: { entry: ReviewItem; lessons: Lesson[]; active: boolean; onStudy: () => void; onGotIt: () => void }) {
  const lesson = entry.code ? lessons.find((l) => l.code === entry.code) : undefined;
  const from = lesson ? lessonName(lesson) : undefined;
  return <li className="rounded-2xl bg-taupe p-3 text-sm">
    <p className="font-medium">{entry.label}</p>
    {from && from !== entry.label && <p className="text-xs text-smoke">From {from}</p>}
    <p className="mt-1">{entry.question ? <>You asked: &ldquo;{entry.question}&rdquo;</> : "You marked this for review."}</p>
    {entry.suggestion && <details className="mt-1.5"><summary className="cursor-pointer text-xs text-sky-deep">Study tip</summary><div className="mt-1 whitespace-pre-wrap"><RichText text={entry.suggestion} /></div></details>}
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button className="btn btn-primary btn-sm" aria-pressed={active} onClick={onStudy}>{active ? "Studying now" : "Study this"}</button>
      {entry.code && <Link href={lessonLink(entry.code)} className="btn btn-outline btn-sm">Open the lesson</Link>}
      <button className="ml-auto text-xs text-smoke hover:underline" onClick={onGotIt}>Got it now</button>
    </div>
  </li>;
}

/** The plan for one topic: up to three steps the student can tick off, with Explain and Practice on request. */
function StudyPlan({ focus: live, lessons, log, done, onStep, onRetry, onPractice, onNext, onClose }: {
  focus: PlanFocus; lessons: Lesson[]; log: ProgressLog; done: StepId[];
  onStep: (step: StepId) => void; onRetry: (id: string, given: string) => boolean; onPractice: (record: CheckinRecord) => void;
  onNext: (focus: PlanFocus) => void; onClose?: () => void;
}) {
  // Freeze the plan when it opens: getting a retry right shouldn't drop that step or change the reason halfway through.
  const [plan] = useState(() => ({ focus: live, steps: planSteps(live), retryItems: log.checkins.filter((c) => live.retryIds.includes(c.id)) }));
  const { focus, steps, retryItems } = plan;
  const complete = steps.every((s) => done.includes(s));
  const [openStep, setOpenStep] = useState<StepId | null>(null);
  const [explain, setExplain] = useState<{ text?: string; error?: string; loading?: boolean }>();
  const [quiz, setQuiz] = useState<{ data?: QuizData; error?: string; loading?: boolean }>();
  const material = () => planMaterial(focus, lessons, log);

  const askExplain = async () => {
    setOpenStep("explain"); setExplain({ loading: true });
    try {
      const m = material();
      const r = await askAI({ kind: focus.question ? "followup" : "explain", mode: "standard", detail: "short", topicTitle: focus.topic, ...m,
        question: focus.question ? `Earlier in class I asked: "${focus.question}". Explain it simply, using only these notes.` : undefined });
      setExplain({ text: r.text });
      onStep(steps.includes("reread") ? "reread" : "explain");
    } catch (e) { setExplain({ error: e instanceof Error ? e.message : "Couldn't get an explanation. Try again." }); }
  };
  const askPractice = async () => {
    setOpenStep("practice"); setQuiz({ loading: true });
    try {
      const r = await askAI({ kind: "quiz", mode: "standard", topicTitle: focus.topic, ...material() });
      const d = r.data as QuizData | undefined;
      if (!d?.question || !d.answer) throw new Error("Couldn't make a practice question. Try again.");
      setQuiz({ data: d });
    } catch (e) { setQuiz({ error: e instanceof Error ? e.message : "Couldn't make a practice question. Try again." }); }
  };

  return <div className="progress-next rounded-[20px] p-4" role="group" aria-label={`Study plan for ${focus.topic}`}>
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">Today&apos;s review · about 10 min</p>
      {onClose && <button className="text-xs text-smoke hover:underline" onClick={onClose}>Back to suggested</button>}
    </div>
    <p className="mt-1 text-base">Study <b>{focus.topic}</b></p>
    <p className="text-sm text-smoke">{focus.reason}</p>

    {complete ? <div className="mt-3 rounded-xl bg-white/80 p-3 text-sm" role="status">
      <p className="font-medium">Plan done. Nice work.</p>
      <p className="text-smoke">Keep going with the next topic, or come back tomorrow.</p>
      <button className="btn btn-primary btn-sm mt-2" onClick={() => onNext(focus)}>Next topic</button>
    </div> : <ol className="mt-3 space-y-2">
      {steps.map((step, i) => {
        const isDone = done.includes(step);
        return <li key={step} className="progress-step" data-done={isDone}>
          <span aria-hidden className="progress-step-mark">{isDone ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg> : i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{STEP_TEXT[step].title}{isDone && <span className="sr-only"> (done)</span>}</p>
            <p className="text-xs text-smoke">{step === "retry" ? `${retryItems.length} check-in${retryItems.length === 1 ? "" : "s"} to try again.` : STEP_TEXT[step].detail}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {step === "reread" && focus.lesson && <>
                <Link href={lessonLink(focus.lesson)} className="btn btn-outline btn-sm" onClick={() => onStep("reread")}>Open the notes</Link>
                <button className="text-xs text-sky-deep hover:underline" disabled={explain?.loading} onClick={() => void askExplain()}>{explain?.loading ? "Explaining…" : "Explain it to me"}</button>
              </>}
              {step === "explain" && <button className="btn btn-outline btn-sm" disabled={explain?.loading} onClick={() => void askExplain()}>{explain?.loading ? "Explaining…" : isDone ? "Explain again" : "Explain it to me"}</button>}
              {step === "retry" && openStep !== "retry" && <button className="btn btn-outline btn-sm" onClick={() => setOpenStep("retry")}>{isDone ? "Try again" : "Start"}</button>}
              {step === "practice" && <button className="btn btn-outline btn-sm" disabled={quiz?.loading} onClick={() => void askPractice()}>{quiz?.loading ? "Making a question…" : quiz?.data ? "Another question" : "Give me one"}</button>}
            </div>
            {step === "retry" && openStep === "retry" && <div className="pt-2"><Retry items={retryItems} onAnswer={onRetry} onClose={() => setOpenStep(null)} onDone={() => onStep("retry")} /></div>}
            {step === "practice" && <Collapse open={openStep === "practice" && !!quiz && !quiz.loading}>
              <div className="mt-2 rounded-xl bg-white p-3">
                {quiz?.error ? <p role="alert" className="text-sm">{quiz.error}</p> : quiz?.data && <QuizView key={quiz.data.question} data={quiz.data} onResult={(ok) => {
                  onPractice({ id: `practice-${uid()}`, ts: Date.now(), lesson: focus.lesson ?? "", lecture: "Practice", subject: focus.subject ?? "Practice", topic: focus.topic, question: quiz.data!.question, key: quiz.data!.answer, correct: ok });
                  onStep("practice");
                }} />}
              </div>
            </Collapse>}
          </div>
        </li>;
      })}
    </ol>}

    {explain?.loading && <p role="status" className="progress-loading mt-3 text-sm text-smoke">Explaining from your notes…</p>}
    <Collapse open={!!explain && !explain.loading}>
      <div className="mt-3 rounded-xl bg-white p-3 text-sm">
        <div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wide text-sky-deep">Explained from your notes</p><button className="text-xs text-smoke hover:underline" onClick={() => setExplain(undefined)}>Hide</button></div>
        {explain?.error ? <p role="alert" className="mt-1">{explain.error}</p> : <div className="mt-1 whitespace-pre-wrap"><RichText text={explain?.text ?? ""} /></div>}
      </div>
    </Collapse>

    <p className="mt-3 text-xs text-smoke">More help: <a className="text-sky-deep underline" href={khan(focus.topic, focus.subject)} target="_blank" rel="noreferrer">Khan Academy</a> · <a className="text-sky-deep underline" href={videos(focus.topic, focus.subject)} target="_blank" rel="noreferrer">Videos</a></p>
  </div>;
}

/** Re-asks missed check-ins one at a time and grades them on the device (no AI, no cost). */
function Retry({ items, onAnswer, onClose, onDone }: { items: { id: string; question: string; given?: string; key?: string; topic: string }[]; onAnswer: (id: string, given: string) => boolean; onClose: () => void; onDone?: () => void }) {
  const [queue] = useState(items);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const item = queue[index];
  const done = index >= queue.length;
  const reported = useRef(false);
  useEffect(() => { if (done && !reported.current) { reported.current = true; onDone?.(); } }, [done, onDone]);
  return <div className="progress-retry rounded-[20px] border border-sky p-4" role="group" aria-label="Retry missed check-ins">
    <div className="flex items-center justify-between text-xs text-smoke">
      <span>{done ? "Done" : `Question ${index + 1} of ${queue.length}`}</span>
      <button className="hover:underline" onClick={onClose}>Close</button>
    </div>
    {done ? <p className="mt-2 text-sm">You got {score} of {queue.length} right this time.{score < queue.length ? " The rest stay here so you can try again later." : " Nice work."}</p> : <>
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
