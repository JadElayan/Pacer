"use client";
export interface PopupData { id: string; text: string; action: string; run: () => void }
export function Popup({ p, onDismiss, onNever }: { p: PopupData; onDismiss: () => void; onNever: () => void }) {
  return (
    <div role="status" className="pop-in fixed bottom-4 left-4 z-40 w-[min(300px,calc(100vw-2rem))] rounded-[20px] border border-sky bg-eggshell p-4 shadow-[0_8px_30px_rgba(0,0,0,.12)]">
      <p className="text-xs font-medium text-sky-deep">Pacer suggestion</p>
      <p className="mt-1 text-sm">{p.text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-primary btn-sm" onClick={() => { p.run(); onDismiss(); }}>{p.action}</button>
        <button className="btn btn-outline btn-sm" onClick={onDismiss}>Not now</button>
        <button className="text-xs text-smoke underline" onClick={onNever}>Don&apos;t show again</button>
      </div>
    </div>
  );
}
