"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, day, money } from "@/lib/api";

const perMonth = (r: any) => (Math.abs(r.amount) * 30) / r.cadenceDays;

export default function Bills() {
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/analysis/summary").then(setS).catch((e) => setErr(e.message)); }, []);

  if (err) return <div className="card"><p className="err" style={{ margin: 0 }}>{err}</p></div>;
  if (!s) return <div className="skeleton" style={{ height: 420, marginTop: 40 }} />;
  if (s.empty)
    return (
      <section className="hero">
        <h1 className="h-lg">What&rsquo;s <em>coming up</em>.</h1>
        <p className="lead">Import a statement and repeating bills and income are found automatically.</p>
        <div className="row"><Link href="/import" className="btn">Import a statement</Link></div>
      </section>
    );

  const asOf = s.forecast.asOfDay;
  const bills = s.recurring.filter((r: any) => r.amount < 0 && !r.stopped);
  const stopped = s.recurring.filter((r: any) => r.stopped);
  const income = s.recurring.filter((r: any) => r.amount > 0 && !r.stopped);
  const next30 = bills.filter((r: any) => r.nextDay - asOf <= 30);
  const due30 = next30.reduce((a: number, r: any) => a + Math.abs(r.amount), 0);
  const monthly = bills.reduce((a: number, r: any) => a + perMonth(r), 0);
  const timeline = [...s.recurring].filter((r: any) => !r.stopped && r.nextDay - asOf <= 30 && (r.endDay == null || r.nextDay <= r.endDay)).sort((a: any, b: any) => a.nextDay - b.nextDay);

  return (
    <>
      <section className="hero">
        <div className="tag">After {day(s.forecast.asOfDate)}</div>
        <h1 className="h-lg">What&rsquo;s <em>coming up</em>.</h1>
        <p className="lead">Bills and income that repeat on a steady rhythm, found from your history.</p>
      </section>

      <div className="grid2">
        <div className="card pop" style={{ padding: 36 }}>
          <div className="tag">Due in the next 30 days</div>
          <div className="serif" style={{ fontSize: "clamp(44px,5vw,64px)", lineHeight: 1.1, letterSpacing: "-0.02em", marginTop: 10 }}>{money(due30)}</div>
          <p style={{ marginTop: 12 }}>{next30.length} payment{next30.length === 1 ? "" : "s"} expected.</p>
        </div>
        <div className="card" style={{ padding: 36 }}>
          <div className="tag">Fixed monthly cost</div>
          <div className="serif" style={{ fontSize: "clamp(44px,5vw,64px)", lineHeight: 1.1, letterSpacing: "-0.02em", marginTop: 10 }}>{money(monthly)}</div>
          <p className="muted" style={{ marginTop: 12 }}>About {money(monthly * 12)} a year across {bills.length} recurring payment{bills.length === 1 ? "" : "s"}.</p>
        </div>
      </div>

      <section className="section grid2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2 className="t-title">Next 30 days</h2>
          {timeline.length ? (
            <div className="divider" style={{ marginTop: 18 }}>
              {timeline.map((r: any) => (
                <div className="item" key={r.key} style={{ padding: "14px 0", alignItems: "center" }}>
                  <div className="row" style={{ gap: 18, flexWrap: "nowrap" }}>
                    <div style={{ width: 52 }}><div className="serif" style={{ fontSize: 26, lineHeight: 1 }}>{new Date(r.nextDate + "T00:00:00Z").getUTCDate()}</div><div className="small tag">{new Date(r.nextDate + "T00:00:00Z").toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</div></div>
                    <div><div>{r.name}</div><div className="small tag">{r.amount > 0 ? "Income" : "Bill"}, {r.cadenceLabel}</div></div>
                  </div>
                  <div className="num" style={{ fontWeight: 450 }}>{r.amount > 0 ? "+" : ""}{money(r.amount)}</div>
                </div>
              ))}
            </div>
          ) : <p className="muted" style={{ marginTop: 14 }}>Nothing is scheduled in the next 30 days.</p>}
        </div>

        <div style={{ display: "grid", gap: 24 }}>
          <div className="card">
            <h2 className="t-title">All recurring bills</h2>
            <div className="divider" style={{ marginTop: 18 }}>
              {bills.map((r: any) => (
                <div className="item" key={r.key} style={{ padding: "13px 0" }}>
                  <div><div>{r.name}</div><div className="small tag">{r.cadenceLabel}, {r.userConfirmed ? "confirmed by you" : `seen ${r.occurrences} times`}{r.pref === "ENDS" && r.endDate ? `, last payment ${day(r.endDate)}` : ""}{r.pref === "CHANGE" ? ", amount changed" : ""}</div></div>
                  <div className="r"><div className="num">{money(r.amount)}</div><div className="small tag num">{money(perMonth(r))} a month</div></div>
                </div>
              ))}
              {!bills.length && <p className="muted">No recurring bills found yet. A payment needs three repeats, so more history helps.</p>}
            </div>
          </div>
          {stopped.length > 0 && (
            <div className="card fog">
              <h2 className="t-title">Marked as stopped</h2>
              <p className="small muted" style={{ marginTop: 4 }}>These are left out of your forecast. <Link href="/review" className="more small">Change an answer</Link></p>
              <div className="divider" style={{ marginTop: 16 }}>
                {stopped.map((r: any) => (<div className="item" key={r.key} style={{ padding: "12px 0" }}><div>{r.name}</div><div className="num muted">{money(r.amount)}</div></div>))}
              </div>
            </div>
          )}
          {income.length > 0 && (
            <div className="card fog">
              <h2 className="t-title">Expected income</h2>
              <div className="divider" style={{ marginTop: 18 }}>
                {income.map((r: any) => (
                  <div className="item" key={r.key} style={{ padding: "13px 0" }}>
                    <div><div>{r.name}</div><div className="small tag">{r.cadenceLabel}, next {day(r.nextDate)}</div></div>
                    <div className="num">+{money(r.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
