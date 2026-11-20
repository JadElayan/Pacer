/** Encodes a rendered slide page for upload. WebP keeps transparent areas and stays small; browsers that can't
 * write WebP (Safari on iPhone and iPad) silently return PNG, which the slide bucket rejects and which is often
 * over its 1 MB limit, so those get a JPEG on white instead. */
export async function slideBlob(canvas: HTMLCanvasElement, error: string): Promise<Blob> {
  const encode = (source: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob>((resolve, reject) =>
    source.toBlob((blob) => blob ? resolve(blob) : reject(new Error(error)), type, quality));
  const webp = await encode(canvas, "image/webp", 0.87);
  if (webp.type === "image/webp") return webp;
  const flat = document.createElement("canvas");
  flat.width = canvas.width; flat.height = canvas.height;
  const context = flat.getContext("2d");
  if (!context) throw new Error(error);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, flat.width, flat.height);
  context.drawImage(canvas, 0, 0);
  return encode(flat, "image/jpeg", 0.85);
}
