"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ColumnChart, Donut, DONUT_COLORS, Meter, PairedColumns, PaceChart, Ring, Sparkline } from "@/components/Bits";
import { ForecastChart } from "@/components/ForecastChart";
import { ageText } from "@/components/Shell";
import { api, day, dayYear, money, monthLabel, monthShort, pct } from "@/lib/api";

const CONF: Record<string, string> = { LOW: "High", MEDIUM: "Medium", HIGH: "Low" };

function Headline({ f }: { f: any }) {
  const risk = f.shortageProbability;
  const last = f.points[f.points.length - 1]?.date;
  if (risk < 0.1) return <h1 className="h">Your cash looks <em>safe</em> through {day(last)}.</h1>;
  if (risk < 0.4) return <h1 className="h">Cash gets <em>tight</em> around {day(f.expectedShortageDate ?? last)}.</h1>;
  return <h1 className="h">A shortfall is <em>likely</em> around {day(f.expectedShortageDate ?? last)}.</h1>;
}

export default function Overview() {
  const router = useRouter();
  const [s, setS] = useState<any>(null);
  const [bt, setBt] = useState<any>(null);
  const [horizon, setHorizon] = useState(60);
  const [q, setQ] = useState("");
  const [st, setSt] = useState<any>(null);
  const [why, setWhy] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { api("/plan/status").then(setSt).catch(() => {}); }, []);
  useEffect(() => { api("/analysis/backtest").then(setBt).catch(() => setBt({ folds: [], verdict: "Accuracy check is unavailable right now" })); }, []);
  useEffect(() => {
    setErr("");
    api(`/analysis/summary?horizon=${horizon}`).then(setS).catch((e) => setErr(e.message));
  }, [horizon]);

  if (err) return <div className="card"><p className="err" style={{ margin: 0 }}>{err}</p></div>;
  if (!s) return <div className="skeleton" style={{ height: 520, marginTop: 16 }} />;
  if (s.empty)
    return (
      <section className="hero">
        <div className="tag">Hello, {s.name}</div>
        <h1 className="display">Let&rsquo;s look at your <em>cash flow</em>.</h1>
        <p className="lead">Import a bank statement and FinOS will find your recurring bills, forecast your balance and warn you before it runs short.</p>
        <div className="row"><Link href="/import" className="btn">Import a statement</Link></div>
      </section>
    );

  const f = s.forecast, ins = s.insights;
  const due30 = s.recurring.filter((r: any) => r.amount < 0 && !r.stopped && r.nextDay - f.asOfDay <= 30);
  const fixedMonthly = s.recurring.filter((r: any) => r.amount < 0 && !r.stopped).reduce((a: number, r: any) => a + (-r.amount * 30) / r.cadenceDays, 0);
  const kept = s.income30 > 0 ? (s.income30 - s.spend30) / s.income30 : null;
  const cats = ins.categories.slice(0, 5).map((c: any) => ({ label: c.category, value: c.amount }));
  const rest = ins.categories.slice(5).reduce((a: number, c: any) => a + c.amount, 0);
  if (rest > 0) cats.push({ label: "Everything else", value: rest });
  const maxMer = Math.max(1, ...ins.merchants.map((m: any) => m.amount));

  async function explain() {
    setExplaining(true);
    try { setWhy((await api("/analysis/explain", { method: "POST", body: {} })).explanation); } catch (e) { setWhy((e as Error).message); }
    setExplaining(false);
  }
  function ask(e: React.FormEvent) { e.preventDefault(); if (q.trim().length >= 3) router.push(`/assistant?q=${encodeURIComponent(q.trim())}`); }

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <div className="tag">Hello, {s.name}. Data through {dayYear(f.asOfDate)}, {ageText(s.freshness.ageDays)}</div>
          <div style={{ marginTop: 6, maxWidth: "24ch" }}><Headline f={f} /></div>
        </div>
        <div className="seg" role="group" aria-label="Forecast length">
          {[30, 60, 90].map((h) => <button key={h} aria-pressed={horizon === h} onClick={() => setHorizon(h)}>{h} days</button>)}
        </div>
      </div>

      {(s.freshness.level === "stale" || (st && st.pending > 0)) && (
        <div className="float" style={{ padding: 28 }} role="region" aria-label="Next steps">
          {s.freshness.level === "stale" && (
            <div className="between" style={{ alignItems: "center", gap: 24, flexWrap: "wrap" ,padding: 28}}>
              <div><div className="t-title">Your last transaction is {s.freshness.ageDays} days old</div><p className="muted small" style={{ marginTop: 4 }}>The forecast starts from {dayYear(f.asOfDate)}. Upload this month&rsquo;s statement to bring it up to today.</p></div>
              <Link href="/import" className="btn sm">Upload statement</Link>
            </div>
          )}
          {s.freshness.level === "stale" && st && st.pending > 0 && <div style={{ borderTop: "1px solid var(--mist)", margin: "20px 0" }} />}
          {st && st.pending > 0 && (
            <div className="between" style={{ alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              <div><div className="t-title">{st.pending} quick question{st.pending === 1 ? "" : "s"} will sharpen your forecast</div><p className="muted small" style={{ marginTop: 4 }}>Tell us what you will keep, cancel or change, such as subscriptions, EMIs and salary.</p></div>
              <Link href="/review" className="btn sm">Answer questions</Link>
            </div>
          )}
        </div>
      )}

      <div className="kpis">
        <div className="card kpi">
          <div><div className="tag">Balance</div><div className="v num">{money(f.startBalance)}</div></div>
          <div className="foot"><span className="small muted">{ins.history.length} days of history</span><Sparkline values={ins.history.map((h: any) => h.balance)} /></div>
        </div>
        <div className="card kpi">
          <div><div className="tag">Income, 30 days</div><div className="v num">{money(s.income30)}</div></div>
          <div className="foot"><span className="small muted">{s.income30 > 0 ? "Money in" : "None found"}</span><Sparkline values={ins.daily30.income} /></div>
        </div>
        <div className="card kpi">
          <div><div className="tag">Spending, 30 days</div><div className="v num">{money(s.spend30)}</div></div>
          <div className="foot"><span className="small muted">{kept == null ? "" : `${pct(Math.max(0, s.spend30 / s.income30))} of income`}</span><Sparkline values={ins.daily30.spend} /></div>
        </div>
        <div className="card kpi pop">
          <div><div className="tag">Safe to spend now</div><div className="v num">{money(s.safeToSpend.amount)}</div></div>
          <div className="small">{s.safeToSpend.amount > 0 ? `About ${money(s.safeToSpend.perDay)} a day over ${f.horizon} days` : "No spare money to commit right now"}</div>
        </div>
      </div>

      <div className="card fog">
        <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="stat"><div className="tag">Chance below zero</div><div className="v">{pct(f.shortageProbability)}</div></div>
          <div className="stat"><div className="tag">Forecast confidence</div><div className="v">{CONF[f.uncertainty]}</div></div>
          <div className="stat"><div className="tag">Kept from income</div><div className="v">{kept == null ? "n/a" : pct(kept)}</div></div>
          <div className="stat"><div className="tag">Fixed bills a month</div><div className="v">{money(fixedMonthly)}</div></div>
          <div className="stat"><div className="tag">Average a day</div><div className="v">{money(s.spend30 / 30)}</div></div>
          <div className="stat"><div className="tag">Bad-case balance</div><div className="v">{money(f.worstCaseMin)}</div></div>
        </div>
      </div>

      <form className="float" onSubmit={ask} style={{ padding: 16 }}>
        <div className="composer">
          <input aria-label="Ask the assistant" placeholder="Ask the assistant about a purchase, a loan, or where to cut back" value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} />
          <button className="send" aria-label="Ask the assistant" disabled={q.trim().length < 3}>→</button>
        </div>
      </form>

      <div className="split">
        <section className="float" aria-labelledby="proj" style={{ padding: "24px 24px 18px" }}>
          <div className="between"><h2 className="t-title" id="proj">Balance and forecast</h2><button className="btn ghost sm" onClick={explain} disabled={explaining}>{explaining ? "Explaining…" : "Explain this"}</button></div>
          <div style={{ marginTop: 14 }}><ForecastChart points={f.points} start={f.startBalance} history={s.history} /></div>
          {why && <p className="note" style={{ marginTop: 14 }}>{why}</p>}
          {f.uncertaintyReasons.length > 0 && <ul className="muted small" style={{ margin: "12px 0 0", paddingLeft: 18 }}>{f.uncertaintyReasons.map((r: string) => <li key={r}>{r}</li>)}</ul>}
        </section>

        <section className="card" aria-labelledby="hl">
          <h2 className="t-title" id="hl">Financial health</h2>
          <div className="row" style={{ gap: 20, margin: "18px 0", flexWrap: "nowrap" }}>
            <Ring value={s.health.score} size={104} />
            <div><div className="h-sm">{s.health.label}</div><p className="small muted" style={{ marginTop: 4 }}>Four weighted measures</p></div>
          </div>
          <div className="divider">
            {s.health.parts.map((p: any) => (
              <div key={p.name} className="item" style={{ padding: "10px 0" }}>
                <div><div style={{ fontWeight: 450 }}>{p.name}</div><div className="small muted">{p.detail}</div></div>
                <div className="num" style={{ fontWeight: 450 }}>{p.score}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid3">
        <section className="card" aria-labelledby="cat">
          <div className="between"><h2 className="t-title" id="cat">Spending by category</h2><Link href="/spending" className="more small">Details</Link></div>
          {cats.length ? (
            <div className="row" style={{ marginTop: 18, gap: 20, flexWrap: "nowrap", alignItems: "center" }}>
              <Donut items={cats} size={150} center={money(ins.monthSpend)} />
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8, fontSize: 14, minWidth: 0, flex: 1 }}>
                {cats.map((c: any, i: number) => (
                  <li key={c.label} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <Link href={c.label === "Everything else" ? "/spending" : `/spending/category/${encodeURIComponent(c.label)}`} style={{ color: "inherit" }}><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: DONUT_COLORS[i], marginRight: 8 }} />{c.label}</Link>
                    <span className="num muted">{pct(c.value / ins.monthSpend)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="muted" style={{ marginTop: 14 }}>No spending this month yet.</p>}
        </section>

        <section className="card" aria-labelledby="ivs">
          <h2 className="t-title" id="ivs">Income and spending</h2>
          <div style={{ marginTop: 18 }}><PairedColumns height={130} items={ins.months.map((m: any) => ({ label: monthShort(m.month), a: m.income, b: m.spend }))} /></div>
        </section>

        <section className="card" aria-labelledby="pace">
          <div className="between"><h2 className="t-title" id="pace">Month pace</h2>
            <span className="small muted num">{ins.previousMonthSpend > 0 ? `${money(ins.monthSpend)} vs ${money(ins.previousMonthSpend)}` : money(ins.monthSpend)}</span></div>
          <div style={{ marginTop: 14 }}><PaceChart data={ins.pace} /></div>
        </section>
      </div>

      <div className="grid3">
        <section className="card" aria-labelledby="wk">
          <h2 className="t-title" id="wk">Spending by weekday</h2>
          <p className="small muted" style={{ margin: "4px 0 16px" }}>Average, last 90 days</p>
          <ColumnChart height={120} items={ins.weekday.map((w: any) => ({ label: w.day, value: w.avg }))} format={(n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)))} />
        </section>

        <section className="card" aria-labelledby="mer">
          <h2 className="t-title" id="mer">Top merchants</h2>
          <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
            {ins.merchants.slice(0, 5).map((m: any) => (
              <div key={m.name}>
                <div className="between"><Link href={`/spending/merchant/${encodeURIComponent(m.name)}`} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</Link><span className="num small">{money(m.amount)}</span></div>
                <div style={{ marginTop: 6 }}><Meter value={m.amount} max={maxMer} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="due">
          <div className="between"><h2 className="t-title" id="due">Due in 30 days</h2><Link href="/bills" className="more small">All bills</Link></div>
          <div className="divider" style={{ marginTop: 14 }}>
            {due30.length ? due30.slice(0, 5).map((r: any) => (
              <div className="item" key={r.key} style={{ padding: "11px 0" }}>
                <div style={{ minWidth: 0 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div><div className="small tag">{day(r.nextDate)}</div></div>
                <div className="num">{money(r.amount)}</div>
              </div>
            )) : <p className="muted">Nothing due. Bills appear after a payment repeats three times.</p>}
          </div>
        </section>
      </div>

      <div className="grid3">
        <section className="card" aria-labelledby="bud">
          <div className="between"><h2 className="t-title" id="bud">Budgets</h2><span className="tag small">{monthLabel(s.month)}</span></div>
          <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
            {s.limits.slice(0, 5).map((l: any) => (
              <div key={l.category}>
                <div className="between"><span>{l.category}</span><span className="small muted num">{money(l.spent)} of {money(l.suggested)}{l.spent > l.suggested ? ", over" : ""}</span></div>
                <div style={{ marginTop: 7 }}><Meter value={l.spent} max={l.suggested} /></div>
              </div>
            ))}
            {!s.limits.length && <p className="muted">No categories to budget yet.</p>}
          </div>
        </section>

        <section className="card" aria-labelledby="ano">
          <h2 className="t-title" id="ano">Unusual spending</h2>
          <div className="divider" style={{ marginTop: 14 }}>
            {s.anomalies.length ? s.anomalies.slice(0, 4).map((a: any) => (
              <div className="item" key={a.txnId} style={{ padding: "11px 0" }}>
                <div style={{ minWidth: 0 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description}</div><div className="small tag">{day(a.date)}, {(a.amount / -a.typical).toFixed(1)}x typical</div></div>
                <div className="num">{money(a.amount)}</div>
              </div>
            )) : <p className="muted">Nothing unusual found.</p>}
          </div>
        </section>

        <section className="card" aria-labelledby="acc">
          <h2 className="t-title" id="acc">Forecast accuracy</h2>
          {!bt ? <p className="muted" style={{ marginTop: 12 }}>Checking…</p> : bt.folds?.length ? (<>
            <p className="small" style={{ marginTop: 10 }}>{bt.verdict}.</p>
            <div className="divider" style={{ marginTop: 12 }}>
              <div className="item"><span className="muted">Average miss</span><span className="num">{money(bt.mae)}</span></div>
              <div className="item"><span className="muted">Miss vs balance</span><span className="num">{pct(bt.wape)}</span></div>
              <div className="item"><span className="muted">Inside range</span><span className="num">{pct(bt.coverage)}</span></div>
            </div>
          </>) : <p className="muted small" style={{ marginTop: 12 }}>{bt.verdict}.</p>}
          {bt?.lookback && (
            <div style={{ marginTop: 16 }}>
              <div className="item" style={{ padding: 0 }}><span className="muted">History used for spending</span><span className="small" style={{ fontWeight: 600, textAlign: "right" }}>{bt.lookback.chosen}</span></div>
              <p className="small muted" style={{ marginTop: 6 }}>{bt.lookback.reason}.</p>
              {bt.lookback.scores.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>How this was chosen</summary>
                  <p className="small muted" style={{ marginTop: 8 }}>
                    We re-ran the forecast from {bt.lookback.folds} past dates using only what was known then, once for each option, and compared it with what really happened over the next {bt.lookback.horizon} days. Lower score is better.
                  </p>
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table className="ptable" style={{ fontSize: 13 }}>
                      <thead><tr><th>History</th><th className="r">Score</th><th className="r">Avg miss</th><th className="r">Inside range</th></tr></thead>
                      <tbody>
                        {bt.lookback.scores.map((s: any) => (
                          <tr key={s.key} style={s.label === bt.lookback.chosen ? { fontWeight: 600 } : undefined}>
                            <td style={{ whiteSpace: "normal" }}>{s.label}</td><td className="r num">{s.loss.toFixed(3)}</td><td className="r num">{money(s.mae)}</td><td className="r num">{pct(s.coverage)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
