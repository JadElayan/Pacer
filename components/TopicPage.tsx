"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { askAI } from "@/lib/ai";
import { useRoom } from "@/lib/useRoom";
import { usePrefs } from "@/lib/usePrefs";
import { Logo } from "./Logo";
import { MathView } from "./MathView";
import { RichText } from "./RichText";
import { handwritingImage } from "./Whiteboard";
import { InkPath } from "./InkPath";
import { slideUrl } from "@/lib/slides";

export function TopicPage({ code, id }: { code: string; id: string }) {
  const teacher = useSearchParams().get("role") === "teacher";
  const { state, status } = useRoom(code, teacher);
  const { prefs } = usePrefs();
  const [deep, setDeep] = useState<{ text: string; source: string } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const back = `/room/${code}${teacher ? "?role=teacher" : ""}`;
  const topic = state?.topics.find((t) => t.id === id);
  const [image, setImage] = useState<string>();
  const ink = useMemo(() => {
    const ids = new Set(topic?.strokeIds ?? []);
    const strokes = [...(state?.archive ?? []).flatMap((entry) => entry.strokes), ...(state?.strokes ?? [])];
    return [...new Map(strokes.filter((stroke) => ids.has(stroke.id)).map((stroke) => [stroke.id, stroke])).values()];
  }, [state?.archive, state?.strokes, topic?.strokeIds]);
  useEffect(() => {
    setImage(handwritingImage(ink, 960, 960 / (topic?.inkAspect ?? 1.5)));
  }, [ink, topic?.inkAspect]);
  const deck = state?.slides;
  const slidePages = topic?.slides && deck && topic.slides.deck === deck.id
    ? topic.slides.pages.filter((n) => deck.pages[n]) : [];
  const blocks = [...(state?.archive ?? []).flatMap((a) => a.blocks), ...(state?.blocks ?? [])].filter((b) => b.topicId === id).filter((b, i, arr) => arr.findIndex((x) => x.id === b.id) === i);

  const aiOff = !teacher && (!!state?.aiPaused || (state?.aiAutoPause !== false && !!state?.question?.open));
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await askAI({ kind: "deeper", room: teacher ? undefined : code, selected: blocks.map((b) => b.content), context: [], image,
        topicTitle: topic?.title, topics: topic?.summary ? [{ title: topic.title, summary: topic.summary }] : undefined, mode: prefs.mode });
      setDeep({ text: r.text, source: r.source });
    }
    catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-6">
      <div className="flex items-center justify-between"><Logo height={24} /><Link className="btn btn-primary btn-sm" href={back}>Return to live</Link></div>
      {!topic ? <p className="mt-16 text-center text-smoke" role="status">{status === "notfound" ? "Topic not found." : "Loading topic…"}</p> : (
        <>
          <h1 className="display mt-10 text-[40px]">{topic.title}</h1>
          <p className="mt-3 text-lg text-smoke">{topic.summary}</p>
          {slidePages.length > 0 && deck && <>
            <h2 className="mt-8 text-sm font-medium">From the slides</h2>
            <div className="mt-2 grid gap-4">
              {slidePages.map((n) => {
                const page = deck.pages[n];
                return <figure key={n} className="overflow-hidden rounded-[20px] border border-stone bg-white">
                  <div className="relative" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
                    <img src={slideUrl(page)} alt={`Slide ${n}`} className="absolute inset-0 size-full object-contain" />
                    <svg aria-hidden="true" viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
                      {(deck.ink[n] ?? []).map((stroke) => <InkPath key={stroke.id} stroke={stroke} />)}
                    </svg>
                  </div>
                  <figcaption className="border-t border-stone px-4 py-2 text-sm text-smoke">{deck.name} · Slide {n}</figcaption>
                </figure>;
              })}
            </div>
          </>}
          {(blocks.length > 0 || image) && <h2 className="mt-8 text-sm font-medium">From the whiteboard</h2>}
          {!blocks.length && !image && !slidePages.length && <p className="mt-8 text-smoke">Nothing has been added to this topic yet.</p>}
          <ul className="mt-2 space-y-3">{blocks.map((b) => (
            <li key={b.id} className="rounded-[20px] border border-stone bg-taupe px-5 py-4">{b.kind === "equation" ? <div className="text-2xl"><MathView tex={b.content} /></div> : <p className="text-xl">{b.content}</p>}</li>))}</ul>
          {image && <img className="mt-3 max-w-full rounded-2xl border border-stone" src={image} alt="Handwritten notes for this topic" />}
          <div className="mt-8 rounded-[24px] border border-stone p-6">
            <h2 className="text-lg font-medium">Go deeper</h2>
            {deep ? (<><p className="mt-1 text-xs text-smoke">{deep.source === "demo" ? "Demo response (no AI key set)" : "Extra explanation from AI, not from your teacher"}</p><p className="mt-2 whitespace-pre-wrap"><RichText text={deep.text} /></p></>)
              : <p className="mt-1 text-sm text-smoke">Get a fuller explanation of this topic, with an example.</p>}
            {err && <p role="alert" className="mt-2 text-sm text-sky-deep">{err}</p>}
            {aiOff ? <p className="mt-4 text-sm text-smoke">Your teacher has paused AI help for now.</p>
              : <button className="btn btn-primary mt-4" disabled={busy} onClick={go}>{busy ? "Thinking…" : deep ? "Explain again" : "Explain deeper"}</button>}
          </div>
        </>
      )}
    </main>
  );
}
