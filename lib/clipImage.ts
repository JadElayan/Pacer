/**
 * Tidies a clip before it goes into the notebook, without AI: trims the empty margin around the content (so a loose
 * box becomes just the diagram) and, on light backgrounds, turns near-white paper and compression speckle pure white.
 * Pictures with busy backgrounds (photos) are only trimmed where the border colour is even.
 */
export async function cleanClip(dataUrl: string): Promise<string> {
  try {
    const image = await load(dataUrl);
    const w = image.naturalWidth, h = image.naturalHeight;
    if (w < 24 || h < 24) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;

    // Background = the most common colour along the edges (quantized), if most of the edge agrees on it.
    const counts = new Map<number, number>();
    let edge = 0;
    const sample = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      const key = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | px[i + 2] >> 4;
      counts.set(key, (counts.get(key) ?? 0) + 1); edge++;
    };
    for (let x = 0; x < w; x += 2) { sample(x, 0); sample(x, h - 1); }
    for (let y = 0; y < h; y += 2) { sample(0, y); sample(w - 1, y); }
    const [bgKey, bgCount] = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a));
    if (bgCount < edge * .45) return dataUrl;
    const bg = [((bgKey >> 8) & 15) * 16 + 8, ((bgKey >> 4) & 15) * 16 + 8, (bgKey & 15) * 16 + 8];
    const light = bg[0] > 215 && bg[1] > 215 && bg[2] > 215;
    const near = (i: number) => Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) < (light ? 60 : 36);

    let top = h, left = w, right = -1, bottom = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (near(i)) {
          if (light) { px[i] = px[i + 1] = px[i + 2] = 255; }
          continue;
        }
        if (x < left) left = x; if (x > right) right = x;
        if (y < top) top = y; if (y > bottom) bottom = y;
      }
    }
    if (right < 0) return dataUrl; // nothing but background
    if (light) ctx.putImageData(data, 0, 0);
    const pad = Math.round(Math.max(8, Math.min(w, h) * .03));
    left = Math.max(0, left - pad); top = Math.max(0, top - pad);
    right = Math.min(w - 1, right + pad); bottom = Math.min(h - 1, bottom + pad);
    const cw = right - left + 1, ch = bottom - top + 1;
    // A speck of content in a big box is more likely noise than a diagram; keep the original then.
    if (cw * ch < w * h * .01) return dataUrl;
    const out = document.createElement("canvas");
    out.width = cw; out.height = ch;
    out.getContext("2d")?.drawImage(canvas, left, top, cw, ch, 0, 0, cw, ch);
    return out.toDataURL("image/jpeg", .9);
  } catch {
    return dataUrl;
  }
}

const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = src;
});
