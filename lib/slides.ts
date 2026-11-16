export interface SlidePage { id: string; width: number; height: number; text: string; sharedUrl?: string }
export interface SlideDeck {
  id: string;
  name: string;
  total: number;
  current: number;
  access: "presented" | "all";
  presented: number[];
  pages: Record<number, SlidePage>;
  ink: Record<number, Stroke[]>;
}
export interface LocalSlide extends SlidePage { image: Blob }

export const slideUrl = (page: SlidePage) => page.sharedUrl ?? `/api/slides/${page.id}`;
export function shareableDeck(deck: SlideDeck): SlideDeck {
  if (deck.access === "all") return deck;
  return { ...deck, pages: Object.fromEntries(deck.presented.flatMap((n) => deck.pages[n] ? [[n, deck.pages[n]]] : [])),
    ink: Object.fromEntries(deck.presented.map((n) => [n, deck.ink[n] ?? []])) };
}

export async function publishSlide({ image, sharedUrl: _previousUrl, ...page }: LocalSlide): Promise<SlidePage> {
  const response = await fetch(slideUrl(page), { method: "PUT", headers: { "Content-Type": image.type }, body: image });
  if (!response.ok) throw new Error("Could not share the slide with the room.");
  return page;
}

export function captureSlide(image: HTMLImageElement, strokes: Stroke[], crop?: { left: number; top: number; right: number; bottom: number }) {
  if (!image.complete || !image.naturalWidth) return;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const left = Math.max(0, crop?.left ?? 0) * width;
  const top = Math.max(0, crop?.top ?? 0) * height;
  const w = Math.min(1, crop?.right ?? 1) * width - left;
  const h = Math.min(1, crop?.bottom ?? 1) * height - top;
  if (w <= 0 || h <= 0) return;
  const scale = Math.min(1, 1000 / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.translate(-left, -top);
  ctx.drawImage(image, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    ctx.strokeStyle = stroke.color ?? "#000";
    ctx.lineWidth = (stroke.width ?? 3) * width / Math.max(1, image.clientWidth);
    ctx.globalAlpha = stroke.opacity ?? 1;
    ctx.beginPath();
    for (const [i, [x, y]] of stroke.pts.entries()) {
      if (i) ctx.lineTo(x * width, y * height);
      else { ctx.moveTo(x * width, y * height); if (stroke.pts.length === 1) ctx.lineTo(x * width + 0.01, y * height); }
    }
    ctx.stroke();
  }
  return canvas.toDataURL("image/jpeg", 0.8);
}
import type { Stroke } from "./types";
