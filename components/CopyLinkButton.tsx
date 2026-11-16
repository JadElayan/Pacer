"use client";

import { useState } from "react";

export function CopyLinkButton({ link, className }: { link: string; className?: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  return <div className={className}>
    <button type="button" className="btn btn-outline w-full" onClick={async () => {
      try {
        await navigator.clipboard.writeText(link);
        setStatus("copied");
      } catch {
        setStatus("failed");
      }
    }}>Copy link</button>
    <span role="status" className={status === "idle" ? "sr-only" : "mt-1 block text-xs text-smoke"}>
      {status === "copied" ? "Link copied" : status === "failed" ? "Copy failed. Select the link to copy it manually." : ""}
    </span>
  </div>;
}
