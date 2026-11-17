"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Topic } from "@/lib/types";

/** A row of topic cards (title and a short description) that always sits at the top of the teacher's board. */
export function TopicStrip({ topics, currentId, hrefFor, canEdit, describe, onEdit }: {
  topics: Topic[]; currentId: string | null; hrefFor: (id: string) => string; canEdit: boolean;
  describe: (topic: Topic) => string;
  onEdit: (id: string, p: { title: string; summary: string }) => void;
}) {
  const strip = useRef<HTMLOListElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  // Fade the row's edges only on the sides that have more cards scrolled out of view.
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = () => {
    const el = strip.current;
    if (!el) return;
    const next = { start: el.scrollLeft > 2, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 };
    setEdges((prev) => prev.start === next.start && prev.end === next.end ? prev : next);
  };
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, [topics.length]);
  const save = (topic: Topic) => {
    const nextTitle = title.trim() || topic.title;
    const nextSummary = summary.trim();
    if (nextTitle !== topic.title || nextSummary !== topic.summary) onEdit(topic.id, { title: nextTitle, summary: nextSummary });
    setEditing(null);
  };

  return (
    <nav aria-label="Lecture topics" className="topic-strip">
      <span className="topic-strip-label">Topics</span>
      <ol ref={strip} className="topic-strip-list" data-fade-start={edges.start || undefined} data-fade-end={edges.end || undefined}
        onScroll={measure} onWheel={(event) => {
          // A mouse wheel scrolls the row sideways.
          const el = event.currentTarget;
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && el.scrollWidth > el.clientWidth) el.scrollLeft += event.deltaY;
        }}>
        {topics.length === 0 && <li className="topic-card topic-card-empty">Starting…</li>}
        {topics.map((topic, index) => {
          const live = topic.id === currentId;
          const description = describe(topic);
          return (
            <li key={topic.id} className="topic-card pop-in" data-live={live || undefined} data-editing={editing === topic.id || undefined}>
              <span className="topic-card-num" aria-hidden="true">{index + 1}</span>
              {editing === topic.id ? (
                <form className="topic-card-form" onSubmit={(event) => { event.preventDefault(); save(topic); }}
                  onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) save(topic); }}
                  onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }}>
                  <input autoFocus aria-label="Topic title" className="topic-card-input" value={title} maxLength={60}
                    onChange={(event) => setTitle(event.target.value)} />
                  <input aria-label="Topic description" className="topic-card-input topic-card-input-sub" value={summary} maxLength={160}
                    placeholder="Short description" onChange={(event) => setSummary(event.target.value)} />
                  <button type="submit" className="sr-only">Save topic</button>
                </form>
              ) : (
                <>
                  <Link href={hrefFor(topic.id)} className="topic-card-link" aria-current={live ? "step" : undefined}
                    title={`${topic.title}${description ? ` — ${description}` : ""}`}>
                    <span className="topic-card-title">
                      <span className="truncate">{topic.title}</span>
                      {live && <span className="topic-card-live">Live</span>}
                    </span>
                    <span className="topic-card-desc" data-placeholder={!topic.summary || undefined}>{description}</span>
                  </Link>
                  {canEdit && <button type="button" className="topic-card-edit" aria-label={`Edit ${topic.title}`}
                    onClick={() => { setEditing(topic.id); setTitle(topic.title); setSummary(topic.summary); }}>
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
