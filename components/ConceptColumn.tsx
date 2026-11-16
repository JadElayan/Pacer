"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Topic } from "@/lib/types";

export function ConceptColumn({ topics, currentId, hrefFor, canEdit, onEdit }: {
  topics: Topic[]; currentId: string | null; hrefFor: (id: string) => string; canEdit: boolean;
  onEdit: (id: string, p: { title: string; summary: string }) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [t, setT] = useState(""); const [s, setS] = useState("");
  useEffect(() => {
    const strip = end.current?.parentElement;
    if (strip) strip.scrollLeft = strip.scrollWidth;
  }, [topics.length]);

  return (
    <nav aria-label="Lecture topics" className="flex gap-3 overflow-x-auto pb-2">
      {topics.length === 0 && (
        <div className="card rounded-[20px] bg-taupe p-4 text-sm text-smoke max-md:min-w-[220px]">Topics appear here as your teacher covers new ideas.</div>
      )}
      {topics.map((tp) => {
        const live = tp.id === currentId;
        return (
          <div key={tp.id} className={`card pop-in relative w-[min(240px,75vw)] shrink-0 rounded-xl bg-taupe px-3 py-2 ${live ? "border border-sky shadow-[0_0_0_3px_var(--color-sky-soft)]" : "border border-transparent"}`}>
            {editing === tp.id ? (
              <div className="space-y-2">
                <input className="input !min-h-10" aria-label="Topic title" value={t} onChange={(e) => setT(e.target.value)} />
                <textarea className="input !py-2" rows={3} aria-label="Topic summary" value={s} onChange={(e) => setS(e.target.value)} />
                <div className="flex gap-2">
                  <button className="btn btn-dark btn-sm" onClick={() => { onEdit(tp.id, { title: t, summary: s }); setEditing(null); }}>Save</button>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {live && <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-sky px-2 py-0.5 text-xs font-medium"><span aria-hidden>●</span> Live now</span>}
                <Link href={hrefFor(tp.id)} className="block rounded-lg focus-visible:outline-offset-4">
                  <h3 className="text-[15px] font-medium leading-snug">{tp.title}</h3>
                  <p className="mt-1 text-sm text-smoke">{tp.summary || "Summarizing…"}</p>
                </Link>
                {canEdit && <button className="mt-2 text-xs text-sky-deep underline underline-offset-2" onClick={() => { setEditing(tp.id); setT(tp.title); setS(tp.summary); }}>Edit</button>}
              </>
            )}
          </div>
        );
      })}
      <div ref={end} />
    </nav>
  );
}
