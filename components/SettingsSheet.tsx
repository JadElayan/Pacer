"use client";
import type { Mode, Prefs } from "@/lib/types";

const MODES: { id: Mode; name: string; desc: string }[] = [
  { id: "standard", name: "Standard", desc: "See the full lecture." },
  { id: "focus", name: "Focus", desc: "One topic at a time, fewer pop-ups, short answers." },
  { id: "guided", name: "Guided", desc: "Explanations in numbered steps." },
  { id: "example", name: "Example", desc: "Examples and analogies first." },
];
export function SettingsSheet({ prefs, update, reset, onClose }: { prefs: Prefs; update: (p: Partial<Prefs>) => void; reset: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <aside role="dialog" aria-label="Learning settings" className="h-full w-[min(380px,100vw)] overflow-y-auto bg-eggshell p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="display text-3xl">My view</h2><button className="btn btn-outline btn-sm" onClick={onClose}>Done</button></div>
        <fieldset className="mt-6"><legend className="mb-2 text-sm font-medium">Learning mode</legend>
          <div className="space-y-2">{MODES.map((m) => (
            <label key={m.id} className={`flex cursor-pointer gap-3 rounded-[20px] border p-3 ${prefs.mode === m.id ? "border-sky bg-sky-soft" : "border-stone"}`}>
              <input type="radio" name="mode" className="mt-1 accent-black" checked={prefs.mode === m.id} onChange={() => update({ mode: m.id })} />
              <span><span className="block font-medium">{m.name}</span><span className="text-sm text-smoke">{m.desc}</span></span>
            </label>))}</div>
        </fieldset>
        <label className="mt-6 block text-sm font-medium" htmlFor="ts">Text size: {prefs.textSize}%</label>
        <input id="ts" type="range" min={90} max={150} step={10} className="w-full accent-black" value={prefs.textSize} onChange={(e) => update({ textSize: Number(e.target.value) })} />
        <label className="mt-5 flex items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-black" checked={prefs.reduceMotion} onChange={(e) => update({ reduceMotion: e.target.checked })} /> Reduce motion</label>
        <label className="mt-3 flex items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-black" checked={prefs.popups} onChange={(e) => update({ popups: e.target.checked })} /> Show AI suggestions</label>
        <p className="mt-6 text-xs text-smoke">Settings are saved only on this device. Helpful/not-helpful taps adjust a simple preference score; it shows what you liked, not what you understood.</p>
        <button className="btn btn-outline mt-4" onClick={reset}>Reset my settings</button>
      </aside>
    </div>
  );
}
