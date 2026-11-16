import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const formats = new Set(["ppt", "pptx", "odp", "doc", "docx", "odt", "rtf"]);

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const extension = new URL(request.url).searchParams.get("format") ?? "";
  const length = Number(request.headers.get("content-length"));
  if (!formats.has(extension) || !length || length > 20 * 1024 * 1024) {
    return new Response("Choose a supported file under 20 MB.", { status: 400 });
  }
  const dir = await mkdtemp(join(tmpdir(), "pacer-office-"));
  try {
    const source = join(dir, `lesson.${extension}`);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length !== length) return new Response("Upload size did not match.", { status: 400 });
    await writeFile(source, bytes);
    const executable = process.env.PACER_SOFFICE || (process.platform === "win32"
      ? "C:\\Program Files\\LibreOffice\\program\\soffice.com" : "soffice");
    await run(executable, [
      `-env:UserInstallation=${pathToFileURL(join(dir, "profile")).href}`,
      "--headless", "--convert-to", "pdf", "--outdir", dir, source,
    ], { timeout: 45000, windowsHide: true });
    return new Response(new Uint8Array(await readFile(join(dir, "lesson.pdf"))), {
      headers: { "Content-Type": "application/pdf" },
    });
  } catch (error) {
    return new Response((error as NodeJS.ErrnoException).code === "ENOENT"
      ? "Office import needs LibreOffice and a convertible file. Export to PDF to preserve the original layout."
      : "Pacer could not convert this file. Export it to PDF and try again.", { status: 422 });
  } finally {
    // The directory was created by this request and contains only conversion files.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
