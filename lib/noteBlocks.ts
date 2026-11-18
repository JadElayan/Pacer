// A topic's notes are one HTML string. Two markers inside it let the notebook treat parts of it as movable blocks:
//   <div data-block="clip:ID" data-w="70"></div>  where a clip from the board sits among the notes (width in %, optional)
//   <blockquote data-card="LABEL">…</blockquote>  a saved answer (Explanation (AI), Catch-up) shown as a card
// Everything between markers is ordinary note HTML, edited by its own RichNote.
// Keeping one string means storage, account sync, copy and export keep working unchanged.
// String-only (no DOM), so unit tests can load this file directly.

export type NoteBlock =
  | { kind: "text"; html: string }
  | { kind: "clip"; id: string; w?: number }
  | { kind: "card"; label: string; html: string };

const MARKER = /<div data-block="clip:([\w-]+)"(?: data-w="(\d+)")?><\/div>|<blockquote data-card="([^"]*)">/g;
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unattr = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Splits a topic's HTML into text, clip and card blocks, in order. */
export function parseBlocks(html: string): NoteBlock[] {
  const out: NoteBlock[] = [];
  let at = 0;
  MARKER.lastIndex = 0;
  for (let m = MARKER.exec(html); m; m = MARKER.exec(html)) {
    if (m.index > at) out.push({ kind: "text", html: html.slice(at, m.index) });
    if (m[1]) { out.push({ kind: "clip", id: m[1], ...(m[2] ? { w: Number(m[2]) } : {}) }); at = MARKER.lastIndex; continue; }
    // A card ends at its matching </blockquote>; quotes inside the card nest.
    let depth = 1, i = MARKER.lastIndex;
    const tag = /<blockquote\b[^>]*>|<\/blockquote>/g;
    tag.lastIndex = i;
    let end = html.length, close = html.length;
    for (let t = tag.exec(html); t; t = tag.exec(html)) {
      depth += t[0].startsWith("</") ? -1 : 1;
      if (depth === 0) { end = t.index; close = tag.lastIndex; break; }
    }
    out.push({ kind: "card", label: unattr(m[3]), html: html.slice(i, end) });
    at = close;
    MARKER.lastIndex = close;
  }
  if (at < html.length) out.push({ kind: "text", html: html.slice(at) });
  return out;
}

export function serializeBlocks(blocks: NoteBlock[]): string {
  return blocks.map((b) => b.kind === "text" ? b.html : b.kind === "clip" ? `<div data-block="clip:${b.id}"${b.w ? ` data-w="${Math.round(b.w)}"` : ""}></div>` : `<blockquote data-card="${attr(b.label)}">${b.html}</blockquote>`).join("");
}

const blank = (html: string) => !html.replace(/<br\s*\/?>|<\/?(div|p)>|&nbsp;|\s/gi, "");

/**
 * Tidies a block list: joins neighbouring text, and leaves exactly one (possibly empty) text block
 * after every clip or card so there is always somewhere to type below it.
 */
export function normalizeBlocks(blocks: NoteBlock[]): NoteBlock[] {
  const out: NoteBlock[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (b.kind === "text" && last?.kind === "text") { out[out.length - 1] = { kind: "text", html: blank(last.html) ? b.html : blank(b.html) ? last.html : last.html + b.html }; continue; }
    out.push(b);
  }
  const fixed: NoteBlock[] = [];
  out.forEach((b, i) => {
    fixed.push(b);
    if (b.kind !== "text" && out[i + 1]?.kind !== "text") fixed.push({ kind: "text", html: "" });
  });
  return fixed;
}

/** The blocks to show for a topic: drops clips that were deleted and adds this topic's clips not placed anywhere yet (older notes). */
export function blocksFor(html: string, clipIds: string[], unplaced: string[]): NoteBlock[] {
  const known = new Set(clipIds);
  const blocks = parseBlocks(html).filter((b) => b.kind !== "clip" || known.has(b.id));
  return normalizeBlocks([...blocks, ...unplaced.map((id) => ({ kind: "clip" as const, id }))]);
}

/** Every clip id placed in any topic's notes. */
export function placedClips(notes: Record<string, string | undefined>): Set<string> {
  const ids = new Set<string>();
  for (const html of Object.values(notes)) for (const b of parseBlocks(html ?? "")) if (b.kind === "clip") ids.add(b.id);
  return ids;
}

/** Moves block `from` so it lands before the block now at `to` (`to` may equal the length to move it to the end). */
export function moveBlock(blocks: NoteBlock[], from: number, to: number): NoteBlock[] {
  if (from === to || from + 1 === to) return blocks;
  const next = [...blocks];
  const [b] = next.splice(from, 1);
  next.splice(to > from ? to - 1 : to, 0, b);
  return normalizeBlocks(next);
}

/** Inserts a block before index `at`, optionally splitting the text block at `at` into two halves first. */
export function insertBlock(blocks: NoteBlock[], block: NoteBlock, at: number, split?: [string, string]): NoteBlock[] {
  const next = [...blocks];
  if (split && next[at]?.kind === "text") {
    next.splice(at, 1, { kind: "text", html: split[0] }, block, { kind: "text", html: split[1] });
    return normalizeBlocks(next);
  }
  next.splice(at, 0, block);
  return normalizeBlocks(next);
}

export function removeBlock(blocks: NoteBlock[], i: number): NoteBlock[] {
  return normalizeBlocks(blocks.filter((_, j) => j !== i));
}

/** "Turn into notes": a card becomes ordinary text with its label as a bold first line. */
export function cardToText(blocks: NoteBlock[], i: number): NoteBlock[] {
  const b = blocks[i];
  if (b?.kind !== "card") return blocks;
  return normalizeBlocks(blocks.map((x, j) => j === i ? { kind: "text", html: `<div><strong>${attr(b.label)}</strong></div>${b.html}` } : x));
}

/** Appends a saved answer as a card at the end of a topic's notes. */
export function appendCard(html: string, label: string, body: string): string {
  return serializeBlocks(normalizeBlocks([...parseBlocks(html), { kind: "card", label, html: body }]));
}
