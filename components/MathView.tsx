"use client";
import katex from "katex";
import { useMemo } from "react";
export function MathView({ tex, display = true }: { tex: string; display?: boolean }) {
  const html = useMemo(() => katex.renderToString(tex, { throwOnError: false, displayMode: display }), [tex, display]);
  return <span aria-label={tex} role="math" dangerouslySetInnerHTML={{ __html: html }} />;
}
