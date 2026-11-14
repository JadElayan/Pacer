"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { askAI } from "@/lib/ai";
import { useRoom } from "@/lib/useRoom";
import { usePrefs } from "@/lib/usePrefs";
import { Logo } from "./Logo";
import { MathView } from "./MathView";
import { RichText } from "./RichText";

export function TopicPage({ code, id }: { code: string; id: string }) {
  const teacher = useSearchParams().get("role") === "teacher";
  const { state, status } = useRoom(code, teacher);
  const { prefs } = usePrefs();
  const [deep, setDeep] = useState<{ text: string; source: string } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const back = `/room/${code}${teacher ? "?role=teacher" : ""}`;
  const topic = state?.topics.find((t) => t.id === id);
  const blocks = state?.blocks.filter((b) => b.topicId === id) ?? [];

  const go = async () => {
    setBusy(true); setErr("");
    try { const r = await askAI({ kind: "deeper", selected: blocks.map((b) => b.content), context: state?.blocks.map((b) => b.content) ?? [], topicTitle: topic?.title, mode: prefs.mode }); setDeep({ text: r.text, source: r.source }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-6">
      <div className="flex items-center justify-between"><Logo height={24} /><Link className="btn btn-primary btn-sm" href={back}>Return to live</Link></div>
      {!topic ? <p className="mt-16 text-center text-smoke" role="status">{status === "notfound" ? "Topic not found." : "Loading topic…"}</p> : (
        <>
          <h1 className="display mt-10 text-[40px]">{topic.title}</h1>
          <p className="mt-3 text-lg text-smoke">{topic.summary}</p>
          <h2 className="mt-8 text-sm font-medium">From the whiteboard</h2>
          <ul className="mt-2 space-y-3">{blocks.map((b) => (
            <li key={b.id} className="rounded-[20px] border border-stone bg-taupe px-5 py-4">{b.kind === "equation" ? <div className="text-2xl"><MathView tex={b.content} /></div> : <p className="text-xl">{b.content}</p>}</li>))}</ul>
          <div className="mt-8 rounded-[24px] border border-stone p-6">
            <h2 className="text-lg font-medium">Go deeper</h2>
            {deep ? (<><p className="mt-1 text-xs text-smoke">{deep.source === "demo" ? "Demo response (no AI key set)" : "Extra explanation from AI, not from your teacher"}</p><p className="mt-2 whitespace-pre-wrap"><RichText text={deep.text} /></p></>)
              : <p className="mt-1 text-sm text-smoke">Get a fuller explanation of this topic, with an example.</p>}
            {err && <p role="alert" className="mt-2 text-sm text-sky-deep">{err}</p>}
            <button className="btn btn-primary mt-4" disabled={busy} onClick={go}>{busy ? "Thinking…" : deep ? "Explain again" : "Explain deeper"}</button>
          </div>
        </>
      )}
    </main>
  );
}
