import type { AIRequest } from "./types";

export const SYSTEM = `You are Pacer's classroom learning assistant, helping a student during a live lecture.
- Use the teacher's lecture content provided as your primary context. Never answer from an isolated line if the surrounding context matters.
- Answer the student's exact question. Keep the first explanation short (2-4 sentences) unless asked for more.
- Avoid overwhelming the student. Plain language. Help them rejoin the live lesson.
- Clearly separate what the teacher wrote from your own supplementary explanation (say "Your teacher wrote..." vs "Extra explanation:").
- If the lecture context is missing or unclear, say so rather than guessing.
- Never assume or mention any disability or diagnosis.`;

const MODE: Record<string, string> = {
  standard: "Explain normally.",
  focus: "Focus mode: respond in at most 2 short sentences. No lists.",
  guided: "Guided mode: respond as short numbered steps, bold the key terms with **.",
  example: "Example mode: start with a concrete everyday analogy or worked example, then one line of explanation.",
};
const KIND: Record<string, string> = {
  explain: "Explain the selected note.", why: "Explain why this step happened.", simplify: "Explain it in simpler words.",
  example: "Give one concrete example.", snip: "The student drew a box around this content. Do NOT just restate it: explain it and add depth (why it works, a related idea, a short example).",
  followup: "Answer the student's follow-up question.", another: "The student is still confused. Explain it in a DIFFERENT way than before.",
  deeper: "Explain this topic in more depth with a short example.", catchup: "Write a concise catch-up: what changed, why it matters, what the teacher is discussing now.",
  clarify: "You are advising the TEACHER. Based on the aggregated stats, suggest in 2 sentences how to clarify this concept. Suggestion only.",
};

export function buildUser(r: AIRequest): string {
  const parts = [`Task: ${KIND[r.kind] ?? "Help the student."}`, MODE[r.mode]];
  if (r.detail === "long") parts.push("Give a fuller answer this time.");
  if (r.topicTitle) parts.push(`Current topic: ${r.topicTitle}`);
  if (r.topics?.length) parts.push("Topics:\n" + r.topics.map((t) => `- ${t.title}: ${t.summary}`).join("\n"));
  if (r.context.length) parts.push("Lecture content (in order):\n" + r.context.map((c, i) => `${i + 1}. ${c}`).join("\n"));
  if (r.selected.length) parts.push("Selected by student:\n" + r.selected.map((c) => `> ${c}`).join("\n"));
  if (r.image) parts.push("The attached image is the teacher's handwriting inside the student's box. First say what it reads (e.g. \"Your teacher wrote 2x = 10\"), then explain or solve it in 2-4 simple sentences. If you cannot read it, say so.");
  if (r.stats) parts.push("Aggregated class stats: " + r.stats);
  if (r.question) parts.push(`Student question: ${r.question}`);
  return parts.join("\n\n");
}

export const JSON_KINDS = ["graph", "visual", "quiz"];
const SPEC: Record<string, string> = {
  graph: '{"title":"string","series":[{"label":"y = 2x + 6","expr":"2*x+6"},{"label":"y = 14","expr":"14"}],"xRange":[-2,8],"note":"one short sentence"}. Use "x" as the variable; expr may only use numbers, x, + - * / ^, parentheses, pi, sin, cos, tan, sqrt, abs, ln. If the content is an equation such as 2x + 6 = 14, plot each side as its own series so the crossing shows the solution. At most 3 series.',
  visual: '{"steps":[{"caption":"short action","left":"LaTeX","right":"LaTeX"}]}. Show 3 to 5 steps that keep an equation balanced like a balance scale; left and right are short LaTeX strings. If the content is not an equation, show the idea as balanced steps anyway.',
  quiz: '{"question":"string","answer":"string","hint":"string"}. Write ONE short practice question similar to the selected content. The answer must be a short number or expression.',
};
export function buildJson(r: AIRequest): string {
  const parts = [`Reply with ONLY one JSON object, no markdown, in this shape: ${SPEC[r.kind]}`];
  if (r.topicTitle) parts.push(`Current topic: ${r.topicTitle}`);
  if (r.context.length) parts.push("Lecture content (in order):\n" + r.context.map((c, i) => `${i + 1}. ${c}`).join("\n"));
  if (r.selected.length) parts.push("Selected by student:\n" + r.selected.map((c) => `> ${c}`).join("\n"));
  return parts.join("\n\n");
}

export function buildSummarize(r: AIRequest): string {
  return `Summarize this lecture topic from the teacher's notes. Reply with ONLY JSON: {"title": "<max 5 words>", "summary": "<max 20 words>"}.\n\nNotes:\n${r.selected.map((c) => `- ${c}`).join("\n")}`;
}
