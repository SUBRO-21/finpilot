"use client";
import { useRef, useState } from "react";
import type { ForecastPoint } from "@finos/engine";
import { compact, day, money } from "@/lib/api";

type Hist = { date: string; balance: number };

/**
 * Past balance (ink) flows into the forecast: median line (steel) with a likely-range band (mist).
 * `baseline` draws the no-decision forecast as a dashed line for what-if comparisons.
 */
export function ForecastChart({ points, start, history = [], baseline }: { points: ForecastPoint[]; start: number; history?: Hist[]; baseline?: ForecastPoint[] }) {
  const W = 880, H = 300, L = 60, R = 12, T = 12, B = 30;
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return null;

  const hn = history.length;
  const n = hn + points.length;
  const all = [start, ...history.map((h) => h.balance), ...points.flatMap((p) => [p.p10, p.p90]), ...(baseline?.map((p) => p.p50) ?? [])];
  let lo = Math.min(0, ...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.06 || 1;
  hi += pad; if (lo < 0) lo -= pad;
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const fx = (i: number) => x(hn + i);

  const fLine = [`M${(hn ? x(hn - 1) : fx(0)).toFixed(1)},${y(start).toFixed(1)}`, ...points.map((p, i) => `L${fx(i).toFixed(1)},${y(p.p50).toFixed(1)}`)].join("");
  const bLine = baseline ? [`M${(hn ? x(hn - 1) : fx(0)).toFixed(1)},${y(start).toFixed(1)}`, ...baseline.map((p, i) => `L${fx(i).toFixed(1)},${y(p.p50).toFixed(1)}`)].join("") : "";
  const hLine = history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.balance).toFixed(1)}`).join("");
  const band =
    points.map((p, i) => `${fx(i).toFixed(1)},${y(p.p90).toFixed(1)}`).join(" ") + " " +
    points.map((_, i) => { const j = points.length - 1 - i; return `${fx(j).toFixed(1)},${y(points[j].p10).toFixed(1)}`; }).join(" ");
  const yTicks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const dateAt = (i: number) => (i < hn ? history[i].date : points[i - hn].date);
  const xTicks = [0, Math.floor((n - 1) / 3), Math.floor(((n - 1) * 2) / 3), n - 1];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1)))));
  }
  const inHist = hover != null && hover < hn;
  const fp = hover != null && hover >= hn ? points[hover - hn] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Balance history and forecast with likely range"
        onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: "block" }}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={L - 10} y={y(t) + 4} fontSize="12" fill="var(--ash)" textAnchor="end">{compact(t)}</text>
          </g>
        ))}
        {lo < 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 4" />}
        {hn > 0 && <line x1={x(hn - 1)} x2={x(hn - 1)} y1={T} y2={H - B} stroke="var(--track)" strokeDasharray="2 4" />}
        <polygon points={band} fill="var(--mist)" />
        {hLine && <path d={hLine} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />}
        {bLine && <path d={bLine} fill="none" stroke="var(--smoke)" strokeWidth="2" strokeDasharray="5 4" />}
        <path d={fLine} fill="none" stroke="var(--steel)" strokeWidth="2.5" strokeLinejoin="round" />
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} fontSize="12" fill="var(--ash)" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{day(dateAt(i))}</text>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--ash)" />
            <circle cx={x(hover)} cy={y(inHist ? history[hover].balance : fp!.p50)} r="5" fill="var(--blue)" stroke="var(--paper)" strokeWidth="2" />
          </g>
        )}
      </svg>
      {hover != null && (
        <div role="status" style={{
          position: "absolute", top: 8, pointerEvents: "none", background: "var(--paper)", borderRadius: 12, padding: "10px 14px", fontSize: 13, boxShadow: "var(--shadow-md)",
          ...(hover > n / 2 ? { right: `${100 - (x(hover) / W) * 100 + 2}%` } : { left: `${(x(hover) / W) * 100 + 2}%` }),
        }}>
          <div className="tag" style={{ fontSize: 12 }}>{day(dateAt(hover))}{inHist ? ", actual" : ", forecast"}</div>
          <div style={{ fontWeight: 500, fontSize: 16 }}>{money(inHist ? history[hover].balance : fp!.p50)}</div>
          {fp && <div className="muted">Likely {money(fp.p10)} to {money(fp.p90)}</div>}
        </div>
      )}
      <div className="legend">
        {hn > 0 && <span><i className="sw hist" />Actual balance</span>}
        <span><i className="sw" />Forecast (median)</span>
        <span><i className="sw band" />Likely range, 10th to 90th percentile</span>
        {baseline && <span><i className="sw dash" />Without this decision</span>}
        {lo < 0 && <span>Dashed line marks zero</span>}
      </div>
    </div>
  );
}
