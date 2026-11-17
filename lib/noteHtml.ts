/**
 * Student notes are stored as a small, safe subset of HTML so they can carry Docs-style formatting:
 * bold, italic, underline, strikethrough, text and highlight colors, links, title/heading/subheading,
 * alignment, indents, bulleted, numbered and check lists. Older notes were plain text; noteHtml() converts them.
 */

const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "S", "H2", "H3", "H4", "UL", "OL", "LI", "P", "DIV", "BR", "MARK", "SPAN", "A", "BLOCKQUOTE"]);
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT", "SVG", "MATH", "IMG", "VIDEO", "AUDIO", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "META", "LINK", "TITLE"]);
/** Elements whose alignment is kept. */
const ALIGNABLE = new Set(["DIV", "P", "H2", "H3", "H4", "LI", "BLOCKQUOTE"]);
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))$/i;
const SAFE_LINK = /^(https?:|mailto:)/i;

export const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const isHtml = (value: string) => /^\s*<(div|p|ul|ol|h[2-4]|strong|b|em|i|u|s|mark|span|a|blockquote|br)\b/i.test(value);

/** Plain text (with "•", "-", "*" or "1." list lines) to note HTML. */
export function textToHtml(text: string): string {
  const out: string[] = [];
  const open: { list: { tag: "ul" | "ol"; items: string[] } | null } = { list: null };
  const close = () => {
    const list = open.list;
    if (list) out.push(`<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.tag}>`);
    open.list = null;
  };
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const bullet = line.match(/^\s*[•\-*]\s+(.*)$/);
    const number = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const tag = bullet ? "ul" : number ? "ol" : null;
    if (tag) {
      if (open.list?.tag !== tag) { close(); open.list = { tag, items: [] }; }
      open.list!.items.push(escapeHtml((bullet ?? number)![1]));
      continue;
    }
    close();
    out.push(line.trim() ? `<div>${escapeHtml(line)}</div>` : "<div><br></div>");
  }
  close();
  return out.join("");
}

/** Any stored note (HTML or older plain text) as note HTML. */
export const noteHtml = (value: string | undefined) => !value ? "" : isHtml(value) ? value : textToHtml(value);

const decode = (text: string) => text.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** Note HTML to readable plain text: lists keep their bullets, numbers and checkboxes. Works without a DOM. */
export function htmlToText(value: string | undefined): string {
  if (!value) return "";
  if (!isHtml(value)) return value.trim();
  return decode(value
    .replace(/<ul[^>]*data-checklist[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner: string) =>
      `\n${inner.replace(/<li([^>]*)>/gi, (__, attrs: string) => /data-checked="true"/.test(attrs) ? "\n☑ " : "\n☐ ")}\n`)
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner: string) => { let n = 0; return `\n${inner.replace(/<li[^>]*>/gi, () => `\n${++n}. `)}\n`; })
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/li>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(div|p|h[2-4]|ul|ol|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .split("\n").map((line) => line.replace(/\s+$/, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export const hasNoteText = (value: string | undefined) =>
  !!value && decode(isHtml(value) ? value.replace(/<[^>]+>/g, "") : value).trim().length > 0;

/** Keeps only safe style values: alignment on blocks, text and highlight colors on spans. */
function cleanStyle(el: HTMLElement): string {
  const out: string[] = [];
  const align = el.style.textAlign;
  if (ALIGNABLE.has(el.tagName) && /^(left|center|right|justify)$/.test(align) && align !== "left") out.push(`text-align: ${align}`);
  if (el.tagName === "SPAN") {
    const color = el.style.color;
    if (SAFE_COLOR.test(color) && !/^rgb\(0, 0, 0\)$/.test(color)) out.push(`color: ${color}`);
    const background = el.style.backgroundColor;
    if (SAFE_COLOR.test(background) && !/rgba\(0, 0, 0, 0\)/.test(background)) out.push(`background-color: ${background}`);
  }
  return out.join("; ");
}

/**
 * Turns styled spans (how Google Docs and Word mark bold, italic, underline and strikethrough when you paste)
 * into the matching tags, and drops the "not bold" wrapper Docs puts around a paste.
 */
function unstyle(el: HTMLElement): Node {
  const style = el.style;
  const weight = style.fontWeight;
  if ((el.tagName === "B" || el.tagName === "STRONG") && (weight === "normal" || Number(weight) > 0 && Number(weight) < 600)) {
    const fragment = document.createDocumentFragment();
    fragment.append(...el.childNodes);
    return fragment;
  }
  if (el.tagName !== "SPAN" && el.tagName !== "FONT") return el;
  if (el.tagName === "FONT") {
    const color = el.getAttribute("color");
    if (color) style.color = color;
  }
  const wraps: string[] = [];
  if (weight === "bold" || Number(weight) >= 600) wraps.push("strong");
  if (style.fontStyle === "italic") wraps.push("em");
  if (/underline/.test(style.textDecoration || style.textDecorationLine)) wraps.push("u");
  if (/line-through/.test(style.textDecoration || style.textDecorationLine)) wraps.push("s");
  const span = document.createElement("span");
  span.setAttribute("style", el.getAttribute("style") ?? "");
  const kept = cleanStyle(span);
  let inner: Node = document.createDocumentFragment();
  (inner as DocumentFragment).append(...el.childNodes);
  for (const tag of wraps.reverse()) { const wrap = document.createElement(tag); wrap.append(inner); inner = wrap; }
  if (!kept) return inner;
  const out = document.createElement("span");
  out.setAttribute("style", kept);
  out.append(inner);
  return out;
}

/** Keeps only the formatting above, with safe attributes. Browser only (uses the DOM). */
export function sanitizeNoteHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  const clean = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as HTMLElement;
      if (DROP.has(el.tagName)) { el.remove(); continue; }
      const replaced = unstyle(el);
      if (replaced !== el) {
        // The replacement itself is already clean; only what's inside it still needs checking.
        clean(replaced);
        el.replaceWith(replaced);
        continue;
      }
      clean(el);
      if (!ALLOWED.has(el.tagName)) {
        // Headings and paragraphs from other apps become lines; anything else keeps just its contents.
        const heading = el.tagName.match(/^H([1-6])$/)?.[1];
        const block = heading || /^(SECTION|ARTICLE|PRE|TR|HEADER|FOOTER|TABLE|TBODY)$/.test(el.tagName);
        const replacement = block ? document.createElement(heading ? (heading === "1" ? "h2" : heading === "2" ? "h3" : "h4") : "div") : document.createDocumentFragment();
        replacement.append(...el.childNodes);
        el.replaceWith(replacement);
        continue;
      }
      const href = el.tagName === "A" ? el.getAttribute("href")?.trim() ?? "" : "";
      const style = cleanStyle(el);
      const checklist = el.tagName === "UL" && el.hasAttribute("data-checklist");
      const checked = el.tagName === "LI" && el.getAttribute("data-checked") === "true";
      for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
      if (el.tagName === "A") {
        if (!SAFE_LINK.test(href)) { const text = document.createDocumentFragment(); text.append(...el.childNodes); el.replaceWith(text); continue; }
        el.setAttribute("href", href);
      }
      if (style) el.setAttribute("style", style);
      if (checklist) el.setAttribute("data-checklist", "true");
      if (checked) el.setAttribute("data-checked", "true");
      // A span with nothing left to say is just its text.
      if (el.tagName === "SPAN" && !el.attributes.length) { const text = document.createDocumentFragment(); text.append(...el.childNodes); el.replaceWith(text); }
    }
  };
  clean(template.content);
  return template.innerHTML;
}
