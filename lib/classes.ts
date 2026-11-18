// Teacher-made classes (supabase/classes.sql). Signed-in only: a teacher creates a class and shares its code;
// students join once. Every call fails softly with a plain message when the table isn't installed or the user is signed out.
import { getSupabase } from "./supabase";
import type { ClassRef } from "./types";

export interface PacerClass {
  id: string; name: string; subject?: string | null; color?: string | null; join_code?: string;
  teacher_name?: string | null; live_code?: string | null; live_at?: string | null; members?: number;
}

/** A class counts as live for three hours after its meeting started. */
export const LIVE_FOR_MS = 3 * 3600_000;
export const isLive = (c: Pick<PacerClass, "live_code" | "live_at">) => !!c.live_code && !!c.live_at && Date.now() - Date.parse(c.live_at) < LIVE_FOR_MS;
export const classRef = (c: PacerClass): ClassRef => ({ id: c.id, name: c.name, ...(c.color ? { color: c.color } : {}), ...(c.join_code ? { joinCode: c.join_code } : {}) });
export const joinLink = (code: string) => `${typeof window === "undefined" ? "" : window.location.origin}/join/${code}`;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I, so codes read aloud cleanly
const newCode = () => Array.from(crypto.getRandomValues(new Uint32Array(6)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
const missing = (message?: string) => /pacer_classes|pacer_join_class|schema cache|does not exist/i.test(message ?? "");
const plain = (e: { message?: string } | null | undefined, fallback: string) =>
  new Error(missing(e?.message) ? "Classes aren't set up on this server yet." : e?.message?.replace(/^.*?: /, "") || fallback);

export async function teacherClasses(teacherId: string): Promise<PacerClass[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db.from("pacer_classes").select("id,name,subject,color,join_code,teacher_name,live_code,live_at,pacer_class_members(count)")
    .eq("teacher_id", teacherId).order("created_at", { ascending: false });
  if (error) throw plain(error, "Couldn't load your classes.");
  return (data ?? []).map((row) => {
    const { pacer_class_members: m, ...rest } = row as PacerClass & { pacer_class_members?: { count: number }[] };
    return { ...rest, members: m?.[0]?.count ?? 0 };
  });
}

export async function createClass(teacherId: string, input: { name: string; subject?: string; color?: string; teacherName?: string }): Promise<PacerClass> {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to create a class.");
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db.from("pacer_classes").insert({ teacher_id: teacherId, name: input.name.trim().slice(0, 80),
      subject: input.subject?.trim().slice(0, 80) || null, color: input.color ?? null, teacher_name: input.teacherName?.slice(0, 80) ?? null, join_code: newCode() })
      .select("id,name,subject,color,join_code,teacher_name,live_code,live_at").single();
    if (!error) return { ...(data as PacerClass), members: 0 };
    if (!/duplicate key|join_code/i.test(error.message)) throw plain(error, "Couldn't create the class.");
  }
  throw new Error("Couldn't create the class. Try again.");
}

export async function deleteClass(id: string) {
  const { error } = (await getSupabase()?.from("pacer_classes").delete().eq("id", id)) ?? {};
  if (error) throw plain(error, "Couldn't delete the class.");
}

/** Marks which meeting is live for a class (or none). Students in the class see "Class is live" and can join without a code. */
export async function setClassLive(id: string, code: string | null) {
  const { error } = (await getSupabase()?.from("pacer_classes").update({ live_code: code, live_at: code ? new Date().toISOString() : null }).eq("id", id)) ?? {};
  if (error) throw plain(error, "Couldn't update the class.");
}

export async function joinClass(code: string): Promise<PacerClass> {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to join a class.");
  const { data, error } = await db.rpc("pacer_join_class", { code: code.trim().toUpperCase() });
  if (error) throw plain(error, "Couldn't join that class.");
  const row = (Array.isArray(data) ? data[0] : data) as PacerClass | undefined;
  if (!row) throw new Error("No class has that code.");
  return row;
}

/** Classes the signed-in student belongs to. Row-level security only returns those. */
export async function myClasses(userId: string): Promise<PacerClass[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db.from("pacer_class_members").select("pacer_classes(id,name,subject,color,teacher_name,live_code,live_at)").eq("user_id", userId);
  if (error) throw plain(error, "Couldn't load your classes.");
  return (data ?? []).flatMap((row) => { const c = (row as { pacer_classes?: PacerClass | PacerClass[] }).pacer_classes; return c ? (Array.isArray(c) ? c : [c]) : []; });
}

export async function leaveClass(classId: string, userId: string) {
  const { error } = (await getSupabase()?.from("pacer_class_members").delete().eq("class_id", classId).eq("user_id", userId)) ?? {};
  if (error) throw plain(error, "Couldn't leave the class.");
}
