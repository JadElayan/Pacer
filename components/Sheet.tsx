"use client";
import { useEffect, type ReactNode } from "react";

/** A rounded panel that floats in from the right edge, used by the board archive and the post-class package. */
export function Sheet({ title, label, subtitle, onClose, children, footer, wide }: {
  title: string; label: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);
  return (
    <div className="sheet-backdrop fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={label} className={`sheet ${wide ? "sheet-wide" : ""}`} onClick={(event) => event.stopPropagation()}>
        <header className="sheet-head">
          <div className="min-w-0">
            <h2 className="sheet-title">{title}</h2>
            {subtitle && <p className="sheet-sub">{subtitle}</p>}
          </div>
          <button type="button" autoFocus className="sheet-close" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </aside>
    </div>
  );
}
