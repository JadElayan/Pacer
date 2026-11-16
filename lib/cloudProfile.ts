import type { Profile, Stats, StudyEntry } from "./profile";
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
export async function pullLearning(userId: string): Promise<{ profile: Profile; study: StudyEntry[] }> {
  const result = await getSupabase()?.from("learning_profiles").select("data").eq("user_id", userId).maybeSingle();
  if (result?.error) throw result.error;
  const saved = result?.data?.data;
  return saved?.version === 2 ? { profile: saved.profile, study: saved.study } : { profile: saved ?? {}, study: [] };
}
export async function pushProfile(userId: string, profile: Profile, study: StudyEntry[]) {
  const result = await getSupabase()?.from("learning_profiles").upsert({ user_id: userId, data: { version: 2, profile, study }, updated_at: new Date().toISOString() });
  if (result?.error) throw result.error;
}
export async function recordLecture(userId: string, row: { code: string; title: string; subject?: string }) {
  await getSupabase()?.from("lectures").insert({ teacher_id: userId, code: row.code, title: row.title, subject: row.subject || null });
}
