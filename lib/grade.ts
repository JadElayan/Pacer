/** Forgiving answer check for check-in questions (spaces, case, "x = 4", fractions, decimals). */
const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "").replace(/^[a-z]=/, "");
function num(s: string): number {
  const f = s.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  return f ? Number(f[1]) / Number(f[2]) : Number(s);
}
export function isCorrect(given: string, key: string): boolean {
  const a = clean(given), b = clean(key);
  if (a === b) return true;
  const na = num(a), nb = num(b);
  return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-6;
}
