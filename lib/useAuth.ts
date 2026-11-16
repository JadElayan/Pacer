"use client";
import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { authEnabled, getSupabase } from "./supabase";

export interface AuthUser { id: string; name: string; email: string; avatar?: string }
const toUser = (u: User | null): AuthUser | null => u ? {
  id: u.id,
  name: (u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "You") as string,
  email: u.email ?? "",
  avatar: u.user_metadata?.avatar_url as string | undefined,
} : null;

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !authEnabled()) { setReady(true); return; }
    let active = true;
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(toUser(session?.user ?? null));
      setReady(true);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  const signIn = useCallback(async () => {
    await getSupabase()?.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href.split("#")[0] } });
  }, []);
  const signOut = useCallback(async () => { await getSupabase()?.auth.signOut(); setUser(null); }, []);
  return { user, ready, signIn, signOut, enabled: authEnabled() };
}
