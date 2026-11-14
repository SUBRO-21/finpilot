"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { compact, money } from "@/lib/api";

/*
 * Portfolio charts. Colors come from CSS variables in globals.css (--s1..--s7 categorical, --gain/--loss
 * diverging, --other neutral), validated for color-vision deficiency on the white card surface.
 * Gain/loss is never color alone: values always carry a +/− sign.
 */

export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)"];
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n)).replace("−", "");
const signedCompact = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + compact(Math.abs(n));

/* ---------------------------------------------------------------- tooltip */

type Tip = { x: number; y: number; body: ReactNode } | null;

/** One floating tooltip per chart, following the pointer. */
function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const show = (e: React.MouseEvent | React.PointerEvent, body: ReactNode) => setTip({ x: e.clientX, y: e.clientY, body });
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="viz-tip" role="status" style={{ left: tip.x, top: tip.y }}>{tip.body}</div>
  ) : null;
  return { show, hide, node };
}

/** Width of a container in px, so SVG charts draw crisp text at any screen size. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** "Nice" axis ticks (1, 2, 5 × 10^n) covering [lo, hi], always including 0. */
function ticks(lo: number, hi: number, n = 4) {
  lo = Math.min(0, lo); hi = Math.max(0, hi);
  const span = hi - lo || 1;
  const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  // first tick at or below lo, last tick at or above hi, so no mark is ever drawn past the axis
  const first = Math.floor(lo / step + 1e-9), last = Math.ceil(hi / step - 1e-9);
  const out: number[] = [];
  for (let k = first; k <= last; k++) out.push(Math.round(k * step * 1e6) / 1e6);
  return out;
}

/* ---------------------------------------------------------------- donut */

export type Slice = { label: string; value: number; sub?: string };

/**
 * Allocation donut with a legend that names every slice with its share and value (identity never by color alone).
 * More than 7 slices fold into "Other" so no hue is ever generated or reused.
 */
export function AllocationDonut({ items, centerLabel, centerValue, size = 200 }: { items: Slice[]; centerLabel: string; centerValue: string; size?: number }) {
  const tip = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const shown = sorted.length > 7 ? [...sorted.slice(0, 6), { label: `Other (${sorted.length - 6})`, value: sorted.slice(6).reduce((a, i) => a + i.value, 0) }] : sorted;
  const total = shown.reduce((a, i) => a + i.value, 0) || 1;
  const colorOf = (i: number, label: string) => (label.startsWith("Other") ? "var(--other)" : SERIES[i]);

  const r = size / 2, stroke = 26, rr = r - stroke / 2 - 2, C = 2 * Math.PI * rr;
  const gap = shown.length > 1 ? 2 : 0; // 2px surface gap between segments
  let acc = 0;
  return (
    <div className="donut-wrap">
      <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel}: ${shown.map((s) => `${s.label} ${pct1(s.value / total)}`).join(", ")}`}>
          <g transform={`rotate(-90 ${r} ${r})`}>
            {shown.map((s, i) => {
              const len = (s.value / total) * C;
              const dash = `${Math.max(0.5, len - gap)} ${C}`;
              const off = -acc;
              acc += len;
              return (
                <circle key={s.label} cx={r} cy={r} r={rr} fill="none" stroke={colorOf(i, s.label)} strokeWidth={hover === i ? stroke + 6 : stroke}
                  strokeDasharray={dash} strokeDashoffset={off} style={{ transition: "stroke-width .15s", cursor: "default" }}
                  onPointerMove={(e) => { setHover(i); tip.show(e, <><b>{s.label}</b><div>{pct1(s.value / total)} · {money(s.value)}</div>{s.sub && <div className="muted">{s.sub}</div>}</>); }}
                  onPointerLeave={() => { setHover(null); tip.hide(); }} />
              );
            })}
          </g>
        </svg>
        <div className="donut-center" aria-hidden="true">
          <div className="small muted">{hover != null ? shown[hover].label : centerLabel}</div>
          <div className="donut-value">{hover != null ? pct1(shown[hover].value / total) : centerValue}</div>
        </div>
      </div>
      <ul className="viz-legend">
        {shown.map((s, i) => (
          <li key={s.label} className={hover === i ? "on" : ""} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <i style={{ background: colorOf(i, s.label) }} />
            <span className="lg-label">{s.label}</span>
            <span className="num lg-pct">{pct1(s.value / total)}</span>
            <span className="num muted lg-val">{compact(s.value)}</span>
          </li>
        ))}
      </ul>
      {tip.node}
    </div>
  );
}

/* ---------------------------------------------------------------- horizontal bars */

export type Bar = { label: string; value: number; tip?: ReactNode; note?: string };

/** One-series horizontal bars (e.g. share of portfolio per stock), largest first, value labelled at the end. */
export function WeightBars({ items, format = pct1, max }: { items: Bar[]; format?: (n: number) => string; max?: number }) {
  const tip = useTip();
  const top = max ?? Math.max(...items.map((i) => i.value), 0.0001);
  return (
    <div className="hbars" role="list">
      {items.map((b) => (
        <div key={b.label} className="hbar" role="listitem" onPointerMove={(e) => tip.show(e, b.tip ?? <><b>{b.label}</b><div>{format(b.value)}</div></>)} onPointerLeave={tip.hide}>
          <span className="hb-label">{b.label}</span>
          <span className="hb-track"><i className="hb-fill" style={{ width: `${(b.value / top) * 100}%`, background: "var(--s1)" }} /></span>
          <span className="hb-val num">{format(b.value)}{b.note && <span className="muted"> {b.note}</span>}</span>
        </div>
      ))}
      {tip.node}
    </div>
  );
}

/** Diverging horizontal bars around zero: gains (blue) to the right, losses (red) to the left. */
export function DivergingBars({ items, format = signed }: { items: Bar[]; format?: (n: number) => string }) {
  const tip = useTip();
  const lo = Math.min(0, ...items.map((i) => i.value)), hi = Math.max(0, ...items.map((i) => i.value));
  const span = hi - lo || 1, zero = (-lo / span) * 100;
  return (
    <div className="hbars" role="list">
      {items.map((b) => {
        const w = (Math.abs(b.value) / span) * 100;
        const pos = b.value >= 0;
        return (
          <div key={b.label} className="hbar" role="listitem" onPointerMove={(e) => tip.show(e, b.tip ?? <><b>{b.label}</b><div>{format(b.value)}</div></>)} onPointerLeave={tip.hide}>
            <span className="hb-label">{b.label}</span>
            <span className="hb-track div">
              <i className="hb-zero" style={{ left: `${zero}%` }} />
              <i className={`hb-fill ${pos ? "pos" : "neg"}`} style={{ left: pos ? `${zero}%` : `${zero - w}%`, width: `${Math.max(w, 0.4)}%` }} />
            </span>
            <span className="hb-val num">{format(b.value)}{b.note && <span className="muted"> {b.note}</span>}</span>
          </div>
        );
      })}
      {tip.node}
    </div>
  );
}

/* ---------------------------------------------------------------- columns */

/** Vertical columns around a zero line (monthly profit or loss). Positive up in blue, negative down in red. */
export function PnlColumns({ items, height = 200 }: { items: { key?: string; label: string; value: number; tip?: ReactNode }[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const padL = 52, padB = 24, padT = 8;
  const t = ticks(Math.min(...items.map((i) => i.value)), Math.max(...items.map((i) => i.value)));
  const lo = t[0], hi = t[t.length - 1];
  const plotH = height - padB - padT, plotW = Math.max(0, w - padL);
  const y = (v: number) => padT + ((hi - v) / (hi - lo || 1)) * plotH;
  const slot = plotW / Math.max(1, items.length), bw = Math.min(28, Math.max(4, slot * 0.6));
  const every = Math.ceil(items.length / Math.max(1, Math.floor(plotW / 44))); // thin out x labels on small screens
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={`Monthly profit or loss: ${items.map((i) => `${i.label} ${signed(i.value)}`).join(", ")}`}>
          {t.map((v) => (
            <g key={v}>
              <line x1={padL} x2={w} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--smoke)" : "var(--mist)"} strokeWidth={1} />
              <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="viz-axis">{signedCompact(v)}</text>
            </g>
          ))}
          {items.map((it, i) => {
            const cx = padL + slot * i + slot / 2;
            const y0 = y(0), y1 = y(it.value), top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
            const r = Math.min(4, bw / 2, h);
            const pos = it.value >= 0;
            // rounded only at the data end, square on the zero line
            const d = pos
              ? `M${cx - bw / 2},${y0} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${y0} Z`
              : `M${cx - bw / 2},${y0} V${top + h - r} Q${cx - bw / 2},${top + h} ${cx - bw / 2 + r},${top + h} H${cx + bw / 2 - r} Q${cx + bw / 2},${top + h} ${cx + bw / 2},${top + h - r} V${y0} Z`;
            return (
              <g key={it.key ?? `${i}-${it.label}`}>
                <rect x={cx - slot / 2} y={padT} width={slot} height={plotH} fill="transparent"
                  onPointerMove={(e) => tip.show(e, it.tip ?? <><b>{it.label}</b><div>{signed(it.value)}</div></>)} onPointerLeave={tip.hide} />
                <path d={d} fill={it.value === 0 ? "var(--mist)" : pos ? "var(--gain)" : "var(--loss)"} pointerEvents="none" />
                {i % every === 0 && <text x={cx} y={height - 6} textAnchor="middle" className="viz-axis">{it.label}</text>}
              </g>
            );
          })}
        </svg>
      )}
      {tip.node}
    </div>
  );
}

/* ---------------------------------------------------------------- line */

/** Running total over time (cumulative booked profit), with a crosshair and tooltip. */
export function StepLine({ points, height = 220, label }: { points: { date: string; value: number; note?: string }[]; height?: number; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const padL = 56, padB = 24, padT = 10, padR = 8;
  if (!points.length) return null;
  const t = ticks(Math.min(...points.map((p) => p.value)), Math.max(...points.map((p) => p.value)));
  const lo = t[0], top = t[t.length - 1];
  const d0 = Date.parse(points[0].date), d1 = Date.parse(points[points.length - 1].date) || d0 + 1;
  const plotW = Math.max(0, w - padL - padR), plotH = height - padT - padB;
  const x = (d: string) => padL + ((Date.parse(d) - d0) / (d1 - d0 || 1)) * plotW;
  const y = (v: number) => padT + ((top - v) / (top - lo || 1)) * plotH;
  // a step line: the total only changes on the day of a sale
  const path = points.map((p, i) => (i === 0 ? `M${x(p.date)},${y(p.value)}` : `H${x(p.date)} V${y(p.value)}`)).join(" ");
  const area = `${path} H${x(points[points.length - 1].date)} V${y(0)} H${x(points[0].date)} Z`;
  const months: string[] = [];
  for (let d = new Date(d0); d.getTime() <= d1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1))) months.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10));
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = d0 + ((e.clientX - box.left) / box.width) * (d1 - d0);
    let best = 0;
    for (let i = 0; i < points.length; i++) if (Date.parse(points[i].date) <= t) best = i;
    setHi(best);
  };
  const p = hi != null ? points[hi] : null;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={`${label}: from ${signed(points[0].value)} to ${signed(points[points.length - 1].value)}`}>
          {t.map((v) => (
            <g key={v}>
              <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--smoke)" : "var(--mist)"} />
              <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="viz-axis">{signedCompact(v)}</text>
            </g>
          ))}
          {months.filter((m) => Date.parse(m) >= d0).map((m) => (
            <text key={m} x={x(m)} y={height - 6} textAnchor="middle" className="viz-axis">{new Date(m).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" })}</text>
          ))}
          <path d={area} fill="var(--gain)" opacity={0.08} />
          <path d={path} fill="none" stroke="var(--s1)" strokeWidth={2} strokeLinejoin="round" />
          {p && (
            <g pointerEvents="none">
              <line x1={x(p.date)} x2={x(p.date)} y1={padT} y2={padT + plotH} stroke="var(--smoke)" />
              <circle cx={x(p.date)} cy={y(p.value)} r={5} fill="var(--s1)" stroke="var(--paper)" strokeWidth={2} />
            </g>
          )}
          <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHi(null)} />
        </svg>
      )}
      {p && (
        <div className="viz-tip inline" style={{ left: Math.min(Math.max(x(p.date), 90), w - 90), top: 0 }}>
          <b>{new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</b>
          <div>Total booked: {signed(p.value)}</div>
          {p.note && <div className="muted">{p.note}</div>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- scatter */

export type Dot = { x: number; y: number; label: string; tip: ReactNode };

/**
 * Each sold trade as a dot: how long it was held (x) against its return (y). Winners blue, losers red,
 * plus a legend; the pattern shows whether losers are held longer than winners.
 */
export function HoldScatter({ dots, height = 260 }: { dots: Dot[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const padL = 48, padB = 34, padT = 10, padR = 12;
  const maxX = Math.max(30, ...dots.map((d) => d.x));
  const xt = ticks(0, maxX, 5).filter((v) => v >= 0);
  const yt = ticks(Math.min(...dots.map((d) => d.y), -0.05), Math.max(...dots.map((d) => d.y), 0.05));
  const xMax = xt[xt.length - 1], yLo = yt[0], yHi = yt[yt.length - 1];
  const plotW = Math.max(0, w - padL - padR), plotH = height - padT - padB;
  const x = (v: number) => padL + (v / (xMax || 1)) * plotW;
  const y = (v: number) => padT + ((yHi - v) / (yHi - yLo || 1)) * plotH;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={`Return against days held for ${dots.length} sold trades`}>
          {yt.map((v) => (
            <g key={v}>
              <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--smoke)" : "var(--mist)"} />
              <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="viz-axis">{`${v > 0 ? "+" : ""}${Math.round(v * 100)}%`}</text>
            </g>
          ))}
          {xt.map((v) => <text key={v} x={x(v)} y={height - 16} textAnchor="middle" className="viz-axis">{v}</text>)}
          <text x={padL + plotW / 2} y={height - 2} textAnchor="middle" className="viz-axis">days held before selling</text>
          {dots.map((d, i) => (
            <circle key={i} cx={x(d.x)} cy={y(d.y)} r={5} fill={d.y >= 0 ? "var(--gain)" : "var(--loss)"} fillOpacity={0.85} stroke="var(--paper)" strokeWidth={2}
              onPointerMove={(e) => tip.show(e, d.tip)} onPointerLeave={tip.hide} style={{ cursor: "default" }} />
          ))}
        </svg>
      )}
      <div className="legend"><span><i className="dot" style={{ background: "var(--gain)" }} />Made money</span><span><i className="dot" style={{ background: "var(--loss)" }} />Lost money</span></div>
      {tip.node}
    </div>
  );
}

/* ---------------------------------------------------------------- ring */

/** A single headline share (win rate) as a ring, with the number in the middle. */
export function ShareRing({ value, label, size = 120 }: { value: number; label: string; size?: number }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} role="img" aria-label={`${label} ${Math.round(value * 100)}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--mist)" strokeWidth={10} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--s1)" strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${c * Math.min(1, Math.max(0, value))} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="donut-center"><div className="donut-value" style={{ fontSize: 26 }}>{Math.round(value * 100)}%</div><div className="small muted">{label}</div></div>
    </div>
  );
}
