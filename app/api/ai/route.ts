import { NextResponse } from "next/server";
import { demoAnswer } from "@/lib/demo";
import { buildJson, buildSummarize, buildUser, JSON_KINDS, SYSTEM } from "@/lib/prompt";
import type { AIRequest, AIResponse } from "@/lib/types";

const clip = (a: string[] | undefined, n: number) => (a ?? []).slice(0, n).map((s) => String(s).slice(0, 600));

export async function POST(req: Request) {
  let b: AIRequest;
  try { b = (await req.json()) as AIRequest; } catch { return NextResponse.json({ text: "", source: "demo", error: "Bad request" }, { status: 400 }); }
  b = { ...b, selected: clip(b.selected, 12), context: clip(b.context, 40), question: b.question?.slice(0, 500), history: (b.history ?? []).slice(-6) };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json(demoAnswer(b));
  try {
    const messages = [...(b.history ?? []).map((h) => ({ role: h.role, content: h.text })), { role: "user" as const, content: b.kind === "summarize" ? buildSummarize(b) : JSON_KINDS.includes(b.kind) ? buildJson(b) : buildUser(b) }];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: JSON_KINDS.includes(b.kind) ? 900 : b.detail === "long" ? 700 : 350, system: SYSTEM, messages }),
    });
    if (!r.ok) throw new Error(`AI provider returned ${r.status}`);
    const j = (await r.json()) as { content?: { text?: string }[] };
    const text = j.content?.[0]?.text?.trim() ?? "";
    if (b.kind === "summarize") {
      try { const o = JSON.parse(text.replace(/^```json|```$/g, "").trim()); return NextResponse.json({ text: "", title: o.title, summary: o.summary, source: "ai" } satisfies AIResponse); }
      catch { return NextResponse.json(demoAnswer(b)); }
    }
    if (JSON_KINDS.includes(b.kind)) {
      try { const data = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim()); return NextResponse.json({ text: "", data, source: "ai" } satisfies AIResponse); }
      catch { return NextResponse.json(demoAnswer(b)); }
    }
    return NextResponse.json({ text, source: "ai" } satisfies AIResponse);
  } catch (e) {
    return NextResponse.json({ text: "", source: "ai", error: e instanceof Error ? e.message : "AI request failed" } satisfies AIResponse, { status: 502 });
  }
}
