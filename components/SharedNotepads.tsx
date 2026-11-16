"use client";

import { useEffect, useState } from "react";
import { boardRpc, type Notepad } from "@/lib/useBoardCollaboration";

type Draft = { id: string; body: string; x: number; y: number };
export function SharedNotepads({ board, userId, teacher, allowed, notes, ended, onAccessChange }: {
  board: string; userId: string; teacher: boolean; allowed: boolean; notes: Notepad[]; ended: boolean;
  onAccessChange: (allowed: boolean) => void;
}) {
  const key = `pacer:notepad-draft:${board}:${userId}`;
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    try { setDraft(JSON.parse(localStorage.getItem(key) ?? "null") ?? undefined); } catch { /* ignore */ }
  }, [key]);
  const keep = (next?: Draft) => {
    setDraft(next);
    try {
      if (next) localStorage.setItem(key, JSON.stringify(next)); else localStorage.removeItem(key);
    } catch { /* draft remains in memory */ }
  };
  const write = async (note: Draft, remove = false) => {
    setBusy(true); setStatus("");
    try {
      await boardRpc("pacer_write_notepad", { board, note: note.id, content: note.body, px: note.x, py: note.y, remove_note: remove });
      if (draft?.id === note.id) keep(undefined);
      setStatus(remove ? "Notepad removed." : "Notepad posted.");
    } catch { setStatus("Not posted. Check whether contributions are enabled and try again."); }
    finally { setBusy(false); }
  };
  const mayPost = !ended && (teacher || allowed);
  return <details className="rounded-xl border border-stone bg-eggshell px-3 py-2">
    <summary className="cursor-pointer text-sm font-medium">Shared notepads</summary>
    {teacher && <label className="mt-2 flex items-center gap-2 text-sm">
      <input type="checkbox" checked={allowed && !ended} disabled={busy || ended} onChange={async (event) => {
        const value = event.target.checked;
        setBusy(true); setStatus("");
        try { await boardRpc("pacer_set_contributions", { board, allowed: value }); onAccessChange(value); }
        catch { setStatus("Could not change contribution access."); }
        finally { setBusy(false); }
      }} /> Allow student notepad contributions
    </label>}
    <div className="mt-2 flex flex-wrap gap-2">
      {!teacher && mayPost && !draft && <button type="button" className="btn btn-outline btn-sm"
        onClick={() => keep({ id: crypto.randomUUID(), body: "", x: .08 + (notes.length % 3) * .27, y: .13 + Math.floor(notes.length / 3) * .2 })}>
        Add notepad
      </button>}
      {mayPost && notes.filter((note) => teacher || note.mine).map((note) => <div key={note.id} className="flex gap-1">
        <button type="button" className="btn btn-outline btn-sm" disabled={busy || !!draft} onClick={() => keep(note)}>Edit {note.author}’s notepad</button>
        {teacher && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void write(note, true)}>Remove</button>}
      </div>)}
    </div>
    {draft && <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(event) => {
      event.preventDefault();
      if (mayPost && draft.body.trim()) void write(draft);
    }}>
      <textarea aria-label="Shared notepad draft" className="input min-w-40 flex-1" rows={2} maxLength={1500}
        value={draft.body} onChange={(event) => keep({ ...draft, body: event.target.value })} />
      <button className="btn btn-primary btn-sm" disabled={!mayPost || busy || !draft.body.trim()}>Post</button>
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => keep(undefined)}>Discard draft</button>
      {!mayPost && <p role="status" className="w-full text-sm">Contributions are closed. This draft is saved in this browser and has not been posted.</p>}
    </form>}
    {status && <p role="status" className="mt-2 text-sm">{status}</p>}
  </details>;
}
