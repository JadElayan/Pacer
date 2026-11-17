"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Topic } from "@/lib/types";

/** A single row of topic chips that always sits at the top of the teacher's board. */
export function TopicStrip({ topics, currentId, hrefFor, canEdit, onEdit }: {
  topics: Topic[]; currentId: string | null; hrefFor: (id: string) => string; canEdit: boolean;
  onEdit: (id: string, p: { title: string; summary: string }) => void;
}) {
  const strip = useRef<HTMLOListElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [topics.length]);
  const save = (topic: Topic) => {
    const next = title.trim();
    if (next && next !== topic.title) onEdit(topic.id, { title: next, summary: topic.summary });
    setEditing(null);
  };

  return (
    <nav aria-label="Lecture topics" className="topic-strip">
      <span className="topic-strip-label">Topics</span>
      <ol ref={strip} className="topic-strip-list">
        {topics.length === 0 && <li className="topic-chip topic-chip-empty">Starting…</li>}
        {topics.map((topic, index) => {
          const live = topic.id === currentId;
          return (
            <li key={topic.id} className="topic-chip pop-in" data-live={live || undefined}>
              <span className="topic-chip-num" aria-hidden="true">{index + 1}</span>
              {editing === topic.id ? (
                <form onSubmit={(event) => { event.preventDefault(); save(topic); }}>
                  <input autoFocus aria-label="Topic title" className="topic-chip-input" value={title}
                    onChange={(event) => setTitle(event.target.value)} onBlur={() => save(topic)}
                    onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }} />
                </form>
              ) : (
                <>
                  <Link href={hrefFor(topic.id)} className="topic-chip-link" title={topic.summary || topic.title}
                    aria-current={live ? "step" : undefined}>
                    {topic.title}
                  </Link>
                  {live && <span className="topic-chip-live">Live</span>}
                  {canEdit && <button type="button" className="topic-chip-edit" aria-label={`Rename ${topic.title}`}
                    onClick={() => { setEditing(topic.id); setTitle(topic.title); }}>
                    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.5 2.5l3 3L6 13H3v-3z" />
                    </svg>
                  </button>}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
