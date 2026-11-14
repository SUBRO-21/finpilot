"use client";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ColumnChart, Meter } from "@/components/Bits";
import { CategoryIcon, Monogram } from "@/components/Icons";
import { api, dayYear, money, monthShort, pct } from "@/lib/api";

export default function SpendingDetail({ params }: { params: Promise<{ kind: string; name: string }> }) {
  const p = use(params);
  const kind = p.kind === "merchant" ? "merchant" : "category";
  const name = decodeURIComponent(p.name);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    api(`/analysis/spending/detail?kind=${kind}&name=${encodeURIComponent(name)}`).then(setD).catch((e) => setErr(e.message));
  }, [kind, name]);

  const txns = useMemo(() => (d?.txns ?? []).filter((t: any) => !q || t.description.toLowerCase().includes(q.toLowerCase())), [d, q]);

  if (err) return (<><Link href="/spending" className="crumb">Back to spending</Link><div className="card"><p className="err" style={{ margin: 0 }}>{err}</p></div></>);
  if (!d) return <div className="skeleton" style={{ height: 420, marginTop: 40 }} />;

  const maxB = Math.max(1, ...d.breakdown.map((b: any) => b.amount));
  const best = [...d.weekday].sort((a: any, b: any) => b.avg - a.avg)[0];
  const monthsActive = d.months.filter((m: any) => m.amount > 0).length;
  const diff = d.thisMonth - d.lastMonth;

  return (
    <>
      <Link href="/spending" className="crumb">&larr; All spending</Link>
      <section className="hero" style={{ paddingTop: 12, paddingBottom: 32 }}>
        <div className="row" style={{ gap: 16, flexWrap: "nowrap" }}>
          <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--mist)", display: "grid", placeItems: "center", flex: "none" }}>
            {kind === "category" ? <CategoryIcon name={name} size={26} /> : <Monogram name={name} size={56} />}
          </span>
          <div><div className="tag">{kind === "category" ? "Category" : "Shop or app"}</div><h1 className="h-lg" style={{ marginTop: 2 }}>{name}</h1></div>
        </div>
        <p className="lead" style={{ marginTop: 16 }}>
          {money(d.total)} across {d.count} payment{d.count === 1 ? "" : "s"} since {dayYear(d.firstDate)}, which is {pct(d.share)} of everything you have spent.
        </p>
      </section>

      <div className="kpis">
        <div className="card kpi pop"><div><div className="tag">Total spent</div><div className="v num">{money(d.total)}</div></div><div className="small">{pct(d.share)} of all spending</div></div>
        <div className="card kpi"><div><div className="tag">This month</div><div className="v num">{money(d.thisMonth)}</div></div><div className="small muted">{d.lastMonth > 0 ? `${money(Math.abs(diff))} ${diff <= 0 ? "less" : "more"} than last month` : "Nothing last month"}</div></div>
        <div className="card kpi"><div><div className="tag">Average payment</div><div className="v num">{money(d.average)}</div></div><div className="small muted">{d.count} payments</div></div>
        <div className="card kpi"><div><div className="tag">Largest payment</div><div className="v num">{money(d.largest.amount)}</div></div><div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dayYear(d.largest.date)}</div></div>
      </div>

      <section className="section grid2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2 className="t-title">Month by month</h2>
          <p className="small muted" style={{ margin: "4px 0 20px" }}>{monthsActive} active month{monthsActive === 1 ? "" : "s"}, about {money(d.total / Math.max(1, d.months.length))} a month</p>
          <ColumnChart height={150} items={d.months.map((m: any) => ({ label: monthShort(m.month), value: m.amount }))} format={(n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(Math.round(n)))} />
        </div>
        <div className="card">
          <h2 className="t-title">By weekday</h2>
          <p className="small muted" style={{ margin: "4px 0 20px" }}>{best && best.avg > 0 ? `You spend the most here on ${best.day}s` : "Average on each day of the week"}</p>
          <ColumnChart height={150} items={d.weekday.map((w: any) => ({ label: w.day, value: w.avg }))} format={(n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)))} />
        </div>
      </section>

      <section className="section grid2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2 className="t-title">{d.breakdownLabel}</h2>
          <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
            {d.breakdown.map((b: any) => {
              const href = kind === "category" ? `/spending/merchant/${encodeURIComponent(b.name)}` : `/spending/category/${encodeURIComponent(b.name)}`;
              return (
                <div key={b.name}>
                  <div className="between"><Link href={href}>{b.name}</Link><span className="num">{money(b.amount)}</span></div>
                  <div style={{ margin: "8px 0 4px" }}><Meter value={b.amount} max={maxB} /></div>
                  <div className="small tag">{pct(b.share)}, {b.count} payment{b.count === 1 ? "" : "s"}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="between"><h2 className="t-title">History</h2><span className="small muted num">{txns.length} of {d.txns.length}</span></div>
          <input type="search" aria-label="Search this history" placeholder="Search payments" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 16 }} />
          <div className="divider" style={{ marginTop: 16 }}>
            {txns.map((t: any) => (
              <div className="item" key={t.id} style={{ padding: "12px 0" }}>
                <div style={{ minWidth: 0 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</div><div className="small tag">{dayYear(t.date)}{kind === "merchant" ? `, ${t.category}` : ""}</div></div>
                <div className="num">{money(t.amount)}</div>
              </div>
            ))}
            {!txns.length && <p className="muted">No payments match your search.</p>}
          </div>
          {d.count > 100 && <p className="small tag" style={{ marginTop: 12 }}>Showing the latest 100 payments.</p>}
        </div>
      </section>
    </>
  );
}
