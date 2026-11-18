"use client";
import Link from "next/link";
import { Collapse, SegmentedControl } from "./Motion";
import { useEffect, useState } from "react";
import { loadLessons, markLessonEnded, mergeLessons, pullLessons, removeLesson, storeLessons, type Lesson } from "@/lib/lessons";
import { groupByClass, groupLessons, isEmptyLesson, lessonName, LESSONS_SHOWN, matchesSearch, SEARCH_AFTER } from "@/lib/lessonList";
import { isLive, joinClass, myClasses, type PacerClass } from "@/lib/classes";
import { loadLog, PROGRESS_CHANGED, saveLog } from "@/lib/progress";
import { loadProfile, loadStudy, saveStudy } from "@/lib/profile";
import { purgeLesson } from "@/lib/studyPlan";
import { pushProfile } from "@/lib/cloudProfile";
import { authEnabled } from "@/lib/supabase";
import { LIVE_WINDOW_MS, probeLesson, type LessonStatus } from "@/lib/lessonStatus";
import { LessonPreview, type LessonView } from "./LessonPreview";
import type { RoomState } from "@/lib/types";
import { useAuth } from "@/lib/useAuth";

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
    const lesson = lessons.find((item) => item.code === code);
    setLessons((items) => items.filter((item) => item.code !== code));
    // Its questions, review marks and check-ins go too, so Your progress and My profile stop showing them.
    if (lesson) {
      const purged = purgeLesson(loadLog(userId), loadStudy(userId), lesson, lessons.filter((item) => item.code !== code && !item.removed));
      saveLog(purged.log, userId); saveStudy(purged.study, userId);
      window.dispatchEvent(new Event(PROGRESS_CHANGED));
      if (userId) void pushProfile(userId, loadProfile(userId), purged.study, purged.log).catch(() => { /* the account copy is hidden on the dashboard anyway */ });
    }
    try { setLessons(await removeLesson(code, userId)); }
    catch { setRemoveError("Removed here, but your account copy couldn't be updated. Try again later."); }
  };
  const row = (l: Lesson) => {
              const live = statusOf(l) === "live";
              const name = lessonName(l);
              return <li key={l.code} data-open={open === l.code} className={`lesson-card lesson-row rounded-2xl border px-3 py-2.5 ${live ? "border-emerald-300 bg-emerald-50/40" : "border-stone"}`}>
                {/* The whole row opens a summary and preview, so students know what's inside before opening or rejoining. */}
                <button className="flex w-full items-center gap-2 text-left" aria-expanded={open === l.code} onClick={() => { setConfirming(undefined); setOpen(open === l.code ? null : l.code); }}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium"><span className="truncate">{name}</span>{live && <LessonBadge status="live" />}</span>
                    <span className="block truncate text-xs text-smoke">{name.endsWith(when(l.ts)) ? (isEmptyLesson(l) ? "Nothing saved" : "Notes saved") : <>{l.subject && !name.startsWith(l.subject) ? `${l.subject} · ` : ""}{when(l.ts)}{l.topics.length ? ` · ${l.topics.length} topic${l.topics.length === 1 ? "" : "s"}` : ""}</>}</span>
                  </span>
                  <span aria-hidden className="lesson-card-toggle"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3.5 8h9" /><path className="lesson-card-toggle-v" d="M8 3.5v9" /></svg></span>
                </button>
                <Collapse open={open === l.code}>
                  {(() => {
                    const room = live ? rooms[l.code] : undefined;
                    const view = viewOf(l, room);
                    const topics = (room ? room.topics.map((t) => ({ title: t.title, summary: t.summary })) : l.topics).filter((t) => t.title.trim());
                    const mine = Object.keys(l.myNotes ?? {}).length + (l.myClips?.length ?? 0);
                    return <div className="space-y-3 pt-3" data-lesson-preview>
                      {topics.length > 0 && <div className="rounded-xl bg-sky-soft/60 p-3 text-sm">
                        <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">{live ? "Covered so far" : "What was covered"}</p>
                        <ul className="mt-1.5 space-y-1.5">
                          {topics.slice(0, 3).map((t, i) => <li key={i}><span className="font-medium">{t.title}</span>{t.summary && <span className="block text-smoke">{t.summary}</span>}</li>)}
                        </ul>
                        {topics.length > 3 && <p className="mt-1.5 text-xs text-smoke">and {topics.length - 3} more topic{topics.length - 3 === 1 ? "" : "s"}</p>}
                        {mine > 0 && <p className="mt-1.5 text-xs text-smoke">You saved {mine} note{mine === 1 ? "" : "s"} or clip{mine === 1 ? "" : "s"}.</p>}
                      </div>}
                      {view ? <LessonPreview view={view} live={live} userId={userId} topic={room ? room.topics.find((t) => t.id === room.currentTopicId)?.title : l.currentTopic} />
                        : !topics.length && <p className="rounded-xl bg-taupe p-3 text-sm text-smoke">{live ? "Connecting to the live class…" : "Nothing was saved from this class."}</p>}
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {live && <Link href={`/room/${encodeURIComponent(l.code)}`} className="btn btn-primary btn-sm">Rejoin live class</Link>}
                        <Link href={`/lesson/${encodeURIComponent(l.code)}`} className={`btn btn-sm ${live ? "btn-outline" : "btn-primary"}`}>{live ? "Review so far" : "Open lesson"}</Link>
                        {!live && (confirming === l.code ? <span className="ml-auto flex flex-wrap items-center gap-2">
                          <span>Remove from your list?</span>
                          <button className="btn btn-outline btn-sm" onClick={() => void remove(l.code)}>Remove</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setConfirming(undefined)}>Cancel</button>
                        </span> : <button className="lesson-remove ml-auto" onClick={() => setConfirming(l.code)} aria-label={`Remove ${name} from your lessons`}>
                          <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.5h6.6l.7-8.5" /></svg>Remove
                        </button>)}
                      </div>
                    </div>;
                  })()}
                </Collapse>
              </li>;
  };
  // By class: lessons grouped by teacher-made class, else teacher and subject. Signed-in students also see classes they joined.
  const [view, setViewState] = useState<"class" | "all">("class");
  useEffect(() => { try { if (localStorage.getItem("pacer:lessons-view") === "all") setViewState("all"); } catch { /* default */ } }, []);
  const setView = (v: "class" | "all") => { setViewState(v); try { localStorage.setItem("pacer:lessons-view", v); } catch { /* not kept */ } };
  const [joined, setJoined] = useState<PacerClass[]>([]);
  useEffect(() => {
    if (!userId) { setJoined([]); return; }
    let active = true;
    void myClasses(userId).then((list) => { if (active) setJoined(list); }).catch(() => {});
    return () => { active = false; };
  }, [userId]);
  const classGroups = (() => {
    const groups = groupByClass(worth);
    for (const c of joined) if (!groups.some((g) => g.classId === c.id)) groups.push({ key: `class:${c.id}`, name: c.name, teacher: c.teacher_name ?? undefined, color: c.color ?? undefined, classId: c.id, items: [], latest: 0 });
    return groups;
  })();
  const canGroup = classGroups.some((g) => g.key !== "other") && (worth.length >= 3 || joined.length > 0);
  const byClass = canGroup && view === "class" && !searching;
  const [openClass, setOpenClass] = useState<string | null>(null);
  const [allIn, setAllIn] = useState<Record<string, boolean>>({});
  const [code, setCode] = useState("");
  const [joinState, setJoinState] = useState<{ busy?: boolean; message?: string; error?: boolean }>({});
  const join = async () => {
    if (!code.trim()) return;
    setJoinState({ busy: true });
    try { const c = await joinClass(code); setJoined((list) => [...list.filter((x) => x.id !== c.id), c]); setCode(""); setJoinState({ message: `You joined ${c.name}.` }); setOpenClass(`class:${c.id}`); setView("class"); }
    catch (e) { setJoinState({ error: true, message: e instanceof Error ? e.message : "Couldn't join that class." }); }
  };

  return (
    <section aria-label="What you've learned" className="flex flex-col rounded-[28px] border border-stone bg-eggshell/95 p-6 shadow-[var(--shadow-whisper)] lg:min-h-[560px]">
      <p className="text-xs font-medium uppercase tracking-wide text-sky-deep">What you've learned</p>
      <h2 className="display mt-1 text-3xl">Your lessons</h2>
      <p className="mt-1 text-sm text-smoke">Pacer takes notes while you're in class, so you can go back over them any time.</p>
      {canGroup && <div className="mt-3"><SegmentedControl label="Group lessons" value={view} onChange={setView}
        options={[{ value: "class", label: "By class" }, { value: "all", label: "All lessons" }] as const} /></div>}
      {worth.length > SEARCH_AFTER && <input type="search" aria-label="Search your lessons" placeholder="Search lessons" className="input mt-4 py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />}
      {removeError && <p role="alert" className="mt-2 text-sm">{removeError}</p>}
      <div className="-mx-1 mt-4 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {ordered.length === 0 && <p className="rounded-2xl bg-taupe p-4 text-sm text-smoke">No lessons yet. Join a meeting and your notes will show up here.</p>}
        {searching && !matching.length && <p className="rounded-2xl bg-taupe p-4 text-sm text-smoke">No lessons match &ldquo;{query.trim()}&rdquo;.</p>}
        {byClass && <ul className="space-y-2">{classGroups.map((g) => {
          const isOpen = openClass === g.key;
          const live = g.items.filter((l) => statusOf(l) === "live").length;
          const cls = joined.find((c) => c.id === g.classId);
          const liveCode = cls && isLive(cls) ? cls.live_code : null;
          const list = allIn[g.key] ? g.items : g.items.slice(0, LESSONS_SHOWN);
          return <li key={g.key} className="class-card rounded-2xl border border-stone" data-open={isOpen} style={g.color ? { ["--class" as string]: g.color } : undefined}>
            <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-expanded={isOpen} onClick={() => setOpenClass(isOpen ? null : g.key)}>
              <span aria-hidden className="class-dot" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium"><span className="truncate">{g.name}</span>{(live > 0 || liveCode) && <LessonBadge status="live" />}</span>
                <span className="block truncate text-xs text-smoke">{g.teacher ? `${g.teacher} · ` : ""}{g.items.length ? `${g.items.length} lesson${g.items.length === 1 ? "" : "s"} · last ${when(g.latest)}` : "No lessons yet"}</span>
              </span>
              <span aria-hidden className="lesson-card-toggle"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3.5 8h9" /><path className="lesson-card-toggle-v" d="M8 3.5v9" /></svg></span>
            </button>
            {liveCode && !live && <div className="px-3 pb-2.5"><Link href={`/room/${liveCode}`} className="btn btn-primary btn-sm">Class is live · Join</Link></div>}
            <Collapse open={isOpen}>
              <div className="px-2 pb-2">
                {g.items.length ? <ul className="space-y-2">{list.map(row)}</ul> : <p className="px-1 pb-1 text-sm text-smoke">Lessons from this class will show up here after you join one of its meetings.</p>}
                {g.items.length > LESSONS_SHOWN && <button className="mt-2 px-1 text-sm font-medium text-sky-deep hover:underline" aria-expanded={!!allIn[g.key]} onClick={() => setAllIn((m) => ({ ...m, [g.key]: !m[g.key] }))}>{allIn[g.key] ? "Show fewer" : `Show all (${g.items.length})`}</button>}
              </div>
            </Collapse>
          </li>;
        })}</ul>}
        {!byClass && groups.map((group) => <div key={group.label} className="lesson-group mt-4 first:mt-0">
          {(groups.length > 1 || showAll || searching) && <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-smoke">{group.label}</h3>}
          <ul className="space-y-2">
            {group.items.map(row)}
          </ul>
        </div>)}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          {!byClass && !searching && matching.length > LESSONS_SHOWN && <button className="font-medium text-sky-deep hover:underline" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all (${matching.length})`}</button>}
          {empty.length > 0 && <button className="text-smoke hover:underline" aria-pressed={showEmpty} onClick={() => setShowEmpty(!showEmpty)}>{showEmpty ? "Hide empty classes" : `${empty.length} empty class${empty.length === 1 ? "" : "es"} hidden`}</button>}
        </div>
        {authEnabled() && <form className="class-join mt-4 border-t border-stone pt-3" onSubmit={(e) => { e.preventDefault(); void join(); }}>
          <label htmlFor="class-code" className="text-xs font-medium text-smoke">Have a class code from your teacher?</label>
          {userId ? <div className="mt-1.5 flex gap-2">
            <input id="class-code" className="input py-2 text-sm uppercase tracking-[0.2em]" placeholder="ABC123" maxLength={6} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())} />
            <button className="btn btn-outline btn-sm shrink-0" disabled={joinState.busy || code.length < 6}>{joinState.busy ? "Joining…" : "Join class"}</button>
          </div> : <p className="mt-1 text-sm text-smoke">Sign in with Google to join a class.</p>}
          {joinState.message && <p role={joinState.error ? "alert" : "status"} className="mt-1.5 text-sm">{joinState.message}</p>}
        </form>}
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

export { ProgressBox } from "./ProgressBox";
