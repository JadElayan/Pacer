"use client";

import { useEffect, useState } from "react";

export function StudentNotes({ storageKey }: { storageKey: string }) {
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState("");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const draftKey = `${storageKey}:draft`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey) ?? "";
      setBody(stored);
      setSaved(stored);
    } catch {
      setStatus("Could not read notes saved in this browser.");
    }
    try {
      const draft = sessionStorage.getItem(draftKey);
      if (draft !== null) setBody(draft);
    } catch { /* Draft stays in memory when browser storage is unavailable. */ }
    setReady(true);
  }, [storageKey, draftKey]);

  return <details className="rounded-xl border border-stone bg-eggshell px-3 py-2">
    <summary className="cursor-pointer text-sm font-medium">My notes</summary>
    <form className="mt-2 grid gap-2" onSubmit={(event) => {
      event.preventDefault();
      try {
        if (body) localStorage.setItem(storageKey, body);
        else localStorage.removeItem(storageKey);
        try { sessionStorage.removeItem(draftKey); } catch { /* The saved note is already stored. */ }
        setSaved(body);
        setStatus("Notes saved in this browser.");
      } catch {
        setStatus("Could not save your notes. Copy your text before leaving this page.");
      }
    }}>
      <label className="text-sm">
        Private classroom notes
        <textarea className="input mt-1 w-full" rows={5} maxLength={50000} value={body} disabled={!ready}
          onChange={(event) => {
            const value = event.target.value;
            setBody(value);
            setStatus("");
            try {
              if (value === saved) sessionStorage.removeItem(draftKey);
              else sessionStorage.setItem(draftKey, value);
            } catch { /* Draft stays in memory. */ }
          }} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!ready || saved === body}>Save notes</button>
        <span role="status" className="text-sm">{status || (saved !== body ? "Unsaved changes" : "Only saved in this browser. These notes aren’t shared with the class.")}</span>
      </div>
    </form>
  </details>;
}
