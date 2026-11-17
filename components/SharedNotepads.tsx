"use client";

import { useEffect, useState } from "react";
import { boardRpc, type Notepad } from "@/lib/useBoardCollaboration";
import { Drawer } from "./Drawer";

type Draft = { id: string; body: string; x: number; y: number };
export function SharedNotepads({ board, userId, teacher, allowed, notes, ended, onAccessChange, title = "Shared notepads" }: {
  board: string; userId: string; teacher: boolean; allowed: boolean; notes: Notepad[]; ended: boolean; title?: string;
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
    } catch (error) {
      // Say what actually went wrong instead of one catch-all message.
      const message = (error as { message?: string }).message ?? "";
      setStatus(remove ? "Couldn't remove the notepad. Try again."
        : /closed|belongs/.test(message) ? "Not posted: student posting is closed, or this notepad belongs to someone else. Your draft is kept."
        : /Invalid/.test(message) ? "Not posted: notepads need 1 to 1,500 characters."
        : /no longer exists/.test(message) ? "Not posted: the board needs an update. Run supabase/notepad_owner_post.sql, then try again. Your draft is kept."
        : "Not posted. Check your connection and try again. Your draft is kept.");
    }
    finally { setBusy(false); }
  };
  const mayPost = !ended && (teacher || allowed);
  const editable = mayPost ? notes.filter((note) => teacher || note.mine) : [];
  const hint = ended ? "Lecture ended" : teacher ? (allowed ? "Students can post" : "Students can't post") : allowed ? "Post a note on the board" : "Closed by your teacher";
  return <Drawer title={title} badge={notes.length || undefined} hint={hint}>
    <div className="grid gap-3">
      {teacher && <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-taupe/60 px-3 py-2 text-sm">
        <span>Let students post notepads on the board</span>
        <input type="checkbox" className="size-5 accent-[#2454e8]" checked={allowed && !ended} disabled={busy || ended} onChange={async (event) => {
          const value = event.target.checked;
          setBusy(true); setStatus("");
          try { await boardRpc("pacer_set_contributions", { board, allowed: value }); onAccessChange(value); }
          catch { setStatus("Could not change contribution access."); }
          finally { setBusy(false); }
        }} />
      </label>}
      {!teacher && !mayPost && !draft && <p className="text-sm text-smoke">{ended ? "This lecture has ended." : "Your teacher hasn't opened notepads yet."}</p>}
      {editable.length > 0 && <ul className="grid gap-1.5">
        {editable.map((note) => <li key={note.id} className="flex items-center gap-2 rounded-xl border border-stone px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-sm"><b className="font-medium">{note.mine ? "You" : note.author}</b>{note.body ? <span className="text-smoke"> · {note.body}</span> : null}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy || !!draft} onClick={() => keep(note)}>Edit</button>
          {teacher && <button type="button" className="btn btn-outline btn-sm notebook-danger" disabled={busy} onClick={() => void write(note, true)}>Remove</button>}
        </li>)}
      </ul>}
      {mayPost && !draft && <button type="button" className="btn btn-outline btn-sm justify-self-start"
        onClick={() => keep({ id: crypto.randomUUID(), body: "", x: .08 + (notes.length % 3) * .27, y: .13 + Math.floor(notes.length / 3) * .2 })}>
        + Add notepad
      </button>}
      {draft && <form className="grid gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (mayPost && draft.body.trim()) void write(draft);
      }}>
        <textarea autoFocus aria-label="Shared notepad draft" placeholder={teacher ? "Write a note for the whole class…" : "Write something for the class board…"} className="input min-h-20 w-full resize-y py-3 leading-relaxed" rows={3} maxLength={1500}
          value={draft.body} onChange={(event) => keep({ ...draft, body: event.target.value })} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!mayPost && <p role="status" className="mr-auto text-xs text-smoke">Contributions are closed. This draft is saved in this browser.</p>}
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => keep(undefined)}>Discard</button>
          <button className="btn btn-primary btn-sm" disabled={!mayPost || busy || !draft.body.trim()}>Post to board</button>
        </div>
      </form>}
      {status && <p role="status" className="text-xs text-smoke">{status}</p>}
    </div>
  </Drawer>;
}
