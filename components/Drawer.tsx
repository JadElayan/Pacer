import type { ReactNode } from "react";

export function Chevron({ className }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m4 6 4 4 4-4" />
  </svg>;
}

/** A collapsible panel used above the board: title, a short hint, and a chevron that turns when open. */
export function Drawer({ title, hint, badge, className = "", children }: {
  title: string; hint?: ReactNode; badge?: ReactNode; className?: string; children: ReactNode;
}) {
  return <details className={`drawer ${className}`}>
    <summary>
      <span className="drawer-title">{title}</span>
      {badge !== undefined && <span className="drawer-badge">{badge}</span>}
      {hint && <span className="drawer-hint">{hint}</span>}
      <Chevron className="drawer-chevron" />
    </summary>
    <div className="drawer-body">{children}</div>
  </details>;
}
