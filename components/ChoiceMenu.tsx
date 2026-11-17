"use client";

import { Children, isValidElement, useId, useRef, type ReactNode } from "react";
import { Chevron } from "./Drawer";

type Choice = { value?: string | number; disabled?: boolean; children?: ReactNode };

export function ChoiceMenu({ label, value, onChange, disabled, children }: {
  label: string; value: string | number; onChange: (value: string) => void;
  disabled?: boolean; children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const options = Children.toArray(children).filter(isValidElement<Choice>).map(({ props }) => ({
    ...props,
    value: String(props.value ?? props.children),
  }));
  const selected = options.find((option) => option.value === String(value));
  const open = () => {
    const button = trigger.current;
    const menu = popup.current;
    if (!button || !menu) return;
    if (menu.matches(":popover-open")) { menu.hidePopover(); return; }
    const rect = button.getBoundingClientRect();
    const width = Math.min(window.innerWidth - 16, Math.max(216, rect.width));
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const flip = below < 220 && above > below;
    Object.assign(menu.style, {
      width: `${width}px`,
      left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`,
      top: flip ? "auto" : `${rect.bottom + 4}px`,
      bottom: flip ? `${window.innerHeight - rect.top + 4}px` : "auto",
      maxHeight: `${Math.min(300, flip ? above : below)}px`,
    });
    menu.showPopover();
    (menu.querySelector<HTMLButtonElement>('[aria-current="true"]:not(:disabled)') ??
      menu.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
  };
  return <div className="choice-menu">
    <button ref={trigger} type="button" className="choice-trigger" disabled={disabled}
      aria-label={`${label}: ${selected?.children ?? ""}`} popoverTarget={id}
      onClick={(event) => { event.preventDefault(); open(); }}
      onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); open(); } }}>
      <span>{selected?.children ?? label}</span><Chevron className="choice-chevron" />
    </button>
    <div ref={popup} id={id} popover="auto" className="choice-popup" role="group" aria-label={label}
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        if (!buttons.length) return;
        event.preventDefault();
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
          (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      {options.filter((option) => !(option.disabled && option.value === "")).map((option) =>
        <button type="button" key={option.value} disabled={option.disabled} aria-current={option === selected || undefined}
          onClick={() => { popup.current?.hidePopover(); trigger.current?.focus(); onChange(option.value); }}>
          <span>{option.children}</span>{option === selected && <svg aria-hidden="true" viewBox="0 0 16 16" className="choice-check" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-7" /></svg>}
        </button>
      )}
    </div>
  </div>;
}
