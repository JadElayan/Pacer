"use client";
import { compile } from "@/lib/mathExpr";

export interface GraphData { title?: string; series: { label: string; expr: string }[]; xRange?: [number, number]; note?: string }
const COLORS = ["#0b5cc4", "#12151c", "#6a99df"];

export function GraphView({ data }: { data: GraphData }) {
  const [x0, x1] = data.xRange && data.xRange[0] < data.xRange[1] ? data.xRange : [-5, 5];
  const W = 320, H = 220, pad = 28, N = 160;
  const fns = (data.series ?? []).slice(0, 3).map((s) => ({ label: s.label, f: compile(s.expr) })).filter((s): s is { label: string; f: (x: number) => number } => !!s.f);
  if (!fns.length) return <p className="text-sm text-smoke">Couldn&apos;t draw this graph.</p>;
  const xs = Array.from({ length: N + 1 }, (_, i) => x0 + ((x1 - x0) * i) / N);
  const samples = fns.map((s) => xs.map((x) => s.f(x)));
  const finite = samples.flat().filter((y) => Number.isFinite(y) && Math.abs(y) < 1e4);
  let ymin = Math.min(...finite), ymax = Math.max(...finite);
  if (!finite.length) { ymin = -5; ymax = 5; }
  if (ymin === ymax) { ymin -= 1; ymax += 1; }
  const padY = (ymax - ymin) * 0.1; ymin -= padY; ymax += padY;
  const sx = (x: number) => pad + ((x - x0) / (x1 - x0)) * (W - 2 * pad);
  const sy = (y: number) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const path = (ys: number[]) => ys.map((y, i) => (Number.isFinite(y) && y >= ymin && y <= ymax ? `${i && Number.isFinite(ys[i - 1]) ? "L" : "M"}${sx(xs[i]).toFixed(1)} ${sy(y).toFixed(1)}` : "")).join(" ");
  const axisY = ymin <= 0 && ymax >= 0 ? sy(0) : H - pad;
  const axisX = x0 <= 0 && x1 >= 0 ? sx(0) : pad;
  const step = Math.max(1, Math.round((x1 - x0) / 8));
  const ticks: number[] = []; for (let t = Math.ceil(x0); t <= Math.floor(x1); t += step) ticks.push(t);
  let cross: { x: number; y: number } | null = null;
  if (samples.length >= 2) {
    for (let i = 1; i <= N && !cross; i++) {
      const d0 = samples[0][i - 1] - samples[1][i - 1], d1 = samples[0][i] - samples[1][i];
      if (Number.isFinite(d0) && Number.isFinite(d1) && d0 * d1 <= 0 && d0 !== d1) { const f = d0 / (d0 - d1); const x = xs[i - 1] + f * (xs[i] - xs[i - 1]); cross = { x, y: fns[0].f(x) }; }
    }
  }
  return (
    <figure className="space-y-2">
      {data.title && <figcaption className="text-sm font-medium">{data.title}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-stone bg-white" role="img" aria-label={`Graph of ${fns.map((f) => f.label).join(" and ")}${cross ? `, crossing at x equals ${cross.x.toFixed(2)}` : ""}`}>
        <line x1={pad} x2={W - pad} y1={axisY} y2={axisY} stroke="#a59f97" strokeWidth="1" />
        <line x1={axisX} x2={axisX} y1={pad / 2} y2={H - pad} stroke="#a59f97" strokeWidth="1" />
        {ticks.map((t) => <g key={t}><line x1={sx(t)} x2={sx(t)} y1={axisY - 3} y2={axisY + 3} stroke="#a59f97" /><text x={sx(t)} y={Math.min(H - 6, axisY + 15)} fontSize="11" textAnchor="middle" fill="#5f5a52">{t}</text></g>)}
        {samples.map((ys, i) => <path key={i} d={path(ys)} fill="none" stroke={COLORS[i]} strokeWidth="2.5" strokeDasharray={i === 1 ? "6 4" : undefined} strokeLinecap="round" />)}
        {cross && <g><circle cx={sx(cross.x)} cy={sy(cross.y)} r="5" fill="#4da3ff" stroke="#12151c" strokeWidth="1.5" /><text x={Math.min(W - 60, sx(cross.x) + 8)} y={sy(cross.y) - 8} fontSize="12" fontWeight="600" fill="#12151c">x = {Number(cross.x.toFixed(2))}</text></g>}
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">{fns.map((f, i) => <li key={i} className="flex items-center gap-1"><span aria-hidden className="inline-block h-0.5 w-4" style={{ background: COLORS[i] }} />{f.label}</li>)}</ul>
      {data.note && <p className="text-sm">{data.note}</p>}
    </figure>
  );
}
