/**
 * Turns what someone types into an equation box into TeX, so powers and fractions format as they type:
 * `x^2` → x², `a/b` → a stacked fraction, `(x+1)/(x-1)`, `2x^2/4`, `sqrt(x)`, `*` → ·, `pi` → π.
 * Input that already contains TeX commands (a backslash) is left alone.
 */
type Token = { type: "num" | "id" | "group" | "op" | "space"; text: string };
type Atom = { tex: string; bare: string } | { op: string };

const SYMBOLS: Record<string, string> = { pi: "\\pi", theta: "\\theta", alpha: "\\alpha", beta: "\\beta", infinity: "\\infty", inf: "\\infty" };
const FUNCTIONS = new Set(["sin", "cos", "tan", "log", "ln"]);
const PLACEHOLDER = "\\square";

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { let j = i; while (j < input.length && /\s/.test(input[j])) j++; tokens.push({ type: "space", text: " " }); i = j; continue; }
    if (/[0-9.]/.test(ch)) { let j = i; while (j < input.length && /[0-9.]/.test(input[j])) j++; tokens.push({ type: "num", text: input.slice(i, j) }); i = j; continue; }
    if (/[a-zA-Z]/.test(ch)) { let j = i; while (j < input.length && /[a-zA-Z]/.test(input[j])) j++; tokens.push({ type: "id", text: input.slice(i, j) }); i = j; continue; }
    if (ch === "(") {
      // A group runs to its matching bracket (or the end, while the person is still typing).
      let depth = 1, j = i + 1;
      while (j < input.length && depth) { if (input[j] === "(") depth++; else if (input[j] === ")") depth--; j++; }
      tokens.push({ type: "group", text: input.slice(i + 1, depth ? j : j - 1) });
      i = j; continue;
    }
    tokens.push({ type: "op", text: ch }); i++;
  }
  return tokens;
}

const isValue = (atom: Atom | undefined): atom is { tex: string; bare: string } => !!atom && "tex" in atom;

function convert(input: string): string {
  const atoms: Atom[] = [];
  const tokens = tokenize(input);
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type === "space") { atoms.push({ op: " " }); continue; }
    if (t.type === "op") { atoms.push({ op: t.text }); continue; }
    if (t.type === "group") { const inner = convert(t.text) || PLACEHOLDER; atoms.push({ tex: `\\left(${inner}\\right)`, bare: inner }); continue; }
    if (t.type === "id" && t.text === "sqrt") {
      const next = tokens[k + 1];
      const inner = next?.type === "group" ? convert(next.text) || PLACEHOLDER : PLACEHOLDER;
      if (next?.type === "group") k++;
      atoms.push({ tex: `\\sqrt{${inner}}`, bare: `\\sqrt{${inner}}` });
      continue;
    }
    if (t.type === "id" && FUNCTIONS.has(t.text)) { atoms.push({ tex: `\\${t.text} `, bare: `\\${t.text} ` }); continue; }
    const text = t.type === "id" ? SYMBOLS[t.text] ?? t.text : t.text;
    atoms.push({ tex: text, bare: text });
  }

  // Powers bind tightest: base^exponent (the exponent loses its brackets).
  for (let k = 0; k < atoms.length; k++) {
    const atom = atoms[k];
    if (isValue(atom) || atom.op !== "^") continue;
    const base = atoms[k - 1], exp = atoms[k + 1];
    const baseTex = isValue(base) ? base.tex : "";
    const expTex = isValue(exp) ? exp.bare : PLACEHOLDER;
    const tex = `{${baseTex}}^{${expTex}}`;
    atoms.splice(isValue(base) ? k - 1 : k, (isValue(base) ? 1 : 0) + 1 + (isValue(exp) ? 1 : 0), { tex, bare: tex });
    k = Math.max(-1, k - 2);
  }
  // Neighbours with no operator between them multiply (2x, 3xy, 2x^2) and stay together in a fraction.
  for (let k = 1; k < atoms.length; k++) {
    const a = atoms[k - 1], b = atoms[k];
    if (isValue(a) && isValue(b)) { const tex = `${a.tex}${b.tex}`; atoms.splice(k - 1, 2, { tex, bare: tex }); k--; }
  }
  // Fractions: left / right, read left to right.
  for (let k = 0; k < atoms.length; k++) {
    const atom = atoms[k];
    if (isValue(atom) || atom.op !== "/") continue;
    const top = atoms[k - 1], bottom = atoms[k + 1];
    const tex = `\\frac{${isValue(top) ? top.bare : PLACEHOLDER}}{${isValue(bottom) ? bottom.bare : PLACEHOLDER}}`;
    atoms.splice(isValue(top) ? k - 1 : k, (isValue(top) ? 1 : 0) + 1 + (isValue(bottom) ? 1 : 0), { tex, bare: tex });
    k = Math.max(-1, k - 2);
  }
  return atoms.map((atom) => isValue(atom) ? atom.tex : atom.op === "*" ? "\\cdot " : atom.op).join("").trim();
}

export function mathInputToTex(input: string) {
  const text = input.trim();
  if (!text || text.includes("\\")) return text;
  return convert(text);
}

/** A spoken version of simple TeX for screen readers: \frac{a}{b} → "a over b", x^{2} → "x to the power 2". */
export function texToSpeech(tex: string) {
  let s = tex;
  const inner = "([^{}]*)";
  for (let i = 0; i < 8; i++) {
    const before = s;
    s = s.replace(new RegExp(String.raw`\\frac\{${inner}\}\{${inner}\}`, "g"), " ($1) over ($2) ")
      .replace(new RegExp(String.raw`\\sqrt\{${inner}\}`, "g"), " square root of ($1) ")
      .replace(new RegExp(String.raw`\^\{${inner}\}`, "g"), " to the power $1 ")
      // Plain grouping braces go, but not a fraction's or root's own braces (those are handled above).
      .replace(new RegExp(String.raw`(?<!\\frac|\\sqrt|\})\{${inner}\}`, "g"), "$1");
    if (s === before) break;
  }
  return s.replace(/\\cdot/g, " times ").replace(/\\left|\\right/g, "").replace(/\\square/g, " blank ").replace(/\\([a-zA-Z]+)/g, " $1 ")
    .replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/\((\w+)\)/g, "$1").trim();
}
