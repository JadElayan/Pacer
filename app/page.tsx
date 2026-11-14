"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "@/components/Logo";
import { AuthBar } from "@/components/AuthBar";
import { recordLecture } from "@/lib/cloudProfile";
import { useAuth } from "@/lib/useAuth";
import { createMeeting } from "@/lib/useRoom";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [nick, setNick] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [err, setErr] = useState("");
  const [lobby, setLobby] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { setErr("Enter the 6-digit code your teacher shared."); return; }
    try { localStorage.setItem("pacer:nick", nick); } catch { /* ignore */ }
    router.push(`/room/${code}`);
  };
  const link = lobby && typeof window !== "undefined" ? `${window.location.origin}/room/${lobby}` : "";

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="glow pointer-events-none absolute left-1/2 top-[42%] h-[720px] w-[720px] rounded-full bg-sky opacity-30 blur-3xl" style={{ transform: "translate(-50%,-50%)" }} />
      <header className="relative mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6"><Logo /><AuthBar /></header>
      <section className="relative mx-auto flex max-w-xl flex-col items-center px-6 pb-24 pt-16 text-center md:pt-24">
        <h1 className="display text-[40px] md:text-[56px]">The classroom,<br />in sync.</h1>
        <p className="mt-4 text-lg text-smoke">One lesson, with every student moving through it their own way.</p>

        {!lobby ? (
          <div className="mt-10 w-full space-y-4 text-left">
            <form onSubmit={join} className="card rounded-[24px] border border-stone bg-eggshell/90 p-6 shadow-[var(--shadow-whisper)]">
              <label htmlFor="code" className="block text-sm font-medium">Meeting code</label>
              <input id="code" inputMode="numeric" autoComplete="off" maxLength={6} className="input mt-2 text-center text-2xl tracking-[0.4em]" placeholder="000000" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setErr(""); }} aria-describedby="code-err" />
              <label htmlFor="nick" className="mt-4 block text-sm font-medium">Nickname <span className="text-smoke">(optional)</span></label>
              <input id="nick" className="input mt-2" value={nick} onChange={(e) => setNick(e.target.value)} />
              <p id="code-err" role="alert" className="mt-2 min-h-5 text-sm text-sky-deep">{err}</p>
              <button className="btn btn-primary mt-2 w-full text-base" type="submit">Join Meeting</button>
            </form>
            <form onSubmit={(e) => { e.preventDefault(); { const c = createMeeting(title.trim(), subject); setLobby(c); if (user) void recordLecture(user.id, { code: c, title: title.trim() || "Untitled lecture", subject }); }; }} className="card rounded-[24px] border border-stone bg-eggshell/90 p-6 shadow-[var(--shadow-whisper)]">
              <label htmlFor="title" className="block text-sm font-medium">Teaching? Name your lecture</label>
              <input id="title" className="input mt-2" placeholder="Solving Linear Equations" value={title} onChange={(e) => setTitle(e.target.value)} />
              <label htmlFor="subject" className="mt-4 block text-sm font-medium">Subject <span className="text-smoke">(optional)</span></label>
              <input id="subject" className="input mt-2" placeholder="Algebra" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <button className="btn btn-dark mt-4 w-full text-base" type="submit">Start Meeting</button>
            </form>
          </div>
        ) : (
          <div className="mt-10 w-full rounded-[24px] border border-stone bg-eggshell/90 p-6 text-center shadow-[var(--shadow-whisper)]">
            <p className="text-sm text-smoke">Share this code with your class</p>
            <p className="my-2 text-5xl font-light tracking-[0.2em]" aria-label={`Meeting code ${lobby.split("").join(" ")}`}>{lobby}</p>
            <div className="mx-auto my-4 w-fit rounded-2xl border border-stone bg-white p-3"><QRCodeSVG value={link} size={160} /></div>
            <p className="break-all text-sm text-smoke">{link}</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button className="btn btn-outline flex-1" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}>{copied ? "Copied" : "Copy link"}</button>
              <button className="btn btn-primary flex-1" onClick={() => router.push(`/room/${lobby}?role=teacher`)}>Enter classroom</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
