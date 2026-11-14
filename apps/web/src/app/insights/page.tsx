"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ColumnChart, Meter, PairedColumns } from "@/components/Bits";
import { api, day, money, monthLabel, monthShort, pct } from "@/lib/api";

export default function Insights() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/analysis/insights").then(setD).catch((e) => setErr(e.message)); }, []);

  if (err) return <div className="card"><p className="err" style={{ margin: 0 }}>{err}</p></div>;
  if (!d) return <div className="skeleton" style={{ height: 420, marginTop: 40 }} />;
  if (d.empty)
    return (
      <section className="hero">
        <h1 className="h-lg">Where your money <em>goes</em>.</h1>
        <p className="lead">Import a statement to see spending by category, merchant and weekday.</p>
        <div className="row"><Link href="/import" className="btn">Import a statement</Link></div>
      </section>
    );

  const diff = d.monthSpend - d.previousMonthSpend;
  const top = d.categories[0];
  const maxCat = Math.max(1, ...d.categories.map((c: any) => c.amount));
  const maxMer = Math.max(1, ...d.merchants.map((m: any) => m.amount));
  const topDay = [...d.weekday].sort((a: any, b: any) => b.avg - a.avg)[0];

  return (
    <>
      <section className="hero">
        <div className="tag">{monthLabel(d.month)}, data through {day(d.asOfDate)}</div>
        <h1 className="h-lg">Where your money <em>goes</em>.</h1>
        <p className="lead">Spending excludes transfers between your own accounts.</p>
      </section>

      <div className="grid2">
        <div className="card pop" style={{ padding: 36 }}>
          <div className="tag">Spent this month</div>
          <div className="serif" style={{ fontSize: "clamp(44px,5vw,64px)", lineHeight: 1.1, letterSpacing: "-0.02em", marginTop: 10 }}>{money(d.monthSpend)}</div>
          <p style={{ marginTop: 12, maxWidth: "42ch" }}>
            {d.previousMonthSpend > 0
              ? `${money(Math.abs(diff))} ${diff <= 0 ? "less" : "more"} than the whole of last month (${money(d.previousMonthSpend)}).`
              : "There is no earlier month to compare with yet."}
            {top && ` ${top.category} is the biggest category at ${pct(top.share)}.`}
          </p>
        </div>
        <div className="card" style={{ padding: 36 }}>
          <div className="tag">Last 30 days</div>
          <div className="stats" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 14 }}>
            <div className="stat"><div className="small muted">Income</div><div className="v">{money(d.income30)}</div></div>
            <div className="stat"><div className="small muted">Spending</div><div className="v">{money(d.spend30)}</div></div>
            <div className="stat"><div className="small muted">Kept</div><div className="v">{d.savingsRate == null ? "n/a" : pct(d.savingsRate)}</div></div>
          </div>
          {topDay && topDay.avg > 0 && <p className="muted" style={{ marginTop: 22 }}>You spend the most on {topDay.day}s, about {money(topDay.avg)} on a typical one.</p>}
        </div>
      </div>

      <section className="section grid2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2 className="t-title">By category</h2>
          <p className="small muted" style={{ marginTop: 4 }}>{monthLabel(d.month)} compared with the month before</p>
          <div style={{ marginTop: 22, display: "grid", gap: 20 }}>
            {d.categories.map((c: any) => {
              const delta = c.amount - c.previous;
              return (
                <div key={c.category}>
                  <div className="between"><span>{c.category}</span><span className="num">{money(c.amount)}</span></div>
                  <div style={{ margin: "8px 0 6px" }}><Meter value={c.amount} max={maxCat} /></div>
                  <div className="small tag">{pct(c.share)} of spending{c.previous > 0 ? `, ${delta <= 0 ? "down" : "up"} ${money(Math.abs(delta))} on last month` : ", new this month"}</div>
                </div>
              );
            })}
            {!d.categories.length && <p className="muted">No spending recorded this month.</p>}
          </div>
        </div>

        <div className="stack" style={{ display: "grid", gap: 24 }}>
          <div className="card">
            <h2 className="t-title">Income and spending</h2>
            <p className="small muted" style={{ marginTop: 4, marginBottom: 22 }}>Last {d.months.length} months</p>
            <PairedColumns items={d.months.map((m: any) => ({ label: monthShort(m.month), a: m.income, b: m.spend }))} />
          </div>
          <div className="card">
            <h2 className="t-title">By weekday</h2>
            <p className="small muted" style={{ marginTop: 4, marginBottom: 22 }}>Average spending on each day, last 90 days</p>
            <ColumnChart items={d.weekday.map((w: any) => ({ label: w.day, value: w.avg }))} />
          </div>
        </div>
      </section>

      <section className="section grid2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2 className="t-title">Top merchants</h2>
          <p className="small muted" style={{ marginTop: 4 }}>Last 90 days</p>
          <div style={{ marginTop: 22, display: "grid", gap: 18 }}>
            {d.merchants.map((m: any) => (
              <div key={m.name}>
                <div className="between"><span>{m.name}</span><span className="num">{money(m.amount)}</span></div>
                <div style={{ margin: "8px 0 4px" }}><Meter value={m.amount} max={maxMer} /></div>
                <div className="small tag">{m.count} payment{m.count === 1 ? "" : "s"}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="t-title">Biggest payments</h2>
          <p className="small muted" style={{ marginTop: 4 }}>Last 30 days</p>
          <div className="divider" style={{ marginTop: 18 }}>
            {d.biggest.map((b: any) => (
              <div className="item" key={b.id} style={{ padding: "13px 0" }}>
                <div><div>{b.description}</div><div className="small tag">{day(b.date)}</div></div>
                <div className="num">{money(b.amount)}</div>
              </div>
            ))}
            {!d.biggest.length && <p className="muted">No payments in this window.</p>}
          </div>
        </div>
      </section>
    </>
  );
}
