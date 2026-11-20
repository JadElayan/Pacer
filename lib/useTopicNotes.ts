"use client";
import { appendCard as appendCard_ } from "./noteBlocks";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasNoteText, noteHtml, textToHtml } from "./noteHtml";
import { hasInk, isInkPage, type InkPage } from "./ink";

/** Handwriting, keyed by topic id (a topic's page) or `clip:<id>` (writing over a clip). */
export type NoteInk = Record<string, InkPage>;
export type NotebookSection = { id: string; title: string; reference?: string };
export const clipInkKey = (id: string) => `clip:${id}`;

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
function readInk(key: string): NoteInk {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}") as unknown;
    return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, page]) => isInkPage(page))) as NoteInk : {};
  } catch { return {}; }
}
function readClips(key: string): NoteClip[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((clip): clip is NoteClip => !!clip && typeof clip.id === "string" && typeof clip.topicId === "string") : [];
  } catch { return []; }
}

/** Notes save to this browser shortly after each change; `fallback` fills an empty notebook (e.g. notes synced from the account). */
export function useTopicNotes(key: string, fallback?: { notes?: TopicNotes; clips?: NoteClip[]; sections?: NotebookSection[] }) {
  const [sections, setSections] = useState<NotebookSection[] | undefined>();
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${key}:sections`);
      const value = raw ? JSON.parse(raw) : fallback?.sections;
      setSections(Array.isArray(value) ? value.filter((item) => typeof item?.id === "string" && typeof item?.title === "string") : undefined);
    } catch { setSections(fallback?.sections); }
  }, [key]);
  const updateSections = (next: NotebookSection[]) => {
    setSections(next);
    try { localStorage.setItem(`${key}:sections`, JSON.stringify(next)); }
    catch { setStatus("error"); }
  };
  const clipKey = `${key}:clips`;
  const inkKey = `${key}:ink`;
  const [ink, setInkState] = useState<NoteInk>({});
  const latestInk = useRef<NoteInk>({});
  const inkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
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
    try { loaded = read(key); loadedClips = readClips(clipKey); latestInk.current = readInk(inkKey); setInkState(latestInk.current); } catch { setStatus("error"); }
    if (!Object.values(loaded).some(hasNoteText) && !loadedClips.length && fallbackRef.current) {
      loaded = { ...fallbackRef.current.notes };
      loadedClips = [...(fallbackRef.current.clips ?? [])];
    }
    latest.current = loaded; latestClips.current = loadedClips;
    setNotes(loaded); setClips(loadedClips);
    setReady(true);
    return () => { if (timer.current) flush(); };
  }, [key, clipKey, inkKey, flush]);

  const flushInk = useCallback(() => {
    clearTimeout(inkTimer.current);
    inkTimer.current = undefined;
    try {
      // A page with only clip positions (no strokes yet) is kept too, so placed clips stay where they were put.
      const kept = Object.fromEntries(Object.entries(latestInk.current).filter(([, page]) => hasInk(page) || !!page.h || Object.keys(page.c ?? {}).length > 0));
      if (Object.keys(kept).length) localStorage.setItem(inkKey, JSON.stringify(kept)); else localStorage.removeItem(inkKey);
      setStatus("saved");
    } catch { setStatus("error"); }
  }, [inkKey]);
  /** Saves a page of handwriting (or removes it with `null`), shortly after the last stroke. */
  const setInk = useCallback((id: string, page: InkPage | null) => {
    const next = { ...latestInk.current };
    if (page) next[id] = page; else delete next[id];
    latestInk.current = next;
    setInkState(next);
    setStatus("saving");
    clearTimeout(inkTimer.current);
    inkTimer.current = setTimeout(flushInk, 500);
  }, [flushInk]);

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
  /** Adds a saved answer as its own card (label + text) the student can move, edit, collapse or turn into notes. */
  const appendCard = useCallback((topic: string, label: string, text: string) => {
    const current = hasNoteText(latest.current[topic]) ? noteHtml(latest.current[topic]) : "";
    write({ ...latest.current, [topic]: appendCard_(current, label, textToHtml(text)) });
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
  const removeClip = useCallback((id: string) => {
    writeClips(latestClips.current.filter((clip) => clip.id !== id));
    if (latestInk.current[clipInkKey(id)]) setInk(clipInkKey(id), null);
  }, [writeClips, setInk]);

  useEffect(() => {
    const save = () => { if (timer.current) flush(); if (inkTimer.current) flushInk(); };
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [flush, flushInk]);
  useEffect(() => () => { if (inkTimer.current) flushInk(); }, [flushInk]);

  return { notes, clips, ink, sections, updateSections, ready, status, update, append, appendCard, addClip, removeClip, setInk };
}
