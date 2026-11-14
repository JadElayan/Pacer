"use client";
import { useState } from "react";
/** Renders /public/logo.svg when the team drops it in; falls back to the plain wordmark. */
export function Logo({ height = 28 }: { height?: number }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <span className="text-xl font-medium tracking-tight">Pacer</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.svg" alt="Pacer" height={height} style={{ height }} onError={() => setMissing(true)} />;
}
