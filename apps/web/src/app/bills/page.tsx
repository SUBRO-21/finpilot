"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DATA_EVENT } from "@/components/Shell";
import { api, day, money } from "@/lib/api";

const perMonth = (r: any) => (Math.abs(r.amount) * 30) / r.cadenceDays;

/** Price rises on repeating payments, and subscriptions worth a second look. */
function Alerts({ a, onAnswer }: { a: any; onAnswer: (key: string, decision: "CONTINUE" | "STOP") => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!a || (!a.priceHikes.length && !a.toReview.length)) return null;
  const answer = async (key: string, d: "CONTINUE" | "STOP") => { setBusy(key); await onAnswer(key, d); setBusy(null); };
  return (
    <section className="grid2" style={{ alignItems: "start", marginBottom: 24 }} aria-label="Worth a look">
      {a.priceHikes.length > 0 && (
        <div className="card">
          <div className="between"><h2 className="t-title">Prices that went up</h2><span className="chip warn-chip">{a.priceHikes.length}</span></div>
          <div className="divider" style={{ marginTop: 16 }}>
            {a.priceHikes.map((h: any) => (
              <div className="item" key={h.key} style={{ padding: "13px 0" }}>
                <div>
                  <div>{h.name}</div>
                  <div className="small tag">{money(h.from)} → {money(h.to)} (+{Math.round(h.changePct * 100)}%) since {day(h.since)}</div>
                </div>
                <div className="r"><div className="num" style={{ fontWeight: 600 }}>+{money(h.extraPerYear)}</div><div className="small tag">more a year</div></div>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 14 }}>Worth checking for a cheaper plan, or whether the old price can be kept.</p>
        </div>
      )}
      {a.toReview.length > 0 && (
        <div className="card">
          <h2 className="t-title">Still using these?</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            Your statement can&rsquo;t show whether you use a service, only that you pay for it.
            {a.overlaps.length > 0 && ` You pay for ${a.overlaps.map((o: any) => `${o.names.length} ${o.group.toLowerCase()} services`).join(" and ")}.`}
          </p>
          <div className="divider" style={{ marginTop: 14 }}>
            {a.toReview.map((r: any) => (
              <div key={r.key} style={{ padding: "13px 0" }}>
                <div className="between">
                  <div>
                    <div>{r.name} {r.group && <span className="chip" style={{ marginLeft: 6 }}>{r.group}</span>}</div>
                    <div className="small tag">{money(r.amount)} {r.cadenceLabel}</div>
                  </div>
                  <div className="r"><div className="num">{money(r.perYear)}</div><div className="small tag">a year</div></div>
                </div>
                <div className="row" style={{ marginTop: 10, gap: 8 }}>
                  <button className="btn ghost sm" disabled={busy === r.key} onClick={() => answer(r.key, "CONTINUE")}>Still using it</button>
                  <button className="btn ghost sm" disabled={busy === r.key} onClick={() => answer(r.key, "STOP")}>I&rsquo;ll cancel it</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function Bills() {
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api("/analysis/summary").then(setS).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function answer(key: string, decision: "CONTINUE" | "STOP") {
    try {
      await api("/plan/recurring", { body: { key, decision } });
      window.dispatchEvent(new Event(DATA_EVENT));
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

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

      <Alerts a={s.alerts} onAnswer={answer} />
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
                  <div><div>{r.name}</div><div className="small tag">{r.payType ? `${r.payType}, ` : ""}{r.cadenceLabel}, {r.userConfirmed ? "confirmed by you" : `seen ${r.occurrences} times`}{r.pref === "ENDS" && r.endDate ? `, last payment ${day(r.endDate)}` : ""}{r.pref === "CHANGE" ? ", amount changed" : ""}</div></div>
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
