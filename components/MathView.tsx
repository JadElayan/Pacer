"use client";
import katex from "katex";
import { useMemo } from "react";
export function MathView({ tex, display = true }: { tex: string; display?: boolean }) {
  const html = useMemo(() => katex.renderToString(tex, { throwOnError: false, displayMode: display }), [tex, display]);
  return <span aria-label={tex} role="math" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The characters KaTeX shows on screen for a formula (for accessible names that must include the visible text). */
export function mathVisibleText(tex: string) {
  const html = katex.renderToString(tex, { throwOnError: false, displayMode: false });
  const visible = html.split('class="katex-html"')[1] ?? html;
  return visible.replace(/<[^>]*>/g, "").replace(/&[a-z]+;|&#\d+;/g, " ").replace(/[​⁡]/g, "").replace(/\s+/g, " ").trim();
}
