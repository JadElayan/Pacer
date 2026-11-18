import type { AIRequest, AIResponse } from "./types";

/**
 * Calls Pacer's AI route. Two things keep it cheap:
 * - Pictures are scaled down to at most 1024 px on the long side first (image cost grows with pixel area, and
 *   slides and handwriting stay readable at this size).
 * - Answers are remembered in this tab for 30 minutes, so opening the same explanation again costs nothing.
 *   "another" (explain it a different way) always asks again.
 */
const MAX_SIDE = 1024;
const KEEP_MS = 30 * 60 * 1000;
const STORE = "pacer:ai-cache";

async function shrink(dataUrl: string): Promise<string> {
  if (typeof document === "undefined" || !/^data:image\//.test(dataUrl)) return dataUrl;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = dataUrl;
    });
    const k = MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight);
    if (k >= 1) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * k); canvas.height = Math.round(image.naturalHeight * k);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return dataUrl.startsWith("data:image/png") ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", .85);
  } catch { return dataUrl; }
}

async function hash(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
type Saved = Record<string, { at: number; value: AIResponse }>;
const load = (): Saved => { try { return JSON.parse(sessionStorage.getItem(STORE) ?? "{}") as Saved; } catch { return {}; } };
const save = (all: Saved) => {
  const now = Date.now();
  const kept = Object.entries(all).filter(([, v]) => now - v.at < KEEP_MS).sort((a, b) => b[1].at - a[1].at).slice(0, 60);
  try { sessionStorage.setItem(STORE, JSON.stringify(Object.fromEntries(kept))); } catch { /* storage full or blocked */ }
};

export async function askAI(request: AIRequest): Promise<AIResponse> {
  const body = request.image ? { ...request, image: await shrink(request.image) } : request;
  const json = JSON.stringify(body);
  const key = request.kind === "another" || typeof crypto === "undefined" || !crypto.subtle ? null : await hash(json);
  if (key) {
    const hit = load()[key];
    if (hit && Date.now() - hit.at < KEEP_MS) return hit.value;
  }
  const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: json });
  const j = (await r.json()) as AIResponse;
  if (!r.ok || j.error) throw new Error(j.error || "AI request failed");
  if (key && j.source === "ai") { const all = load(); all[key] = { at: Date.now(), value: j }; save(all); }
  return j;
}
