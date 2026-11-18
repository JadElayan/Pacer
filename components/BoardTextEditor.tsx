"use client";
import { ChoiceMenu } from "./ChoiceMenu";

import { useLayoutEffect, useRef, useState } from "react";
import type { BoardTextRun, BoardTextStyle } from "@/lib/types";

const fonts = ["Default", "Arial", "Georgia", "Courier New"];
const colors = [["#17202a", "Black"], ["#2454e8", "Blue"], ["#b42335", "Red"], ["#18734b", "Green"], ["#7344a6", "Purple"]];
const sizes = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80];

function css(style: BoardTextStyle) {
  return { fontWeight: style.bold === undefined ? undefined : style.bold ? "700" : "400",
    fontSize: style.fontSize, fontFamily: style.fontFamily === "Default" ? "inherit" : style.fontFamily, color: style.color };
}

export function BoardText({ content, runs }: { content: string; runs?: BoardTextRun[] }) {
  return runs?.length ? runs.map(({ text, ...style }, index) => <span key={index} style={css(style)}>{text}</span>) : content;
}

function readRuns(root: HTMLElement): BoardTextRun[] {
  const runs: BoardTextRun[] = [];
  const append = (text: string, style: BoardTextStyle) => {
    if (!text) return;
    const previous = runs.at(-1);
    if (previous && previous.bold === style.bold && previous.fontFamily === style.fontFamily &&
      previous.fontSize === style.fontSize && previous.color === style.color) previous.text += text;
    else runs.push({ ...style, text });
  };
  const read = (node: Node, inherited: BoardTextStyle) => {
    if (node.nodeType === Node.TEXT_NODE) { append(node.textContent ?? "", inherited); return; }
    if (!(node instanceof HTMLElement)) return;
    const style = { ...inherited, ...JSON.parse(node.dataset.textStyle ?? "{}") } as BoardTextStyle;
    if (node.tagName === "BR") { append("\n", style); return; }
    if (node.matches("div,p") && runs.length && !runs.at(-1)?.text.endsWith("\n")) append("\n", style);
    node.childNodes.forEach((child) => read(child, style));
  };
  root.childNodes.forEach((node) => read(node, {}));
  return runs;
}

function applyStyle(element: HTMLElement, style: BoardTextStyle) {
  element.dataset.textStyle = JSON.stringify(style);
  const computed = css(style);
  element.style.fontWeight = computed.fontWeight ?? "";
  element.style.fontFamily = computed.fontFamily ?? "";
  element.style.color = computed.color ?? "";
  element.style.fontSize = computed.fontSize === undefined ? "" : `${computed.fontSize}px`;
}

export function BoardTextEditor({ content, runs, baseSize, toolbarAbove, onCommit }: {
  content: string; runs?: BoardTextRun[]; baseSize: number; toolbarAbove: boolean;
  onCommit: (content: string, runs?: BoardTextRun[]) => void;
}) {
  const toolbar = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const finished = useRef(false);
  const [style, setStyle] = useState<BoardTextStyle>({});
  useLayoutEffect(() => {
    const element = editor.current!;
    const fragment = document.createDocumentFragment();
    for (const { text, ...style } of runs?.length ? runs : [{ text: content }]) {
      const span = document.createElement("span");
      applyStyle(span, style);
      span.textContent = text;
      fragment.append(span);
    }
    element.replaceChildren(fragment);
    element.focus({ preventScroll: true });
    const initial = document.createRange();
    initial.selectNodeContents(element);
    initial.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(initial);
    const remember = () => {
      const selection = window.getSelection();
      if (document.activeElement !== element || !selection?.rangeCount ||
        !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return;
      range.current = selection.getRangeAt(0).cloneRange();
      const current: BoardTextStyle = {};
      let node = range.current.startContainer;
      if (!(node instanceof HTMLElement)) node = node.parentNode!;
      for (let parent = node as HTMLElement; parent && parent !== element; parent = parent.parentElement!) {
        Object.assign(current, { ...JSON.parse(parent.dataset.textStyle ?? "{}"), ...current });
      }
      setStyle(current);
    };
    document.addEventListener("selectionchange", remember);
    return () => document.removeEventListener("selectionchange", remember);
    // The browser owns the draft DOM until the edit is committed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    const bar = toolbar.current;
    const viewport = editor.current?.closest<HTMLElement>("[data-board-viewport]");
    if (!bar || !viewport) return;
    const align = () => {
      bar.style.translate = "";
      const bounds = viewport.getBoundingClientRect();
      const rect = bar.getBoundingClientRect();
      const scale = rect.width / Math.max(1, bar.offsetWidth);
      const offset = Math.max(bounds.left + 8 - rect.left, Math.min(0, bounds.right - 8 - rect.right));
      if (offset) bar.style.translate = `${offset / scale}px`;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(viewport);
    observer.observe(bar);
    viewport.addEventListener("scroll", align);
    return () => { observer.disconnect(); viewport.removeEventListener("scroll", align); };
  });

  const commit = () => {
    if (finished.current || !editor.current) return;
    finished.current = true;
    const values = readRuns(editor.current);
    const text = values.map((run) => run.text).join("");
    onCommit(text, values.some((run) => Object.keys(run).length > 1) ? values : undefined);
  };
  const format = (patch: BoardTextStyle) => {
    const saved = range.current;
    const element = editor.current;
    if (!element) return;
    const target = saved && element.contains(saved.commonAncestorContainer) ? saved.cloneRange() : document.createRange();
    if (!saved || target.collapsed) target.selectNodeContents(element);
    if (target.collapsed) return;
    const wrapper = document.createElement("span");
    const contents = target.extractContents();
    contents.querySelectorAll<HTMLElement>("[data-text-style]").forEach((span) => {
      applyStyle(span, { ...JSON.parse(span.dataset.textStyle ?? "{}"), ...patch });
    });
    applyStyle(wrapper, patch);
    wrapper.append(contents);
    target.insertNode(wrapper);
    target.selectNodeContents(wrapper);
    editor.current?.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(target);
    range.current = target.cloneRange();
    setStyle((current) => ({ ...current, ...patch }));
  };
  return <div data-board-editor className="relative min-w-12 cursor-text select-text"
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) commit();
    }}
    onKeyDown={(event) => {
      if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.stopPropagation(); commit(); }
    }}>
    <div ref={toolbar} role="toolbar" aria-label="Text formatting" className={`absolute left-0 z-30 flex w-max max-w-[80vw] items-center gap-1 rounded-xl border border-stone bg-white p-1.5 shadow-lg ${toolbarAbove ? "bottom-full mb-3" : "top-full mt-3"}`}>
      <div className="text-tool-menu" data-kind="font">
        <ChoiceMenu label="Font" value={style.fontFamily ?? "Default"} onChange={(value) => format({ fontFamily: value })}>
          {fonts.map((font) => <option key={font} value={font}><span style={{ fontFamily: font === "Default" ? undefined : font }}>{font}</span></option>)}
        </ChoiceMenu>
      </div>
      <div className="text-tool-menu" data-kind="size">
        <ChoiceMenu label="Font size" value={style.fontSize ?? baseSize} onChange={(value) => format({ fontSize: Number(value) })}>
          {[...new Set([...sizes, baseSize, style.fontSize ?? baseSize])].sort((a, b) => a - b).map((size) => <option key={size} value={size}>{size}</option>)}
        </ChoiceMenu>
      </div>
      <button type="button" aria-label="Bold" aria-pressed={!!style.bold} onMouseDown={(event) => event.preventDefault()} onClick={() => format({ bold: !style.bold })}
        className="grid size-8 place-items-center rounded-md font-bold hover:bg-sky-soft aria-pressed:bg-sky-soft">B</button>
      <div className="text-tool-menu" data-kind="color">
        <ChoiceMenu label="Text color" value={style.color ?? colors[0][0]} onChange={(value) => format({ color: value })}>
          {colors.map(([color, label]) => <option key={color} value={color}><span className="text-tool-swatch" style={{ background: color }} />{label}</option>)}
        </ChoiceMenu>
      </div>
    </div>
    <div ref={editor} role="textbox" aria-label="Edit board text" aria-multiline="true" contentEditable
      suppressContentEditableWarning className="min-h-[1.3em] whitespace-pre-wrap break-words leading-snug outline-none"
      onPaste={(event) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); }}
      onDrop={(event) => event.preventDefault()} />
  </div>;
}
