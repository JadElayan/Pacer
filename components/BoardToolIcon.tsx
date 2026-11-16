import type { BoardTool } from "./Whiteboard";
import type { BoardShape } from "@/lib/types";

const paths = {
  select: "M5 3l14 10-7 1-3 7z",
  pen: "M4 20l4-1 12-12-3-3L5 16z M14 7l3 3",
  highlight: "M4 20h4l2-2-4-4-2 2z M6 14l9-10 5 5-10 9 M4 22h10",
  erase: "M5 16l9-11a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-7 8H9z M9 12l7 6 M14 20h7",
  sticky: "M5 3h14a2 2 0 0 1 2 2v9l-7 7H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M14 21v-7h7",
  shapes: "M3 3h7v7H3z M17 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M3 21l4-7 4 7z M15 21l6-6m-5 0h5v5",
  templates: "M3 4h18v16H3z M3 9h18 M10 9v11",
  text: "M5 7V4h14v3 M12 4v16 M8 20h8",
  equation: "M18 4H6l7 8-7 8h12",
  rectangle: "M3 6h18v12H3z",
  circle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  diamond: "m12 2 10 10-10 10L2 12z",
  arrow: "M3 12h17m-6-6 6 6-6 6",
  upload: "M12 16V3m-5 5 5-5 5 5 M4 15v5h16v-5",
  undo: "M9 5 4 10l5 5 M4 10h10a5 5 0 0 1 5 5v3",
  redo: "m15 5 5 5-5 5 M20 10H10a5 5 0 0 0-5 5v3",
} satisfies Record<BoardTool | BoardShape | "sticky" | "shapes" | "templates" | "text" | "equation" | "upload" | "undo" | "redo", string>;

export function boardToolCursor(tool: keyof typeof paths) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[tool]}" stroke="white" stroke-width="4"/><path d="${paths[tool]}" stroke="#243b81" stroke-width="2"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
}

export function BoardToolIcon({ tool }: { tool: keyof typeof paths }) {
  return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[tool]} /></svg>;
}
