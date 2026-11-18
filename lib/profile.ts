/** Student-private learning profile. Stored only on this device (localStorage). Teachers never see it. */
export interface Stats { asks: number; confused: number; helped: number; checkRight: number; checkWrong: number; quizRight: number; quizWrong: number }
export type Profile = Record<string, Stats>;
export interface StudyEntry { id: string; lecture: string; topic: string; question?: string; suggestion?: string; ts: number;
  /** Lesson code, for linking back to it. */ code?: string; /** The student chose "Got it now". */ resolved?: boolean }
export function mergeStudy(...lists: StudyEntry[][]): StudyEntry[] {
  const entries = new Map<string, StudyEntry>();
  for (const entry of lists.flat()) entries.set(entry.id, { ...entries.get(entry.id), ...entry });
  return [...entries.values()].sort((a, b) => b.ts - a.ts).slice(0, 150);
}
export function loadStudy(userId?: string): StudyEntry[] {
  try { return JSON.parse(localStorage.getItem(`pacer:study:${userId ?? "guest"}`) ?? "[]"); } catch { return []; }
}
export function saveStudy(entries: StudyEntry[], userId?: string) {
  try { localStorage.setItem(`pacer:study:${userId ?? "guest"}`, JSON.stringify(entries)); } catch { /* storage unavailable */ }
}
const KEY = "pacer:profile";
const empty = (): Stats => ({ asks: 0, confused: 0, helped: 0, checkRight: 0, checkWrong: 0, quizRight: 0, quizWrong: 0 });

const profileKey = (userId?: string) => userId ? `${KEY}:${userId}` : KEY;
export function loadProfile(userId?: string): Profile { try { const v = localStorage.getItem(profileKey(userId)); return v ? (JSON.parse(v) as Profile) : {}; } catch { return {}; } }
export function saveProfile(p: Profile, userId?: string) { try { localStorage.setItem(profileKey(userId), JSON.stringify(p)); } catch { /* ignore */ } }
export function bump(subject: string, field: keyof Stats, userId?: string): Profile {
  const p = loadProfile(userId); const s = { ...empty(), ...p[subject] }; s[field] += 1; p[subject] = s; saveProfile(p, userId); return { ...p };
}

export function subjectOf(title: string, subject?: string): string {
  if (subject?.trim()) return subject.trim().replace(/^./, (c) => c.toUpperCase());
  const t = title.toLowerCase();
  const map: [RegExp, string][] = [[/algebra|equation|linear|polynomial/, "Algebra"], [/trig|sine|cosine|tangent/, "Trigonometry"], [/geometry|triangle|circle/, "Geometry"], [/calculus|derivative|integral/, "Calculus"]];
  return map.find(([re]) => re.test(t))?.[1] ?? (title.trim() || "General");
}
const answered = (s: Stats) => s.checkRight + s.checkWrong + s.quizRight + s.quizWrong;
export function accuracy(s: Stats): number | null { const n = answered(s); return n ? Math.round((100 * (s.checkRight + s.quizRight)) / n) : null; }

/** Plain-language, rule-based observations. They describe activity, not proven understanding. */
export function summarize(p: Profile): string[] {
  const rows = Object.entries(p).filter(([, s]) => s.asks + answered(s) > 0);
  if (!rows.length) return ["Nothing yet. Ask questions and answer check-ins during lectures and this page will fill in."];
  const out: string[] = [];
  if (rows.length >= 2) {
    const byAsks = [...rows].sort((a, b) => b[1].asks - a[1].asks);
    const most = byAsks[0], least = byAsks[byAsks.length - 1];
    if (most[1].asks > least[1].asks) out.push(`You ask many more questions about ${most[0]} (${most[1].asks}) than about ${least[0]} (${least[1].asks}).`);
  }
  const scored = rows.filter(([, s]) => answered(s) >= 3 && accuracy(s) !== null).sort((a, b) => accuracy(a[1])! - accuracy(b[1])!);
  if (scored.length && accuracy(scored[0][1])! < 70) out.push(`Your answers are least accurate in ${scored[0][0]} (${accuracy(scored[0][1])}% right). From what we can see, more ${scored[0][0]} practice could help.`);
  if (scored.length && accuracy(scored[scored.length - 1][1])! >= 80 && scored.length > 1) out.push(`You are answering ${scored[scored.length - 1][0]} questions well (${accuracy(scored[scored.length - 1][1])}% right).`);
  if (!out.length) rows.forEach(([n, s]) => out.push(`${n}: ${s.asks} question${s.asks === 1 ? "" : "s"} asked${accuracy(s) !== null ? `, ${accuracy(s)}% of answers right` : ""}.`));
  return out;
}
