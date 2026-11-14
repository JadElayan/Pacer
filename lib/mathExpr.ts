/** Tiny safe math expression evaluator (no eval). Supports + - * / ^, x, pi, sin cos tan sqrt abs ln, implicit multiplication (2x, 3(x+1)). */
type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };
const NAMES = ["sqrt", "sin", "cos", "tan", "abs", "ln", "pi", "x"];

function tokenize(src: string): Tok[] | null {
  const s = src.replace(/\s+/g, "").toLowerCase().replace(/\*\*/g, "^").replace(/π/g, "pi");
  const out: Tok[] = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; const n = Number(s.slice(i, j)); if (Number.isNaN(n)) return null; out.push({ t: "num", v: n }); i = j; }
    else if (/[a-z]/.test(c)) { const m = NAMES.find((n) => s.startsWith(n, i)); if (!m) return null; out.push({ t: "id", v: m }); i += m.length; }
    else if ("+-*/^()".includes(c)) { out.push({ t: "op", v: c }); i++; }
    else return null;
  }
  return out;
}

class P {
  pos = 0;
  constructor(private toks: Tok[], private x: number) {}
  private peek() { return this.toks[this.pos]; }
  private isOp(v: string) { const t = this.peek(); return !!t && t.t === "op" && t.v === v; }
  expr(): number {
    let v = this.term();
    while (this.isOp("+") || this.isOp("-")) { const op = (this.toks[this.pos++] as { v: string }).v; const r = this.term(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  private term(): number {
    let v = this.unary();
    for (;;) {
      if (this.isOp("*") || this.isOp("/")) { const op = (this.toks[this.pos++] as { v: string }).v; const r = this.unary(); v = op === "*" ? v * r : v / r; }
      else { const t = this.peek(); if (t && (t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "("))) v *= this.unary(); else break; }
    }
    return v;
  }
  private unary(): number {
    if (this.isOp("-")) { this.pos++; return -this.unary(); }
    if (this.isOp("+")) { this.pos++; return this.unary(); }
    return this.power();
  }
  private power(): number {
    const b = this.atom();
    if (this.isOp("^")) { this.pos++; return Math.pow(b, this.unary()); }
    return b;
  }
  private atom(): number {
    const t = this.toks[this.pos++];
    if (!t) throw new Error("unexpected end");
    if (t.t === "num") return t.v;
    if (t.t === "op" && t.v === "(") { const v = this.expr(); if (!this.isOp(")")) throw new Error("missing )"); this.pos++; return v; }
    if (t.t === "id") {
      if (t.v === "x") return this.x;
      if (t.v === "pi") return Math.PI;
      if (!this.isOp("(")) throw new Error("function needs ()");
      this.pos++; const a = this.expr(); if (!this.isOp(")")) throw new Error("missing )"); this.pos++;
      switch (t.v) { case "sin": return Math.sin(a); case "cos": return Math.cos(a); case "tan": return Math.tan(a); case "sqrt": return Math.sqrt(a); case "abs": return Math.abs(a); case "ln": return Math.log(a); }
    }
    throw new Error("bad token");
  }
}

export function compile(src: string): ((x: number) => number) | null {
  const toks = tokenize(src); if (!toks || !toks.length) return null;
  const f = (x: number) => { const p = new P(toks, x); const v = p.expr(); if (p.pos !== toks.length) throw new Error("trailing input"); return v; };
  try { f(1); } catch { return null; }
  return (x) => { try { return f(x); } catch { return NaN; } };
}
