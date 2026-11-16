import type { Stroke } from "@/lib/types";
import { memo } from "react";

export const InkPath = memo(function InkPath({ stroke }: { stroke: Omit<Stroke, "id"> }) {
  const points = stroke.pts.length === 1 ? [stroke.pts[0], stroke.pts[0]] : stroke.pts;
  return <path d={points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")}
    fill="none" stroke={stroke.color ?? "#000"} strokeWidth={stroke.width ?? 3}
    opacity={stroke.opacity ?? 1} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
});
