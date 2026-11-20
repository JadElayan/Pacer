import { renderPdf } from "./renderPdf";
import type { LocalSlide } from "./slides";

const office = ["ppt", "pptx", "odp", "doc", "docx", "odt", "rtf"];
const images = ["png", "jpg", "jpeg", "webp"];
const canConvertOffice = process.env.NODE_ENV === "development";
// Extensions plus MIME types: phones (iOS Safari, Android) match files by type and grey out anything not listed that way.
const mimeTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/markdown"];
export const lectureFormats = [...["pdf", ...images, "txt", "md", ...(canConvertOffice ? office : [])].map((ext) => `.${ext}`), ...mimeTypes].join(",");

async function deckStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("pacer-slide-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("decks");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("decks", mode);
      const request = operation(transaction.objectStore("decks"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export const rememberDeck = (id: string, pages: LocalSlide[]) => deckStore("readwrite", (store) => store.put(pages, id));
export const recoverDeck = (id: string) => deckStore<LocalSlide[] | undefined>("readonly", (store) => store.get(id));

async function encode(canvas: HTMLCanvasElement, text = ""): Promise<LocalSlide> {
  const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Could not render this page.")), "image/webp", 0.87,
  ));
  return { id: crypto.randomUUID(), width: canvas.width, height: canvas.height, text, image };
}

export async function importLecture(file: File): Promise<LocalSlide[]> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a file under 20 MB.");
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (extension === "pdf") return renderPdf(file);
  if (office.includes(extension)) {
    if (!canConvertOffice) throw new Error("Export your slides or document to PDF to preserve the original formatting.");
    const response = await fetch(`/api/convert-lecture?format=${extension}`, { method: "POST", body: file });
    if (!response.ok) throw new Error(response.status === 422 ? await response.text() : "Office import failed. Try exporting the file to PDF.");
    return renderPdf(new File([await response.blob()], "lecture.pdf"));
  }
  if (images.includes(extension)) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return [await encode(canvas)];
    } finally { bitmap.close(); }
  }
  if (extension === "txt" || extension === "md") {
    const content = (await file.text()).trimEnd();
    if (!content.trim()) throw new Error("This notes file is empty.");
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 720;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "24px monospace";
    const columns = Math.floor(904 / ctx.measureText("W").width);
    const lines = content.replaceAll("\t", "    ").split(/\r?\n/).flatMap((line) => {
      const chars = Array.from(line);
      return Array.from({ length: Math.max(1, Math.ceil(chars.length / columns)) },
        (_, i) => chars.slice(i * columns, (i + 1) * columns).join(""));
    });
    if (lines.length > 1000) throw new Error("These notes exceed 50 pages. Split them into shorter files.");
    const pages: LocalSlide[] = [];
    for (let i = 0; i < lines.length; i += 20) {
      const page = lines.slice(i, i + 20);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#17202a";
      page.forEach((line, row) => ctx.fillText(line, 48, 54 + row * 31, 904));
      pages.push(await encode(canvas, page.join("\n").slice(0, 1200)));
    }
    return pages;
  }
  throw new Error("Export this file to PDF before uploading it to Pacer.");
}
