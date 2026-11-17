"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasNoteText, noteHtml, textToHtml } from "./noteHtml";

/** A student's notes for one lesson, one entry per topic. GENERAL holds notes written before any topic existed. */
export type TopicNotes = Record<string, string>;
export const GENERAL_NOTES = "_lesson";
export type NotesStatus = "saved" | "saving" | "error";
/** Something the student saved from the board: the snipped text, a picture of it, or both. */
export interface NoteClip { id: string; topicId: string; text?: string; image?: string; label?: string; ts: number }

const MAX_CLIPS = 40;
const MAX_IMAGE = 400_000; // characters of data URL; larger pictures keep only their text

function read(key: string): TopicNotes {
  const raw = localStorage.getItem(key);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === "string")) as TopicNotes;
    }
  } catch { /* Older versions stored one plain-text note. */ }
  return { [GENERAL_NOTES]: raw };
}
function readClips(key: string): NoteClip[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((clip): clip is NoteClip => !!clip && typeof clip.id === "string" && typeof clip.topicId === "string") : [];
  } catch { return []; }
}

/** Notes save to this browser shortly after each change; `fallback` fills an empty notebook (e.g. notes synced from the account). */
export function useTopicNotes(key: string, fallback?: { notes?: TopicNotes; clips?: NoteClip[] }) {
  const clipKey = `${key}:clips`;
  const [notes, setNotes] = useState<TopicNotes>({});
  const [clips, setClips] = useState<NoteClip[]>([]);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<NotesStatus>("saved");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<TopicNotes>({});
  const latestClips = useRef<NoteClip[]>([]);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    try {
      const kept = Object.fromEntries(Object.entries(latest.current).filter(([, text]) => hasNoteText(text)));
      if (Object.keys(kept).length) localStorage.setItem(key, JSON.stringify(kept)); else localStorage.removeItem(key);
      setStatus("saved");
    } catch { setStatus("error"); }
  }, [key]);

  useEffect(() => {
    let loaded: TopicNotes = {};
    let loadedClips: NoteClip[] = [];
    try { loaded = read(key); loadedClips = readClips(clipKey); } catch { setStatus("error"); }
    if (!Object.values(loaded).some(hasNoteText) && !loadedClips.length && fallbackRef.current) {
      loaded = { ...fallbackRef.current.notes };
      loadedClips = [...(fallbackRef.current.clips ?? [])];
    }
    latest.current = loaded; latestClips.current = loadedClips;
    setNotes(loaded); setClips(loadedClips);
    setReady(true);
    return () => { if (timer.current) flush(); };
  }, [key, clipKey, flush]);

  const write = useCallback((next: TopicNotes) => {
    latest.current = next;
    setNotes(next);
    setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  }, [flush]);

  const update = useCallback((topic: string, text: string) => write({ ...latest.current, [topic]: text }), [write]);
  /** Adds plain text (a catch-up, an AI answer) after the topic's notes, keeping its line breaks and lists. */
  const append = useCallback((topic: string, text: string) => {
    const current = hasNoteText(latest.current[topic]) ? noteHtml(latest.current[topic]) : "";
    write({ ...latest.current, [topic]: `${current}${current ? "<div><br></div>" : ""}${textToHtml(text)}` });
  }, [write]);

  const writeClips = useCallback((next: NoteClip[]) => {
    latestClips.current = next;
    setClips(next);
    try {
      if (next.length) localStorage.setItem(clipKey, JSON.stringify(next)); else localStorage.removeItem(clipKey);
      setStatus("saved");
    } catch {
      // Browser storage is full: keep the text of every clip and drop the pictures.
      try { localStorage.setItem(clipKey, JSON.stringify(next.map(({ image: _image, ...clip }) => clip))); setStatus("saved"); }
      catch { setStatus("error"); }
    }
  }, [clipKey]);
  const addClip = useCallback((clip: Omit<NoteClip, "id" | "ts">) => {
    const image = clip.image && clip.image.length <= MAX_IMAGE ? clip.image : undefined;
    const text = clip.text?.trim() || undefined;
    if (!image && !text) return;
    writeClips([...latestClips.current, { ...clip, text, image, id: crypto.randomUUID(), ts: Date.now() }].slice(-MAX_CLIPS));
  }, [writeClips]);
  const removeClip = useCallback((id: string) => writeClips(latestClips.current.filter((clip) => clip.id !== id)), [writeClips]);

  useEffect(() => {
    const save = () => { if (timer.current) flush(); };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [flush]);

  return { notes, clips, ready, status, update, append, addClip, removeClip };
}
