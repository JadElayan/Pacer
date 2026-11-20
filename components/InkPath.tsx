import type { Stroke } from "@/lib/types";
import { memo } from "react";

// A tap (or the first frame of a stroke) has a single point. Drawn as a zero-length line, Safari on iPad
// paints a huge ellipse instead of a dot, because the board's 0–1 viewBox is stretched unevenly and the
// line uses a non-scaling stroke. A tiny real segment (about 1px) draws the dot correctly everywhere.
const DOT = 0.001;

export const InkPath = memo(function InkPath({ stroke }: { stroke: Omit<Stroke, "id"> }) {
  const [first] = stroke.pts;
  const flat = stroke.pts.every(([x, y]) => x === first[0] && y === first[1]);
  const points = flat ? [first, [first[0] + DOT, first[1]] as const] : stroke.pts;
  return <path d={points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")}
    fill="none" stroke={stroke.color ?? "#000"} strokeWidth={stroke.width ?? 3}
    opacity={stroke.opacity ?? 1} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
});
