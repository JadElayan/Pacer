/**
 * Handwriting in the student notebook. Coordinates are in "page units": the page (or clip) is 1000 units wide and
 * y uses the same scale, so ink keeps its shape at any size. `p` is a flat list of x, y, pressure (0–100).
 */
export type InkStroke = { c: string; w: number; a?: number; p: number[] };
/** One page of handwriting. `h` is its height in page units (topic pages grow as you write). */
export type InkPage = { h?: number; s: InkStroke[] };
export type InkTool = { kind: "pen" | "highlighter" | "eraser"; color: string };

export const INK_WIDTH = 1000;
export const PAGE_START = 560;
export const INK_COLORS = [["Black", "#1f2540"], ["Blue", "#2454e8"], ["Red", "#d0453b"], ["Green", "#1d9e75"]] as const;
export const HIGHLIGHT = "#ffd54a";

export const hasInk = (page?: InkPage) => !!page?.s.length;

/** Draws strokes onto a 2D context whose width is `width` pixels. */
export function drawInk(ctx: CanvasRenderingContext2D, strokes: InkStroke[], width: number) {
  const k = width / INK_WIDTH;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const stroke of strokes) {
    const p = stroke.p;
    ctx.strokeStyle = stroke.c; ctx.fillStyle = stroke.c; ctx.globalAlpha = stroke.a ?? 1;
    if (p.length <= 3) {
      ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, Math.max(.6, stroke.w * k * (0.45 + (p[2] ?? 50) / 90) / 2), 0, Math.PI * 2); ctx.fill();
      continue;
    }
    if (stroke.a !== undefined && stroke.a < 1) {
      // Highlighter: one path, so overlapping segments don't darken.
      ctx.lineWidth = stroke.w * k;
      ctx.beginPath(); ctx.moveTo(p[0] * k, p[1] * k);
      for (let i = 3; i < p.length; i += 3) ctx.lineTo(p[i] * k, p[i + 1] * k);
      ctx.stroke();
      continue;
    }
    for (let i = 3; i < p.length; i += 3) {
      // Pressure changes the width; 50 (a mouse or finger) draws the normal width.
      ctx.lineWidth = Math.max(.6, stroke.w * k * (0.45 + p[i + 2] / 90));
      ctx.beginPath(); ctx.moveTo(p[i - 3] * k, p[i - 2] * k); ctx.lineTo(p[i] * k, p[i + 1] * k); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Lowest point of the ink, in page units. */
export const inkBottom = (strokes: InkStroke[]) => strokes.reduce((max, s) => {
  for (let i = 1; i < s.p.length; i += 3) max = Math.max(max, s.p[i] + s.w);
  return max;
}, 0);

/** True if the eraser at (x, y) touches the stroke. */
export function touches(stroke: InkStroke, x: number, y: number, radius: number) {
  const r = radius + stroke.w / 2;
  for (let i = 0; i < stroke.p.length; i += 3) {
    const dx = stroke.p[i] - x, dy = stroke.p[i + 1] - y;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

/** A picture of a handwritten page (white background) for copying and printing. */
export function inkPageImage(page: InkPage, width = 800) {
  const height = Math.max(120, Math.min(page.h ?? PAGE_START, inkBottom(page.s) + 30));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = Math.round(height * width / INK_WIDTH);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawInk(ctx, page.s, width);
  return canvas.toDataURL("image/png");
}

/** A clip's picture with the student's writing on top, for copying and printing. Needs the loaded <img>. */
export function inkOverImage(image: HTMLImageElement, page: InkPage) {
  if (!image.complete || !image.naturalWidth) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(image, 0, 0);
  drawInk(ctx, page.s, canvas.width);
  return canvas.toDataURL("image/jpeg", .9);
}

/** Keeps stored ink small: whole page units for position, a rounded pressure. */
export const packPoint = (x: number, y: number, pressure: number) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pressure * 100)];

export function isInkPage(value: unknown): value is InkPage {
  return !!value && typeof value === "object" && Array.isArray((value as InkPage).s)
    && (value as InkPage).s.every((s) => s && typeof s.c === "string" && typeof s.w === "number" && Array.isArray(s.p));
}
