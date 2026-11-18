"use client";
import type { Mode, Prefs } from "@/lib/types";
import { Sheet } from "./Sheet";

const MODES: { id: Mode; name: string; desc: string }[] = [
  { id: "standard", name: "Standard", desc: "See the full lecture." },
  { id: "focus", name: "Focus", desc: "One topic at a time, fewer pop-ups, short answers." },
  { id: "guided", name: "Guided", desc: "Explanations in numbered steps." },
  { id: "example", name: "Example", desc: "Examples and analogies first." },
];

function Toggle({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="settings-toggle">
    <span><b>{label}</b><small>{help}</small></span>
    <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span className="settings-switch" aria-hidden="true" />
  </label>;
}

export function SettingsSheet({ prefs, update, reset, onClose }: { prefs: Prefs; update: (p: Partial<Prefs>) => void; reset: () => void; onClose: () => void }) {
  return (
    <Sheet title="My view" label="Learning settings" onClose={onClose} subtitle="How Pacer looks and explains things for you. Saved on this device."
      footer={<button className="btn btn-outline btn-sm" onClick={reset}>Reset my settings</button>}>
      <section className="sheet-card">
        <h3 className="sheet-card-title">Learning mode</h3>
        <div role="radiogroup" aria-label="Learning mode" className="mt-2 grid gap-2">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={prefs.mode === m.id} className="settings-mode" onClick={() => update({ mode: m.id })}>
              <span className="settings-radio" aria-hidden="true" />
              <span><b>{m.name}</b><small>{m.desc}</small></span>
            </button>
          ))}
        </div>
      </section>
      <section className="sheet-card mt-3">
        <div className="flex items-baseline justify-between">
          <h3 className="sheet-card-title"><label htmlFor="ts">Text size</label></h3>
          <span className="text-sm font-semibold text-[#2442a2]">{prefs.textSize}%</span>
        </div>
        <input id="ts" type="range" min={90} max={150} step={10} className="settings-range mt-3 w-full" value={prefs.textSize}
          style={{ ["--fill" as string]: `${((prefs.textSize - 90) / 60) * 100}%` }} onChange={(e) => update({ textSize: Number(e.target.value) })} />
        <div className="mt-1 flex justify-between text-xs text-smoke"><span>Smaller</span><span>Larger</span></div>
      </section>
      <section className="sheet-card mt-3 grid gap-1">
        <Toggle label="Reduce motion" help="Turn off animations in the classroom." checked={prefs.reduceMotion} onChange={(value) => update({ reduceMotion: value })} />
        <Toggle label="Show AI suggestions" help="Short tips like “Want a simpler explanation?”." checked={prefs.popups} onChange={(value) => update({ popups: value })} />
        <Toggle label="Guided review" help="When you open a saved lesson, walk through each slide and topic with you." checked={prefs.guide} onChange={(value) => update({ guide: value })} />
      </section>
      <p className="mt-4 px-1 text-xs leading-relaxed text-smoke">Helpful and not-helpful taps adjust a simple preference score. It shows what you liked, not what you understood.</p>
    </Sheet>
  );
}
