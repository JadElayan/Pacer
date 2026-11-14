"use client";
import { useState } from "react";
/** Pacer icon (public/logo.svg) + wordmark. Falls back to text only if the icon is missing. */
export function Logo({ height = 28 }: { height?: number }) {
  const [missing, setMissing] = useState(false);
  return (
    <span className="inline-flex items-center gap-2" style={{ fontSize: height * 0.95 }}>
      {!missing && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/logo.svg" alt="" aria-hidden style={{ height }} onError={() => setMissing(true)} />
      )}
      <span className="font-semibold leading-none tracking-tight">Pacer</span>
    </span>
  );
}
