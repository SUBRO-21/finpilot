"use client";
import { compact, money } from "@/lib/api";

/** Radial score. Track is a quiet gray, progress is steel; the number is bold sans. */
export function Ring({ value, size = 132 }: { value: number; size?: number }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${value} out of 100`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--steel)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="serif" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: size * 0.3, fontWeight: 700, letterSpacing: "-0.04em" }}>{value}</div>
    </div>
  );
}

/** Horizontal progress: steel normally, navy once the limit is passed. */
export function Meter({ value, max }: { value: number; max: number }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return <div className={`bar ${value > max ? "over" : ""}`} role="img" aria-label={`${Math.round(max ? (value / max) * 100 : 0)}% used`}><i style={{ width: `${p}%` }} /></div>;
}

export function ColumnChart({ items, height = 140, format = money }: { items: { label: string; value: number; sub?: string }[]; height?: number; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 10, alignItems: "end" }}>
      {items.map((i) => (
        <div key={i.label} style={{ display: "grid", gap: 6, justifyItems: "center" }} title={`${i.label}: ${format(i.value)}`}>
          <span className="tag" style={{ fontSize: 12 }}>{i.value ? format(i.value) : ""}</span>
          <div style={{ width: "100%", height, display: "flex", alignItems: "end" }}>
            <div style={{ width: "100%", height: `${Math.max(2, (i.value / max) * 100)}%`, background: "var(--ink)", borderRadius: "8px 8px 2px 2px" }} />
          </div>
          <span className="small muted">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Paired columns, e.g. income (navy) beside spending (steel) per month. */
export function PairedColumns({ items, height = 160 }: { items: { label: string; a: number; b: number }[]; height?: number }) {
  const max = Math.max(1, ...items.flatMap((i) => [i.a, i.b]));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 18 }}>
        {items.map((i) => (
          <div key={i.label} style={{ display: "grid", gap: 8 }}>
            <div style={{ height, display: "flex", alignItems: "end", gap: 6 }} title={`${i.label}: income ${money(i.a)}, spending ${money(i.b)}`}>
              <div style={{ flex: 1, height: `${Math.max(2, (i.a / max) * 100)}%`, background: "var(--ink)", borderRadius: "8px 8px 2px 2px" }} />
              <div style={{ flex: 1, height: `${Math.max(2, (i.b / max) * 100)}%`, background: "var(--steel)", borderRadius: "8px 8px 2px 2px" }} />
            </div>
            <span className="small muted" style={{ textAlign: "center" }}>{i.label}</span>
          </div>
        ))}
      </div>
      <div className="legend"><span><i className="sw hist" />Income</span><span><i className="sw" />Spending</span></div>
    </div>
  );
}

export function Sparkline({ values, width = 120, height = 40 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 4 - ((v - lo) / span) * (height - 8)).toFixed(1)}`);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: "block" }}>
      <polyline points={pts.join(" ")} fill="none" stroke="var(--steel)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export const DONUT_COLORS = ["#20294c", "#375390", "#788dba", "#979db5", "#c7cbdb", "#dddfe9"];

export function Donut({ items, size = 168, center }: { items: { label: string; value: number }[]; size?: number; center?: string }) {
  const total = items.reduce((a, i) => a + i.value, 0) || 1;
  const r = (size - 24) / 2, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Spending by category">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth="22" />
        {items.map((it, i) => {
          const len = (it.value / total) * c;
          const el = (
            <circle key={it.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="22"
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`}><title>{`${it.label}: ${money(it.value)}`}</title></circle>
          );
          acc += len;
          return el;
        })}
      </svg>
      {center && <div className="serif" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 22, letterSpacing: "-0.01em" }}>{center}</div>}
    </div>
  );
}

/** Cumulative spend this month (ink) against last month (dashed). */
export function PaceChart({ data }: { data: { day: number; current: number | null; previous: number }[] }) {
  const W = 520, H = 200, L = 44, R = 8, T = 8, B = 24;
  const max = Math.max(1, ...data.flatMap((d) => [d.current ?? 0, d.previous]));
  const x = (d: number) => L + ((d - 1) / Math.max(1, data.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = (k: "current" | "previous") => data.filter((d) => d[k] != null).map((d, i) => `${i ? "L" : "M"}${x(d.day).toFixed(1)},${y(d[k] as number).toFixed(1)}`).join("");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cumulative spending this month compared with last month" style={{ display: "block" }}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="var(--line)" /><text x={L - 8} y={y(max * t) + 4} fontSize="11" fill="var(--ash)" textAnchor="end">{compact(max * t)}</text></g>
        ))}
        <path d={line("previous")} fill="none" stroke="var(--ash)" strokeWidth="2" strokeDasharray="5 4" />
        <path d={line("current")} fill="none" stroke="var(--ink)" strokeWidth="2.25" strokeLinejoin="round" />
        {[1, 8, 15, 22, data.length].map((d) => <text key={d} x={x(d)} y={H - 6} fontSize="11" fill="var(--ash)" textAnchor="middle">{d}</text>)}
      </svg>
      <div className="legend"><span><i className="sw hist" />This month</span><span><i className="sw dash" />Last month</span></div>
    </div>
  );
}
