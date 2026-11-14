import type { AIRequest, AIResponse, BlockKind } from "./types";

export interface DemoStep { topic: string; summary: string; kind: BlockKind; content: string }
export const DEMO_STEPS: DemoStep[] = [
  { topic: "Setting up the equation", summary: "We start with 2x + 6 = 14 and want to find x.", kind: "text", content: "Solve for x" },
  { topic: "Setting up the equation", summary: "We start with 2x + 6 = 14 and want to find x.", kind: "equation", content: "2x + 6 = 14" },
  { topic: "Isolating the variable term", summary: "Subtract 6 from both sides so the x term is alone.", kind: "equation", content: "2x = 8" },
  { topic: "Solving for x", summary: "Divide both sides by 2, then check the answer.", kind: "equation", content: "x = 4" },
  { topic: "Solving for x", summary: "Divide both sides by 2, then check the answer.", kind: "equation", content: "2(4) + 6 = 14 \\checkmark" },
];

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const KNOWN: Record<string, { why: string; simple: string; example: string }> = {
  "2x=8": {
    why: "Subtract 6 from both sides: 2x + 6 − 6 = 14 − 6. The +6 and −6 cancel, leaving 2x = 8. Whatever you do to one side, do to the other so the equation stays balanced.",
    simple: "We took 6 away from both sides. That makes the 6 disappear on the left, so only 2x is left.",
    example: "Think of a balance scale: 2x + 6 on one side, 14 on the other. Remove 6 from each side and the scale stays level.",
  },
  "x=4": {
    why: "2x means 2 times x. Dividing both sides by 2 undoes the multiplying: 2x ÷ 2 = x and 8 ÷ 2 = 4.",
    simple: "Two x's equal 8, so one x equals 4.",
    example: "If 2 identical boxes weigh 8 kg together, one box weighs 4 kg.",
  },
  "2x+6=14": {
    why: "This is the starting equation. The goal is to get x alone using the same operation on both sides.",
    simple: "Some number x, doubled and plus 6, makes 14. We want to find x.",
    example: "Double a number, add 6, and you get 14. Which number?",
  },
};

export function demoAnswer(r: AIRequest): AIResponse {
  const sel = r.selected[0] ?? "";
  const k = KNOWN[norm(sel)];
  if (r.kind === "summarize") {
    const first = (r.selected[0] ?? "New topic").replace(/\\[a-z]+/g, "").trim();
    return { text: "", title: first.split(/\s+/).slice(0, 5).join(" ") || "New topic", summary: "Covers: " + r.selected.join("; ").slice(0, 140), source: "demo" };
  }
  if (r.kind === "catchup") {
    const t = r.topics ?? [];
    const body = t.length ? t.map((x) => `• ${x.title}: ${x.summary}`).join("\n") : "Nothing new yet.";
    return { text: `What changed:\n${body}\n\nRight now the teacher is on "${t[t.length - 1]?.title ?? "the current topic"}".`, source: "demo" };
  }
  if (r.kind === "clarify") return { text: `Suggestion: briefly re-demonstrate "${sel}" with a concrete analogy (like a balance scale) before moving on, then ask for a quick show of hands.`, source: "demo" };
  let body: string;
  if (r.kind === "simplify") body = k?.simple ?? `In simple words: ${sel}. Ask your teacher if the full meaning is still unclear.`;
  else if (r.kind === "example") body = k?.example ?? `Example: try the same idea with easier numbers, then come back to "${sel}".`;
  else if (r.kind === "snip" || r.kind === "deeper") body = (k?.why ?? `This selection is "${sel}".`) + "\n\nDeeper: each step keeps both sides equal, so the answer can always be checked by substituting it back into the original equation.";
  else body = k?.why ?? `You selected "${sel}". With a real AI key configured, you'd get an explanation tailored to the lecture context.`;
  if (r.mode === "guided") body = "Step 1: Look at what changed.\nStep 2: " + body;
  if (r.mode === "focus") body = body.split(/(?<=\.)\s/)[0];
  return { text: body, source: "demo" };
}
