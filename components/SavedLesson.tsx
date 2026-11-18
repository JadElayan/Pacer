"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadLessons, mergeLessons, pullLessons, type Lesson } from "@/lib/lessons";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { restoreSlide } from "@/lib/teacherStorage";
import { slideUrl } from "@/lib/slides";
import type { Block, RoomState } from "@/lib/types";
import { Classroom } from "./Classroom";
import { ChoiceMenu } from "./ChoiceMenu";
import { GuidedReview } from "./GuidedReview";
import { guideSteps } from "@/lib/guide";
import { lessonName } from "@/lib/lessonList";
import { usePrefs } from "@/lib/usePrefs";

export function SavedLesson({ code }: { code: string }) {
  const { ready, user } = useAuth();
  const userId = user?.id;
  const scope = `${code}:${userId ?? "guest"}`;
  const [loaded, setLoaded] = useState<{ scope: string; lesson?: Lesson }>();
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void (async () => {
      const local = loadLessons(userId).filter((lesson) => lesson.code === code);
      const remote = userId && !local.length ? await pullLessons(userId).catch(() => []) : [];
      let lesson: Lesson | undefined = mergeLessons(local, remote.filter((item) => item.code === code))[0];
      if (lesson?.removed) lesson = undefined;
      if (lesson && !lesson.collaborationId && userId) {
        // Older lesson records predate the board ID. Recover it through the member-only lookup.
        const result = await getSupabase()?.rpc("pacer_load_member_board", { room_code: code });
        let room = result?.data as RoomState | undefined;
        if (!room) {
          try {
            const cached = JSON.parse(localStorage.getItem(`pacer:cache:${code}`) ?? "null") as RoomState | null;
            if (cached?.title === lesson.title) room = cached;
          } catch { /* The lesson can still be annotated on this device. */ }
        }
        if (room?.code === code && room.collaborationId) lesson = { ...lesson, collaborationId: room.collaborationId };
      }
      if (active) setLoaded({ scope, lesson });
    })().catch(() => {
      if (active) setLoaded({ scope, lesson: loadLessons(userId).find((lesson) => lesson.code === code) });
    });
    return () => { active = false; };
  }, [code, ready, scope, userId]);

  if (!ready || loaded?.scope !== scope) return <main className="p-6 text-center" role="status">Opening saved lesson…</main>;
  if (!loaded.lesson) return <main className="mx-auto max-w-lg space-y-4 p-6 text-center">
    <h1 className="display text-3xl">Saved lesson unavailable</h1>
    <p className="text-smoke">Open the lesson from the account or browser where it was saved.</p>
    <Link href="/" className="btn btn-primary">Back to learning</Link>
  </main>;
  return <LessonReview key={scope} lesson={loaded.lesson} userId={userId} />;
}

function LessonReview({ lesson, userId }: { lesson: Lesson; userId?: string }) {
  const boards = lesson.boards ?? [];
  const deck = lesson.slides;
  const slideNumbers = Object.keys(deck?.pages ?? {}).map(Number).sort((a, b) => a - b);
  const primaryBoard = boards.find((board) => board.id === `${lesson.code}-live`) ?? boards.at(-1);
  const options = [
    ...boards.map((item, index) => ({ value: `board:${item.id}`, label: `Saved board ${index + 1}` })),
    ...slideNumbers.map((value) => ({ value: `slide:${value}`, label: `Slide ${value}` })),
    ...((lesson.topics.length || !boards.length && !slideNumbers.length) ? [{ value: "notes", label: "Lesson notes" }] : []),
  ];
  const [selection, setSelection] = useState(() => {
    const page = new URLSearchParams(window.location.search).get("page");
    if (page && options.some((item) => item.value === page)) return page;
    return primaryBoard ? `board:${primaryBoard.id}` : options[0].value;
  });
  const selectPage = (page: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", page);
    window.history.replaceState(null, "", url);
    setSelection(page);
  };
  const board = boards.find((item) => `board:${item.id}` === selection);
  const number = selection.startsWith("slide:") ? Number(selection.slice(6)) : 0;
  const slide = deck?.pages[number];
  const [cachedSlide, setCachedSlide] = useState<{ id: string; src: string }>();
  useEffect(() => {
    if (!deck || !slide || !userId) return;
    let active = true;
    let src: string | undefined;
    void restoreSlide(userId, deck.id, slide).then(({ image }) => {
      if (!active) return;
      src = URL.createObjectURL(image);
      setCachedSlide({ id: slide.id, src });
    }).catch(() => {});
    return () => {
      active = false;
      if (src) URL.revokeObjectURL(src);
      setCachedSlide((current) => current?.id === slide.id ? undefined : current);
    };
  }, [deck, slide, userId]);
  const topics = lesson.topics.map((topic, index) => ({
    id: topic.id ?? `topic-${index}`, title: topic.title, summary: topic.summary, ts: lesson.ts, auto: false,
  }));
  const blocks: Block[] = board
    ? board.blocks.map((block, order) => ({ ...block, order, ts: board.ts }))
    : selection === "notes" ? lesson.topics.flatMap((topic, index) =>
      topic.notes.map((content, order): Block => ({
        id: `saved-${index}-${order}`, kind: "text", topicId: topics[index].id, content, order, ts: lesson.ts,
      }))) : [];
  const state: RoomState = {
    code: lesson.code, title: lesson.title, subject: lesson.subject, ended: true, rev: 0, collaborationId: lesson.collaborationId,
    topics, blocks, strokes: board?.strokes ?? [], currentTopicId: topics.at(-1)?.id ?? null,
    slides: slide && deck ? { ...deck, current: number } : undefined, showSlides: !!slide,
  };
  const selected = options.findIndex((item) => item.value === selection);
  // Guided review: on by default, turned off with Guided review in Settings. "Hide guide" closes it for this visit.
  const { prefs } = usePrefs();
  const [guideClosed, setGuideClosed] = useState(false);
  const steps = useMemo(() => guideSteps(lesson, slideNumbers, options.some((o) => o.value === "notes") ? "notes" : primaryBoard ? `board:${primaryBoard.id}` : undefined),
    [lesson]); // eslint-disable-line react-hooks/exhaustive-deps
  const guideOpen = prefs.guide && !guideClosed && steps.length > 0;
  return <Classroom code={lesson.code} review={{
    state,
    surface: board && board !== primaryBoard ? `archive:${board.id}` : selection === "notes" && primaryBoard ? "notes" : undefined,
    slideSrc: slide && (cachedSlide?.id === slide.id ? cachedSlide.src : slideUrl(slide)),
    controls: <div className="flex flex-wrap items-center gap-2">
      <Link href="/" className="btn btn-sm btn-outline">Your lessons</Link>
      <div role="group" aria-label="Saved lesson navigation" className="flex max-w-full items-center gap-1">
        <button type="button" className="btn btn-sm btn-outline" aria-label="Previous page" disabled={selected <= 0}
          onClick={() => selectPage(options[selected - 1].value)}>‹</button>
        <ChoiceMenu label="Saved lesson page" value={selection} onChange={selectPage}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </ChoiceMenu>
        <button type="button" className="btn btn-sm btn-outline" aria-label="Next page" disabled={selected >= options.length - 1}
          onClick={() => selectPage(options[selected + 1].value)}>›</button>
      </div>
      {prefs.guide && guideClosed && steps.length > 0 && <button type="button" className="btn btn-sm btn-outline" onClick={() => setGuideClosed(false)}>Guided review</button>}
      {guideOpen && <GuidedReview code={lesson.code} lessonTitle={lessonName(lesson)} steps={steps} userId={userId}
        onGo={(page) => { if (options.some((o) => o.value === page)) selectPage(page); }} onClose={() => setGuideClosed(true)} />}
      {lesson.topics.length > 0 && <details className="w-full rounded-xl border border-stone bg-eggshell px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Topic summaries</summary>
        <ul className="mt-2 space-y-2">{lesson.topics.map((topic, index) => <li key={index}>
          <p className="font-medium">{topic.title}</p>
          <p>{topic.summary}</p>
        </li>)}</ul>
      </details>}
    </div>,
  }} />;
}
