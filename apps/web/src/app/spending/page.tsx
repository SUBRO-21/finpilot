"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Meter } from "@/components/Bits";
import { CategoryIcon, Monogram } from "@/components/Icons";
import { api, dayYear, money, pct } from "@/lib/api";

const PERIODS = [["month", "This month"], ["90d", "3 months"], ["all", "All time"]] as const;

function Change({ now, prev }: { now: number; prev: number | null }) {
  if (prev == null) return null;
  if (prev === 0) return <span className="small tag">New in this period</span>;
  const d = now - prev;
  return <span className="small tag">{d <= 0 ? "Down" : "Up"} {money(Math.abs(d))} vs before</span>;
}

export default function Spending() {
  const [period, setPeriod] = useState<"month" | "90d" | "all">("month");
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
    api(`/analysis/spending?period=${period}`).then(setD).catch((e) => setErr(e.message));
  }, [period]);

  if (err) return <div className="card"><p className="err" style={{ margin: 0 }}>{err}</p></div>;
  if (!d) return <div className="skeleton" style={{ height: 420, marginTop: 40 }} />;
  if (d.empty)
    return (
      <section className="hero">
        <h1 className="h-lg">Where your money <em>went</em>.</h1>
        <p className="lead">Import a statement to see every category, shop and app you spend on.</p>
        <div className="row"><Link href="/import" className="btn">Import a statement</Link></div>
      </section>
    );

  const top = d.categories[0];
  const maxCat = Math.max(1, ...d.categories.map((c: any) => c.amount));
  return (
    <>
      <section className="hero" style={{ paddingBottom: 32 }}>
        <div className="tag">{dayYear(d.from)} to {dayYear(d.to)}</div>
        <h1 className="h-lg">Where your money <em>went</em>.</h1>
        <p className="lead">Every rupee grouped by category and by shop or app. Select any tile for its full history. Transfers between your own accounts are left out.</p>
      </section>

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <div className="seg" role="group" aria-label="Time period">
          {PERIODS.map(([v, label]) => <button key={v} aria-pressed={period === v} onClick={() => setPeriod(v)}>{label}</button>)}
        </div>
      </div>

      <div className="grid2">
        <div className="card pop" style={{ padding: 32 }}>
          <div className="tag">Total spent</div>
          <div className="serif" style={{ fontSize: "clamp(44px,5vw,64px)", lineHeight: 1.1, letterSpacing: "-0.02em", marginTop: 8 }}>{money(d.total)}</div>
          <p style={{ marginTop: 10 }}>
            {d.count} payments, about {money(d.avgPerDay)} a day.
            {d.previousTotal != null && d.previousTotal > 0 && ` That is ${money(Math.abs(d.total - d.previousTotal))} ${d.total <= d.previousTotal ? "less" : "more"} than the period before.`}
          </p>
        </div>
        <div className="card" style={{ padding: 32 }}>
          <div className="tag">Biggest category</div>
          {top ? (<>
            <div className="row" style={{ marginTop: 12, gap: 14, flexWrap: "nowrap" }}>
              <span className="ico" style={{ width: 52, height: 52 }}><CategoryIcon name={top.name} size={24} /></span>
              <div><div className="h-sm">{top.name}</div><div className="muted">{money(top.amount)}, {pct(top.share)} of spending</div></div>
            </div>
            <p style={{ marginTop: 16 }}><Link className="more" href={`/spending/category/${encodeURIComponent(top.name)}`}>Open {top.name}</Link></p>
          </>) : <p className="muted" style={{ marginTop: 12 }}>No spending in this period.</p>}
        </div>
      </div>

      <section className="section" aria-labelledby="bycat">
        <div className="head"><h2 className="h" id="bycat">By <em>category</em></h2><span className="tag">{d.categories.length} categories</span></div>
        <div className="tiles">
          {d.categories.map((c: any) => (
            <Link key={c.name} href={`/spending/category/${encodeURIComponent(c.name)}`} className="tile-link" aria-label={`${c.name}, ${money(c.amount)}. View history`}>
              <span className="ico"><CategoryIcon name={c.name} /></span>
              <div className="amt num">{money(c.amount)}</div>
              <div style={{ fontWeight: 450, marginTop: 2 }}>{c.name}</div>
              <div style={{ margin: "12px 0 8px" }}><Meter value={c.amount} max={maxCat} /></div>
              <div className="small tag">{pct(c.share)} of spending, {c.count} payment{c.count === 1 ? "" : "s"}</div>
              <Change now={c.amount} prev={c.previous} />
            </Link>
          ))}
        </div>
        {!d.categories.length && <div className="card empty"><p>Nothing spent in this period.</p></div>}
      </section>

      <section className="section" aria-labelledby="bymer">
        <div className="head"><h2 className="h" id="bymer">Shops and <em>apps</em></h2><span className="tag">Top {d.merchants.length}</span></div>
        <div className="tiles">
          {d.merchants.map((m: any) => (
            <Link key={m.name} href={`/spending/merchant/${encodeURIComponent(m.name)}`} className="tile-link" aria-label={`${m.name}, ${money(m.amount)}. View history`}>
              <Monogram name={m.name} />
              <div className="amt num">{money(m.amount)}</div>
              <div style={{ fontWeight: 450, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
              <div style={{ marginTop: 12 }}><span className="chip"><CategoryIcon name={m.category} size={12} />{m.category}</span></div><div className="small tag" style={{ marginTop: 8 }}>{m.count} payment{m.count === 1 ? "" : "s"}</div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
