import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  const path = join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs");
  return new Response(await readFile(path, "utf8"), {
    headers: { "Content-Type": "text/javascript", "Cache-Control": "public, max-age=3600" },
  });
}
