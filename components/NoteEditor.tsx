"use client";

/**
 * Docs-style note editing: a rich-text box per topic plus one shared toolbar.
 * Formatting uses the browser's editing commands (execCommand), which are deprecated on paper but are still
 * the only editing API every browser ships for contenteditable, and they keep Ctrl+Z / Ctrl+Y working.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { escapeHtml, noteHtml, sanitizeNoteHtml, textToHtml } from "@/lib/noteHtml";

const run = (command: string, value?: string) => document.execCommand(command, false, value);
const selectionElement = () => {
  const node = window.getSelection()?.anchorNode;
  return node ? (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement) : null;
};
const activeEditor = () => selectionElement()?.closest<HTMLElement>(".nb-rich") ?? null;
const changed = (editor: HTMLElement | null) => editor?.dispatchEvent(new Event("input", { bubbles: true }));

export type Format =
  | "undo" | "redo" | "bold" | "italic" | "underline" | "strikeThrough"
  | "insertUnorderedList" | "insertOrderedList" | "checklist" | "indent" | "outdent" | "removeFormat";
export type Block = "div" | "h2" | "h3" | "h4";

/** Turns the current bullet list into a checklist, or back. */
function toggleChecklist(editor: HTMLElement) {
  let list = selectionElement()?.closest("ul, ol");
  if (list?.hasAttribute("data-checklist")) {
    list.removeAttribute("data-checklist");
    list.querySelectorAll(":scope > li[data-checked]").forEach((li) => li.removeAttribute("data-checked"));
    return;
  }
  if (!list || list.tagName === "OL") { run("insertUnorderedList"); list = selectionElement()?.closest("ul"); }
  if (list && editor.contains(list)) list.setAttribute("data-checklist", "true");
}

export function applyFormat(format: Format | `block:${Block}` | `align:${"left" | "center" | "right"}` | `color:${string}` | `highlight:${string}`) {
  const editor = activeEditor();
  if (!editor) return;
  run("styleWithCSS", "true");
  if (format === "checklist") toggleChecklist(editor);
  else if (format.startsWith("block:")) run("formatBlock", format.slice(6));
  else if (format.startsWith("align:")) run({ left: "justifyLeft", center: "justifyCenter", right: "justifyRight" }[format.slice(6) as "left"]);
  else if (format.startsWith("color:")) run("foreColor", format.slice(6));
  else if (format.startsWith("highlight:")) run("hiliteColor", format.slice(10) === "none" ? "transparent" : format.slice(10));
  else run(format);
  changed(editor);
}

/** "- ", "* ", "1. ", "[] " and "# " at the start of a line become a list, checklist or heading, like Google Docs. */
function markdownShortcut(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== " " || event.nativeEvent.isComposing) return false;
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  // The marker must start a line: nothing before it, or only a line break or block (like an indented section).
  const before = node.previousSibling;
  const startsLine = !before || before.nodeName === "BR" || /^(DIV|P|BLOCKQUOTE|UL|OL|H2|H3|H4)$/.test(before.nodeName);
  if (node.nodeType !== Node.TEXT_NODE || !startsLine) return false;
  const typed = node.textContent!.slice(0, range.startOffset);
  const action: Format | `block:${Block}` | "" = typed === "-" || typed === "*" ? "insertUnorderedList" : typed === "1." ? "insertOrderedList"
    : typed === "[]" ? "checklist" : typed === "#" ? "block:h3" : typed === "##" ? "block:h4" : "";
  if (!action || (!action.startsWith("block:") && node.parentElement?.closest("li"))) return false;
  event.preventDefault();
  // Convert first, then remove the typed marker: browsers won't format an empty line.
  applyFormat(action);
  const after = window.getSelection();
  const text = after?.rangeCount ? after.getRangeAt(0).startContainer : null;
  if (!after || text?.nodeType !== Node.TEXT_NODE || !text.textContent!.startsWith(typed)) return true;
  text.textContent = text.textContent!.slice(typed.length);
  const block = text.parentElement;
  if (!text.textContent && block && !block.querySelector("br")) block.append(document.createElement("br"));
  const caret = document.createRange();
  caret.setStart(text, 0);
  caret.collapse(true);
  after.removeAllRanges();
  after.addRange(caret);
  changed(event.currentTarget);
  return true;
}

const SHORTCUTS: Record<string, Format | `block:${Block}`> = {
  "shift+7": "insertOrderedList", "shift+8": "insertUnorderedList", "shift+9": "checklist", "shift+x": "strikeThrough",
  "alt+0": "block:div", "alt+1": "block:h2", "alt+2": "block:h3", "alt+3": "block:h4",
};

/** One topic's notes. Ctrl/⌘ shortcuts follow Google Docs; Tab indents, Shift+Tab outdents. */
export function RichNote({ value, placeholder, label, onChange, onFocus }: {
  value: string; placeholder: string; label: string; onChange: (html: string) => void; onFocus: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const html = noteHtml(value);
  // Only write into the editor when the change came from elsewhere (loading, "Add to my notes"), never while typing.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== html && document.activeElement !== el) el.innerHTML = sanitizeNoteHtml(html);
  }, [html]);
  const emit = (el: HTMLDivElement) => {
    // An emptied editor keeps a stray <br>; clear it so the placeholder shows again.
    if (!el.textContent && !el.querySelector("li, h2, h3, h4, blockquote")) el.innerHTML = "";
    // Save a cleaned copy: browsers add stray inline styles while editing, and only safe formatting is kept.
    onChange(sanitizeNoteHtml(el.innerHTML));
  };
  return <div ref={ref} role="textbox" aria-multiline="true" aria-label={label} contentEditable suppressContentEditableWarning spellCheck
    className="nb-text nb-rich" data-placeholder={placeholder}
    onFocus={() => { run("styleWithCSS", "true"); onFocus(); }}
    onInput={(event) => emit(event.currentTarget)}
    onBlur={(event) => emit(event.currentTarget)}
    onPaste={(event) => {
      event.preventDefault();
      const pasted = event.clipboardData.getData("text/html");
      run("insertHTML", pasted ? sanitizeNoteHtml(pasted) : textToHtml(event.clipboardData.getData("text/plain")));
    }}
    onMouseDown={(event) => {
      // Clicking a checklist box ticks it.
      const item = (event.target as Element).closest("li");
      if (!item?.parentElement?.hasAttribute("data-checklist") || event.clientX > item.getBoundingClientRect().left + 22) return;
      event.preventDefault();
      if (item.getAttribute("data-checked") === "true") item.removeAttribute("data-checked"); else item.setAttribute("data-checked", "true");
      emit(event.currentTarget);
    }}
    onClick={(event) => {
      // Ctrl/⌘+click opens a link, as in Docs (a plain click just places the cursor).
      const link = (event.target as Element).closest("a");
      if (link && (event.ctrlKey || event.metaKey)) window.open(link.href, "_blank", "noopener,noreferrer");
    }}
    onKeyDown={(event) => {
      if (markdownShortcut(event)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "k") { event.preventDefault(); window.dispatchEvent(new Event("pacer:note-link")); return; }
      const combo = mod ? `${event.shiftKey ? "shift+" : ""}${event.altKey ? "alt+" : ""}${event.code.replace(/^(Key|Digit)/, "").toLowerCase()}` : "";
      if (SHORTCUTS[combo]) { event.preventDefault(); applyFormat(SHORTCUTS[combo]); return; }
      if (event.key === "Tab") { event.preventDefault(); applyFormat(event.shiftKey ? "outdent" : "indent"); return; }
      // A new checklist item starts unticked.
      if (event.key === "Enter" && selectionElement()?.closest("ul[data-checklist]")) {
        requestAnimationFrame(() => selectionElement()?.closest("li")?.removeAttribute("data-checked"));
      }
    }} />;
}

/* ---------- toolbar ---------- */

const Icon = ({ d, size = 18 }: { d: string; size?: number }) =>
  <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const ICONS = {
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  bullets: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  numbers: "M10 6h10M10 12h10M10 18h10M4 4.5h1v4M4 8.5h2M4 14.3c.4-.6 2-.8 2 .3 0 .9-2 1.6-2 3.4h2",
  checklist: "M11 6h9M11 12h9M11 18h9M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M4 17h3v3H4z",
  outdent: "M21 6H11M21 12h-8M21 18H11M7 9l-3 3 3 3",
  indent: "M21 6H11M21 12h-8M21 18H11M4 9l3 3-3 3",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  left: "M4 6h16M4 12h10M4 18h14",
  center: "M4 6h16M7 12h10M5 18h14",
  right: "M4 6h16M10 12h10M6 18h14",
  clear: "M4 7V5h12v2M10 5l-3 14M13 19H5M15 14l5 5M20 14l-5 5",
};
const TEXT_COLORS = [["Default", "#1f2540"], ["Gray", "#6b7280"], ["Red", "#c2410c"], ["Orange", "#b45309"], ["Green", "#15803d"], ["Blue", "#1d4ed8"], ["Purple", "#7e22ce"]] as const;
const HIGHLIGHTS = [["None", "none"], ["Yellow", "#fef08a"], ["Green", "#bbf7d0"], ["Blue", "#bfdbfe"], ["Pink", "#fbcfe8"], ["Orange", "#fed7aa"]] as const;
const BLOCKS: [Block, string][] = [["div", "Normal text"], ["h2", "Title"], ["h3", "Heading"], ["h4", "Subheading"]];

/** A toolbar dropdown that never takes focus from the editor, so the text selection survives. */
function Dropdown({ label, title, button, children, wide }: { label: string; title: string; button: ReactNode; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return <span ref={box} className="relative inline-flex">
    <button type="button" className={`nb-fmt ${wide ? "nb-fmt-wide" : ""}`} aria-label={label} title={title} aria-haspopup="true" aria-expanded={open}
      onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((v) => !v)}>{button}<span aria-hidden className="nb-caret">▾</span></button>
    {open && <span role="menu" className="nb-menu" onMouseDown={(event) => event.preventDefault()}>{children(() => setOpen(false))}</span>}
  </span>;
}

/** The formatting bar. It acts on whichever topic editor has the cursor, or the active topic's editor. */
export function FormatBar({ target }: { target: () => HTMLElement | null }) {
  const [state, setState] = useState<Record<string, boolean | string>>({});
  const [linking, setLinking] = useState<{ url: string; range?: Range } | null>(null);
  useEffect(() => {
    const read = () => {
      const el = selectionElement();
      if (!el?.closest(".nb-rich")) return;
      const block = String(document.queryCommandValue("formatBlock")).toLowerCase();
      setState({
        bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"), strikeThrough: document.queryCommandState("strikeThrough"),
        insertOrderedList: document.queryCommandState("insertOrderedList"),
        checklist: !!el.closest("ul[data-checklist]"),
        insertUnorderedList: document.queryCommandState("insertUnorderedList") && !el.closest("ul[data-checklist]"),
        block: ["h2", "h3", "h4"].includes(block) ? block : "div",
        align: document.queryCommandState("justifyCenter") ? "center" : document.queryCommandState("justifyRight") ? "right" : "left",
        link: !!el.closest("a"),
        undo: document.queryCommandEnabled("undo"), redo: document.queryCommandEnabled("redo"),
      });
    };
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, []);
  /** Puts the cursor in an editor before formatting, if none has it yet. */
  const ready = () => {
    if (activeEditor()) return true;
    const editor = target();
    if (!editor) return false;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    return true;
  };
  const apply = (format: Parameters<typeof applyFormat>[0]) => { if (ready()) applyFormat(format); };

  const openLink = () => {
    if (!ready()) return;
    const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).cloneRange() : undefined;
    const existing = selectionElement()?.closest("a")?.getAttribute("href") ?? "";
    setLinking({ url: existing, range });
  };
  useEffect(() => {
    const listener = () => openLink();
    window.addEventListener("pacer:note-link", listener);
    return () => window.removeEventListener("pacer:note-link", listener);
  });
  const saveLink = (remove = false) => {
    if (!linking) return;
    const { range } = linking;
    const editor = range ? (range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement)?.closest<HTMLElement>(".nb-rich") : null;
    setLinking(null);
    if (!editor || !range) return;
    editor.focus();
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    if (remove) { run("unlink"); changed(editor); return; }
    let url = linking.url.trim();
    if (!url) return;
    if (!/^(https?:|mailto:)/i.test(url)) url = `https://${url}`;
    if (range.collapsed) run("insertHTML", `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>&nbsp;`);
    else run("createLink", url);
    changed(editor);
  };

  const button = (format: Format, label: string, content: ReactNode, pressed?: boolean, disabled?: boolean) =>
    <button type="button" className="nb-fmt" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled}
      onMouseDown={(event) => event.preventDefault()} onClick={() => apply(format)}>{content}</button>;
  const sep = <span aria-hidden="true" className="nb-format-sep" />;
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

  return <div className="nb-format-wrap">
    <div role="toolbar" aria-label="Text formatting" className="nb-format">
      {button("undo", `Undo (${mod}Z)`, <Icon d={ICONS.undo} />, undefined, state.undo === false)}
      {button("redo", `Redo (${mod}Y)`, <Icon d={ICONS.redo} />, undefined, state.redo === false)}
      {sep}
      <Dropdown label={`Text style: ${BLOCKS.find(([b]) => b === state.block)?.[1] ?? "Normal text"}`} title="Text style" wide
        button={<span className="nb-fmt-style">{BLOCKS.find(([b]) => b === state.block)?.[1] ?? "Normal text"}</span>}>
        {(close) => BLOCKS.map(([block, name]) => <button key={block} type="button" role="menuitemradio" aria-checked={(state.block ?? "div") === block}
          className={`nb-menu-item nb-style-${block}`} onClick={() => { apply(`block:${block}`); close(); }}>{name}</button>)}
      </Dropdown>
      {sep}
      {button("bold", `Bold (${mod}B)`, <b>B</b>, !!state.bold)}
      {button("italic", `Italic (${mod}I)`, <i className="font-serif">I</i>, !!state.italic)}
      {button("underline", `Underline (${mod}U)`, <u>U</u>, !!state.underline)}
      {button("strikeThrough", `Strikethrough (${mod}Shift+X)`, <s>S</s>, !!state.strikeThrough)}
      <Dropdown label="Text color" title="Text color" button={<span className="nb-fmt-color">A</span>}>
        {(close) => <span className="nb-swatches">{TEXT_COLORS.map(([name, color]) => <button key={name} type="button" role="menuitem" aria-label={name} title={name}
          className="nb-swatch" style={{ background: color }} onClick={() => { apply(`color:${color}`); close(); }} />)}</span>}
      </Dropdown>
      <Dropdown label="Highlight color" title="Highlight" button={<span className="nb-fmt-mark">A</span>}>
        {(close) => <span className="nb-swatches">{HIGHLIGHTS.map(([name, color]) => <button key={name} type="button" role="menuitem" aria-label={`${name} highlight`} title={name}
          className={`nb-swatch ${color === "none" ? "nb-swatch-none" : ""}`} style={color === "none" ? undefined : { background: color }}
          onClick={() => { apply(`highlight:${color}`); close(); }} />)}</span>}
      </Dropdown>
      <button type="button" className="nb-fmt" aria-label={`Link (${mod}K)`} title={`Link (${mod}K)`} aria-pressed={!!state.link}
        onMouseDown={(event) => event.preventDefault()} onClick={openLink}><Icon d={ICONS.link} /></button>
      {sep}
      <Dropdown label="Align" title="Align" button={<Icon d={ICONS[(state.align as "left" | "center" | "right") ?? "left"] ?? ICONS.left} />}>
        {(close) => (["left", "center", "right"] as const).map((side) => <button key={side} type="button" role="menuitemradio" aria-checked={(state.align ?? "left") === side}
          className="nb-menu-item nb-menu-icon" onClick={() => { apply(`align:${side}`); close(); }}><Icon d={ICONS[side]} />Align {side}</button>)}
      </Dropdown>
      {button("insertUnorderedList", `Bulleted list (${mod}Shift+8)`, <Icon d={ICONS.bullets} />, !!state.insertUnorderedList)}
      {button("insertOrderedList", `Numbered list (${mod}Shift+7)`, <Icon d={ICONS.numbers} />, !!state.insertOrderedList)}
      {button("checklist", `Checklist (${mod}Shift+9)`, <Icon d={ICONS.checklist} />, !!state.checklist)}
      {button("outdent", "Decrease indent (Shift+Tab)", <Icon d={ICONS.outdent} />)}
      {button("indent", "Increase indent (Tab)", <Icon d={ICONS.indent} />)}
      {sep}
      {button("removeFormat", "Clear formatting", <Icon d={ICONS.clear} />)}
    </div>
    {linking && <form className="nb-link-form" onSubmit={(event) => { event.preventDefault(); saveLink(); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setLinking(null); } }}>
      <input autoFocus aria-label="Link address" className="input !min-h-8 !text-sm" placeholder="Paste a link, e.g. khanacademy.org"
        value={linking.url} onChange={(event) => setLinking({ ...linking, url: event.target.value })} />
      <button className="btn btn-primary btn-sm" disabled={!linking.url.trim()}>Apply</button>
      {state.link && <button type="button" className="btn btn-outline btn-sm" onClick={() => saveLink(true)}>Remove</button>}
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setLinking(null)}>Cancel</button>
    </form>}
  </div>;
}
