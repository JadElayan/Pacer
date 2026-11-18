"use client";
import { useState } from "react";
import { createClass, deleteClass, joinLink, type PacerClass } from "@/lib/classes";
import { LiquidSwatches } from "./LiquidSwatches";
import { Collapse } from "./Motion";

const CLASS_COLORS = [["Blue", "#2454e8"], ["Purple", "#7f5bd6"], ["Green", "#1d9e75"], ["Red", "#d0453b"], ["Orange", "#e08a1e"], ["Teal", "#0e8fa3"]] as const;

/** Teaching dashboard: the teacher's classes, with join codes to share and a Start class button for each. */
export function TeacherClasses({ userId, teacherName, classes, error, starting, onChange, onStart }: {
  userId?: string; teacherName?: string; classes: PacerClass[]; error: string; starting: boolean;
  onChange: (classes: PacerClass[]) => void; onStart: (cls: PacerClass) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [color, setColor] = useState<string>(CLASS_COLORS[0][1]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<string>();
  const [confirming, setConfirming] = useState<string>();

  if (!userId) return <section aria-label="Your classes" className="rounded-[24px] border border-stone bg-eggshell p-5 shadow-[var(--shadow-whisper)]">
    <h2 className="display text-2xl">Your classes</h2>
    <p className="mt-1 text-sm text-smoke">Sign in with Google to create classes. Students join once with a code, and their lessons stay grouped by class.</p>
  </section>;

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true); setMessage("");
    try {
      const created = await createClass(userId, { name, subject, color, teacherName });
      onChange([created, ...classes]);
      setName(""); setSubject(""); setAdding(false);
      setMessage(`Created ${created.name}. Share code ${created.join_code} with your students.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Couldn't create the class."); }
    finally { setBusy(false); }
  };
  const copy = async (c: PacerClass) => {
    try { await navigator.clipboard.writeText(joinLink(c.join_code!)); setCopied(c.id); setTimeout(() => setCopied(undefined), 1600); } catch { /* clipboard blocked */ }
  };
  const remove = async (c: PacerClass) => {
    setConfirming(undefined);
    try { await deleteClass(c.id); onChange(classes.filter((x) => x.id !== c.id)); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Couldn't delete the class."); }
  };

  return <section aria-label="Your classes" className="rounded-[24px] border border-stone bg-eggshell p-5 shadow-[var(--shadow-whisper)]">
    <div className="flex items-center gap-3">
      <h2 className="display text-2xl">Your classes</h2>
      <button type="button" className="btn btn-outline btn-sm ml-auto" aria-expanded={adding} onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "New class"}</button>
    </div>
    {error && <p role="status" className="mt-2 text-sm text-smoke">{error}</p>}
    <Collapse open={adding}>
      <form className="mt-3 grid gap-3 rounded-2xl bg-taupe p-3" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <label className="text-sm font-medium">Class name
          <input className="input mt-1" placeholder="Stats 101 · Period 3" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm font-medium">Subject <span className="text-smoke">(optional)</span>
          <input className="input mt-1" placeholder="Statistics" maxLength={80} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <div className="flex items-center gap-3 text-sm font-medium">Color <LiquidSwatches label="Class color" colors={CLASS_COLORS} value={color} dot={18} onChange={setColor} /></div>
        <button className="btn btn-primary btn-sm w-fit" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create class"}</button>
      </form>
    </Collapse>
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
    {!classes.length && !error && <p className="mt-2 text-sm text-smoke">Create a class to get a code your students use once. Their lessons from it stay together.</p>}
    <ul className="mt-3 grid gap-2">
      {classes.map((c) => <li key={c.id} className="class-card rounded-2xl border border-stone p-3" style={c.color ? { ["--class" as string]: c.color } : undefined}>
        <div className="flex items-center gap-3">
          <span aria-hidden className="class-dot" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{c.name}</span>
            <span className="block truncate text-xs text-smoke">{c.subject ? `${c.subject} · ` : ""}{c.members ?? 0} student{c.members === 1 ? "" : "s"}</span>
          </span>
          <button type="button" className="btn btn-primary btn-sm" disabled={starting} onClick={() => onStart(c)}>Start class</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-smoke">Code</span>
          <code className="class-code" aria-label={`Class code ${c.join_code?.split("").join(" ")}`}>{c.join_code}</code>
          <button type="button" className="nb-link" onClick={() => void copy(c)}>{copied === c.id ? "Link copied" : "Copy join link"}</button>
          {confirming === c.id ? <span className="ml-auto flex items-center gap-2">
            <span>Delete this class? Students lose the grouping, not their lessons.</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void remove(c)}>Delete</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirming(undefined)}>Cancel</button>
          </span> : <button type="button" className="ml-auto text-xs text-smoke hover:underline" onClick={() => setConfirming(c.id)}>Delete</button>}
        </div>
      </li>)}
    </ul>
  </section>;
}
