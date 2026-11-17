"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "./supabase";
import type { Block, Stroke } from "./types";

export type Notepad = { id: string; author: string; mine: boolean; body: string; x: number; y: number };
export type Annotations = { blocks: Block[]; strokes: Stroke[] };
const empty: Annotations = { blocks: [], strokes: [] };
type Cache = { data: Annotations; pending: boolean };
type Scope = { board: string; userId: string };

export async function boardRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await getSupabase()?.rpc(name, args);
  if (!result || result.error) throw result?.error ?? new Error("Account storage unavailable.");
  return result.data as T;
}

export function useBoardCollaboration(board: string | undefined, code: string, userId: string | undefined, teacher: boolean) {
  const scope = board ? `${board}:${userId ?? "guest"}:${teacher}` : "";
  const [result, setResult] = useState<{ scope: string; allowed: boolean; notes: Notepad[] }>();
  const [failure, setFailure] = useState<{ scope: string; message: string }>();
  useEffect(() => {
    if (!scope) return;
    let closed = false;
    let busy = false;
    let registered = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        if (userId && teacher && !registered) {
          await boardRpc("pacer_open_board", { board, room_code: code });
          registered = true;
        }
        const read = () => boardRpc<{ allowed: boolean; notes: Notepad[] } | null>(
          userId ? "pacer_board_notepads" : "pacer_view_guest_notepads", userId ? { board } : { board, room_code: code },
        );
        const data = await read().catch(async (error: { message?: string }) => {
          if (!userId || teacher || error.message !== "Board membership required") throw error;
          await boardRpc("pacer_join_board", { board, room_code: code });
          return read();
        });
        if (closed) return;
        if (data) setResult({ scope, ...data });
        setFailure(undefined);
      } catch (error) {
        if (closed) return;
        const problem = error as { code?: string; message?: string };
        if (problem.message === "Board invitation unavailable") return;
        const message = problem.code === "PGRST202" || problem.code === "42883"
          ? "Shared notepads are offline. The Supabase project needs the board collaboration migration."
          : problem.message === "Only the board owner can host"
            ? "Sign in with the account that started this board to manage shared notepads."
            : "Couldn’t load shared notepads. Retrying…";
        setFailure({ scope, message });
      } finally { busy = false; }
    };
    void refresh();
    const interval = window.setInterval(refresh, 1500);
    return () => { closed = true; window.clearInterval(interval); };
  }, [scope, board, code, teacher, userId]);
  const current = result?.scope === scope ? result : undefined;
  return { ready: !!current, allowed: !!current?.allowed, notes: current?.notes ?? [], error: failure?.scope === scope ? failure.message : "" };
}

export function usePrivateAnnotations(board: string | undefined, userId: string | undefined, enabled: boolean, localLesson?: string) {
  const cloud = !!(board && userId);
  const key = !enabled ? "" : cloud ? `pacer:annotations:${board}:${userId}`
    : localLesson ? `pacer:lesson-annotations:${localLesson}:${userId ?? "guest"}` : "";
  const [loaded, setLoaded] = useState<{ key: string; cache: Cache }>();
  const [status, setStatus] = useState<"Loading" | "Saving" | "Saved" | "Retry">("Loading");
  const [retry, setRetry] = useState(0);
  const [history, setHistory] = useState<{ key: string; undo: Annotations[]; redo: Annotations[] }>({ key: "", undo: [], redo: [] });
  const latest = useRef(loaded);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const cache = loaded?.key === key ? loaded.cache : undefined;
  const scope: Scope | undefined = key && board && userId ? { board, userId } : undefined;
  const set = (data: Annotations, pending: boolean) => {
    const entry = { key, cache: { data, pending: cloud && pending } };
    latest.current = entry;
    setLoaded(entry);
    try {
      localStorage.setItem(key, JSON.stringify(entry.cache));
      if (!cloud) setStatus("Saved");
    } catch { if (!cloud) setStatus("Retry"); }
  };
  useEffect(() => {
    if (!key) return;
    let closed = false;
    setStatus("Loading");
    let local: Cache | undefined;
    try { local = JSON.parse(localStorage.getItem(key) ?? "null") ?? undefined; } catch { /* ignore */ }
    if (!board || !userId) { set(local?.data ?? empty, false); return; }
    if (local?.pending) { set(local.data, true); return; }
    void (async () => {
      const result = await getSupabase()?.from("pacer_annotations").select("data").eq("board_id", board).eq("user_id", userId).maybeSingle();
      if (closed) return;
      if (!result || result.error) {
        if (local) set(local.data, false);
        setStatus("Retry");
      } else { set((result.data?.data as Annotations | undefined) ?? empty, false); setStatus("Saved"); }
    })();
    return () => { closed = true; };
    // Retry pending saves through the write effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, board, userId, enabled, retry]);
  useEffect(() => {
    if (!scope || !cache?.pending) return;
    const { board, userId } = scope;
    setStatus("Saving");
    const timer = window.setTimeout(() => {
      queue.current = queue.current.catch(() => undefined).then(async () => {
        if (latest.current?.key !== key || latest.current.cache !== cache) return;
        const result = await getSupabase()?.from("pacer_annotations").upsert({ board_id: board, user_id: userId, data: cache.data });
        if (latest.current?.key !== key || latest.current.cache !== cache) return;
        if (!result || result.error) { setStatus("Retry"); return; }
        set(cache.data, false);
        setStatus("Saved");
      });
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cache, retry]);
  const update = (fn: (data: Annotations) => Annotations, record = true) => {
    const current = latest.current;
    if (!key || !current || current.key !== key) return;
    const next = fn(current.cache.data);
    if (next === current.cache.data) return;
    if (record) setHistory((old) => ({ key, undo: [...(old.key === key ? old.undo.slice(-39) : []), current.cache.data], redo: [] }));
    set(next, true);
  };
  const restore = (direction: "undo" | "redo") => {
    const current = latest.current;
    const previous = history.key === key && history[direction].at(-1);
    if (!previous || current?.key !== key) return;
    const opposite = direction === "undo" ? "redo" : "undo";
    setHistory({ ...history, [direction]: history[direction].slice(0, -1), [opposite]: [...history[opposite], current.cache.data] });
    set(previous, true);
  };
  return { data: cache?.data ?? empty, ready: !!cache, status, update, restore,
    canRestore: (direction: "undo" | "redo") => history.key === key && history[direction].length > 0,
    retry: () => { if (!cloud && cache) set(cache.data, false); else setRetry((value) => value + 1); } };
}
