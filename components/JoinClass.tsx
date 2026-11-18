"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { isLive, joinClass, type PacerClass } from "@/lib/classes";
import { useAuth } from "@/lib/useAuth";
import { Logo } from "./Logo";

/** Opened from a teacher's join link (/join/ABC123). Signed-in students join the class; others are asked to sign in first. */
export function JoinClass({ code }: { code: string }) {
  const { user, ready, signIn, enabled } = useAuth();
  const [state, setState] = useState<{ cls?: PacerClass; error?: string }>();
  const clean = code.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6);
  useEffect(() => {
    if (!ready || !user || clean.length !== 6) return;
    let active = true;
    void joinClass(clean).then((cls) => { if (active) setState({ cls }); })
      .catch((e) => { if (active) setState({ error: e instanceof Error ? e.message : "Couldn't join that class." }); });
    return () => { active = false; };
  }, [ready, user, clean]);

  return <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
    <Logo />
    {!ready ? <p role="status" className="text-smoke">Opening…</p>
      : clean.length !== 6 ? <p role="alert">That class link looks incomplete. Ask your teacher for the 6-character code.</p>
      : !user ? <>
        <h1 className="display text-3xl">Join class {clean}</h1>
        <p className="text-smoke">Sign in so your lessons from this class stay together on your dashboard.</p>
        {enabled ? <button type="button" className="btn btn-primary" onClick={() => void signIn()}>Sign in with Google</button>
          : <p className="text-sm text-smoke">Sign-in isn't set up on this server.</p>}
      </>
      : state?.error ? <>
        <h1 className="display text-3xl">Couldn&apos;t join</h1>
        <p role="alert">{state.error}</p>
        <Link href="/" className="btn btn-outline">Back to Pacer</Link>
      </>
      : state?.cls ? <>
        <h1 className="display text-3xl">You joined {state.cls.name}</h1>
        <p className="text-smoke">{state.cls.teacher_name ? `${state.cls.teacher_name}'s lessons` : "Its lessons"} will be grouped together on your dashboard.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {isLive(state.cls) && <Link href={`/room/${state.cls.live_code}`} className="btn btn-primary">Class is live · Join</Link>}
          <Link href="/" className={`btn ${isLive(state.cls) ? "btn-outline" : "btn-primary"}`}>Go to your lessons</Link>
        </div>
      </>
      : <p role="status" className="text-smoke">Joining class {clean}…</p>}
  </main>;
}
