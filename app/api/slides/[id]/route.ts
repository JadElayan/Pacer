import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const directory = join(process.cwd(), ".pacer-slides");
type Context = { params: Promise<{ id: string }> };

function pathFor(id: string) {
  return process.env.NODE_ENV === "development" && /^[a-f0-9-]{36}$/.test(id)
    ? join(directory, `${id}.jpg`) : null;
}

function imageType(bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216) return "image/jpeg";
  const header = Buffer.from(bytes.subarray(0, 12));
  if (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") return "image/webp";
}

export async function PUT(request: Request, { params }: Context) {
  const path = pathFor((await params).id);
  if (!path) return new Response(null, { status: 404 });
  const length = Number(request.headers.get("content-length"));
  const type = request.headers.get("content-type");
  if ((type !== "image/jpeg" && type !== "image/webp") || !length || length > 1_000_000) {
    return new Response(null, { status: 415 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length !== length || imageType(bytes) !== type) return new Response(null, { status: 400 });
  await mkdir(directory, { recursive: true });
  try { await writeFile(path, bytes, { flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  return new Response(null, { status: 204 });
}

export async function GET(_request: Request, { params }: Context) {
  const path = pathFor((await params).id);
  if (!path) return new Response(null, { status: 404 });
  try {
    const bytes = await readFile(path);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": imageType(bytes) ?? "application/octet-stream", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Response(null, { status: 404 });
    throw error;
  }
}
