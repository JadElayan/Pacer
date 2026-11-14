"use client";
import { useAuth } from "@/lib/useAuth";

/** Sign-in control. Renders nothing until Google sign-in is configured, so the demo never depends on it. */
export function AuthBar() {
  const { user, ready, signIn, signOut, enabled } = useAuth();
  if (!enabled || !ready) return null;
  return user ? (
    <div className="flex items-center gap-3">
      {user.avatar ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={user.avatar} alt="" width={32} height={32} className="h-8 w-8 rounded-full border border-stone" referrerPolicy="no-referrer" /> : <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-sky text-sm font-medium">{user.name[0]?.toUpperCase()}</span>}
      <span className="hidden text-sm sm:inline">Hi, {user.name.split(" ")[0]}</span>
      <button className="btn btn-outline btn-sm" onClick={() => void signOut()}>Sign out</button>
    </div>
  ) : (
    <button className="btn btn-outline btn-sm" onClick={() => void signIn()}>Sign in with Google</button>
  );
}
