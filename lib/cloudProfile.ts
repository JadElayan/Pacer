import type { Profile, Stats } from "./profile";
import { getSupabase } from "./supabase";

/** Per-subject max of each counter: merging a device profile with the saved account profile never loses activity. */
export function mergeProfiles(a: Profile, b: Profile): Profile {
  const out: Profile = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k]; if (!x || !y) { out[k] = (x ?? y) as Stats; continue; }
    out[k] = Object.fromEntries((Object.keys(x) as (keyof Stats)[]).map((f) => [f, Math.max(x[f], y[f])])) as unknown as Stats;
  }
  return out;
}
export async function pullProfile(userId: string): Promise<Profile | null> {
  const { data } = (await getSupabase()?.from("learning_profiles").select("data").eq("user_id", userId).maybeSingle()) ?? { data: null };
  return (data?.data as Profile | undefined) ?? null;
}
export async function pushProfile(userId: string, p: Profile) {
  await getSupabase()?.from("learning_profiles").upsert({ user_id: userId, data: p, updated_at: new Date().toISOString() });
}
export async function recordLecture(userId: string, row: { code: string; title: string; subject?: string }) {
  await getSupabase()?.from("lectures").insert({ teacher_id: userId, code: row.code, title: row.title, subject: row.subject || null });
}
