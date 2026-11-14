"use client";
import type { ForecastPoint } from "@finos/engine";

/** p10-p90 band with p50 line; the zero line is highlighted so shortage risk is visible at a glance. */
export function ForecastChart({ points, start }: { points: ForecastPoint[]; start: number }) {
  const W = 700, H = 220, P = 36;
  const all = [start, ...points.flatMap((p) => [p.p10, p.p90])];
  const lo = Math.min(0, ...all), hi = Math.max(...all);
  const x = (i: number) => P + (i / Math.max(1, points.length - 1)) * (W - P * 1.5);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo || 1)) * (H - P * 1.5);
  const band = points.map((p, i) => `${x(i)},${y(p.p90)}`).join(" ") + " " + [...points].reverse().map((p, i) => `${x(points.length - 1 - i)},${y(p.p10)}`).join(" ");
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.p50)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Balance forecast with uncertainty band">
      <polygon points={band} fill="var(--brand)" opacity="0.18" />
      <line x1={P} x2={W - 10} y1={y(0)} y2={y(0)} stroke="var(--bad)" strokeDasharray="4 4" />
      <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2" />
      <text x={P} y={y(0) - 4} fontSize="11" fill="var(--bad)">0</text>
      <text x={P} y={H - 8} fontSize="11" fill="var(--mute)">{points[0]?.date}</text>
      <text x={W - 10} y={H - 8} fontSize="11" fill="var(--mute)" textAnchor="end">{points.at(-1)?.date}</text>
      <text x={W - 10} y={14} fontSize="11" fill="var(--mute)" textAnchor="end">shaded = 10th-90th percentile</text>
    </svg>
  );
}
