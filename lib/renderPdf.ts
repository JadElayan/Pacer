import { slideBlob } from "./slideImage";
import type { LocalSlide } from "./slides";

export async function renderPdf(file: File): Promise<LocalSlide[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a PDF under 20 MB.");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/api/pdf-worker";
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), enableXfa: false });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 50) throw new Error("Choose a PDF with up to 50 pages.");
    const slides: LocalSlide[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const size = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 1200 / Math.max(size.width, size.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport, background: "#fff" }).promise;
      const image = await slideBlob(canvas, "Could not render a PDF page.");
      const content = await page.getTextContent();
      const text = content.items.flatMap((item) => "str" in item ? [item.str] : []).join(" ").slice(0, 1200);
      slides.push({ id: crypto.randomUUID(), width: canvas.width, height: canvas.height, text, image });
      page.cleanup();
    }
    return slides;
  } finally {
    await task.destroy();
  }
}
