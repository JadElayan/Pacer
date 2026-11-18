"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { boardRpc, type Notepad } from "@/lib/useBoardCollaboration";
import { AnimatedPanel } from "./AnimatedPanel";

type Draft = { id: string; body: string; x: number; y: number };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
const AVATAR_COLORS = ["#2454e8", "#0f9d74", "#c2410c", "#8b3fd9", "#b4235a", "#0b7285"];
const hue = (name: string) => AVATAR_COLORS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];

/**
 * Board sharing modeled on Zoom Whiteboard: a Share button at the top of the board with the
 * people who have added to it, and a popover where the teacher sets what students can do
 * (view only, or add sticky notes) and anyone allowed can add a sticky note to the board.
 */
export function BoardShare({ board, userId, teacher, allowed, notes, ended, connected, reduced, onAccessChange }: {
  board: string; userId: string; teacher: boolean; allowed: boolean; notes: Notepad[]; ended: boolean;
  connected?: number; reduced: boolean; onAccessChange: (allowed: boolean) => void;
}) {
  const key = `pacer:notepad-draft:${board}:${userId}`;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // The popover is placed against the window, under the button, so it never slides under the side panels.
  // It opens from the button: lined up with the button's left edge when the button is on the left of the window
  // (so it never covers the tool rail), otherwise with its right edge. A small arrow points back at the button.
  const [place, setPlace] = useState<{ top: number; left: number; width: number; arrow: number; origin: string }>();
  const compact = !teacher && !(!ended && allowed) && !notes.some((note) => note.mine);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = button.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(compact ? 280 : 352, window.innerWidth - 24);
      const fromLeft = r.left + r.width / 2 < window.innerWidth / 2;
      const left = Math.min(Math.max(12, fromLeft ? r.left : r.right - width), window.innerWidth - width - 12);
      const arrow = Math.min(width - 22, Math.max(22, r.left + r.width / 2 - left));
      setPlace({ top: r.bottom + 10, left, width, arrow, origin: `${arrow}px top` });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open, compact]);
  useEffect(() => {
    try { setDraft(JSON.parse(localStorage.getItem(key) ?? "null") ?? undefined); } catch { /* ignore */ }
  }, [key]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
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
      setStatus(remove ? "Sticky note removed." : "Added to the board.");
    } catch (error) {
      const message = (error as { message?: string }).message ?? "";
      setStatus(remove ? "Couldn't remove the sticky note. Try again."
        : /closed|belongs/.test(message) ? "Not added: the board is view only, or this note belongs to someone else. Your draft is kept."
        : /Invalid/.test(message) ? "Not added: sticky notes need 1 to 1,500 characters."
        : /no longer exists/.test(message) ? "Not added: the board needs an update. Run supabase/notepad_owner_post.sql, then try again. Your draft is kept."
        : "Not added. Check your connection and try again. Your draft is kept.");
    } finally { setBusy(false); }
  };
  const setAccess = async (value: boolean) => {
    if (value === allowed) return;
    setBusy(true); setStatus("");
    try { await boardRpc("pacer_set_contributions", { board, allowed: value }); onAccessChange(value); }
    catch { setStatus("Couldn't change who can edit. Try again."); }
    finally { setBusy(false); }
  };

  const mayPost = !ended && (teacher || allowed);
  const editable = mayPost ? notes.filter((note) => teacher || note.mine) : [];
  const authors = [...new Set(notes.filter((note) => !note.mine).map((note) => note.author))];
  const role = ended ? "Ended" : allowed ? "Can add notes" : "View only";
  const label = teacher ? "Share" : mayPost ? "Add sticky" : "View only";

  return <div ref={root} className="board-share">
    {authors.length > 0 && <div className="board-share-avatars" aria-label={`${authors.length} ${authors.length === 1 ? "person has" : "people have"} added notes`}>
      {authors.slice(0, 3).map((name) => <span key={name} title={name} style={{ backgroundColor: hue(name) }}>{initials(name)}</span>)}
      {authors.length > 3 && <span className="board-share-more">+{authors.length - 3}</span>}
    </div>}
    <button ref={button} type="button" className={`board-share-btn ${teacher ? "board-share-primary" : ""}`} aria-expanded={open} aria-haspopup="dialog"
      onClick={() => setOpen((value) => !value)}>
      {teacher ? <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5.5" r="2.5" /><path d="M1.5 13.5c.6-2.4 2.4-3.6 4.5-3.6s3.9 1.2 4.5 3.6M11 3.2a2.4 2.4 0 0 1 0 4.6M12.8 9.9c1 .5 1.6 1.6 1.9 3.1" /></svg>
        : <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M2.5 2.5h11v7l-4 4h-7z" /><path d="M9.5 13.5v-4h4" /></svg>}
      {label}
      {notes.length > 0 && <span className="board-share-count">{notes.length}</span>}
    </button>
    <AnimatedPanel open={open} reduced={reduced}>
      <div role="dialog" aria-label={teacher ? "Share this board" : "Class board sticky notes"} className="board-share-pop" data-compact={compact || undefined}
        style={place ? { top: place.top, left: place.left, width: place.width, maxHeight: `calc(100dvh - ${place.top + 12}px)`, transformOrigin: place.origin, ["--arrow" as string]: `${place.arrow}px` } : undefined}>
        {teacher && <>
          <p className="board-share-heading">Share this board</p>
          <p className="board-share-sub">{connected ?? 0} student{connected === 1 ? "" : "s"} connected · everyone in the room can see the board.</p>
          <div role="radiogroup" aria-label="What students can do" className="board-share-roles">
            {([[false, "View only", "Students watch the board."], [true, "Can add notes", "Students add sticky notes to the board."]] as const).map(([value, name, help]) => (
              <button key={name} type="button" role="radio" aria-checked={allowed === value && !ended} disabled={busy || ended}
                className="board-share-role" onClick={() => void setAccess(value)}>
                <span className="board-share-radio" aria-hidden="true" />
                <span><b>{name}</b><small>{help}</small></span>
              </button>
            ))}
          </div>
        </>}
        {!teacher && <div className="board-share-status">
          <span className="board-share-status-icon" data-state={ended ? "ended" : allowed ? "open" : "locked"} aria-hidden="true">
            {allowed && !ended ? <svg viewBox="0 0 16 16"><path d="M2.5 2.5h11v7l-4 4h-7z M9.5 13.5v-4h4" /></svg>
              : <svg viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>}
          </span>
          <span>
            <b className="board-share-heading">{ended ? "Lecture ended" : allowed ? "You can add sticky notes" : "View only"}</b>
            <span className="board-share-sub">{ended ? "The board is saved as it was." : allowed ? "Everyone in the class sees them." : "Your teacher hasn't turned on sticky notes. You can still annotate privately."}</span>
          </span>
        </div>}
        {editable.length > 0 && <ul className="board-share-notes">
          {editable.map((note) => <li key={note.id}>
            <span className="board-share-dot" style={{ backgroundColor: hue(note.author) }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm"><b className="font-medium">{note.mine ? "You" : note.author}</b>{note.body ? <span className="text-smoke"> · {note.body}</span> : null}</span>
            <button type="button" className="nb-link" disabled={busy || !!draft} onClick={() => keep(note)}>Edit</button>
            {teacher && <button type="button" className="nb-link notebook-danger" disabled={busy} onClick={() => void write(note, true)}>Remove</button>}
          </li>)}
        </ul>}
        {mayPost && !draft && <button type="button" className="btn btn-outline btn-sm board-share-add"
          onClick={() => keep({ id: crypto.randomUUID(), body: "", x: .08 + (notes.length % 3) * .27, y: .13 + Math.floor(notes.length / 3) * .2 })}>
          + Add a sticky note
        </button>}
        {draft && <form className="board-share-draft" onSubmit={(event) => {
          event.preventDefault();
          if (mayPost && draft.body.trim()) void write(draft);
        }}>
          <textarea autoFocus aria-label="Sticky note" placeholder={teacher ? "Write a note for the whole class…" : "Write something for the class board…"} rows={3} maxLength={1500}
            value={draft.body} onChange={(event) => keep({ ...draft, body: event.target.value })} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!mayPost && <p role="status" className="mr-auto text-xs text-smoke">The board is view only. This draft is saved in this browser.</p>}
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => keep(undefined)}>Discard</button>
            <button className="btn btn-primary btn-sm" disabled={!mayPost || busy || !draft.body.trim()}>Add to board</button>
          </div>
        </form>}
        {status && <p role="status" className="text-xs text-smoke">{status}</p>}
        {teacher && <p className="board-share-foot">Students: <b>{role}</b></p>}
      </div>
    </AnimatedPanel>
  </div>;
}
