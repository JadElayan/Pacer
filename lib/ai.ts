import type { AIRequest, AIResponse } from "./types";
export async function askAI(body: AIRequest): Promise<AIResponse> {
  const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json()) as AIResponse;
  if (!r.ok || j.error) throw new Error(j.error || "AI request failed");
  return j;
}
