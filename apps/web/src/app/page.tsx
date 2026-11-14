"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ForecastChart } from "@/components/ForecastChart";
import { api, money, pct } from "@/lib/api";

export default function Dashboard() {
  const [s, setS] = useState<any>(null);
  const [bt, setBt] = useState<any>(null);
  const [why, setWhy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/analysis/summary").then(setS).catch((e) => setErr(e.message));
    api("/analysis/backtest").then(setBt).catch(() => {});
  }, []);

  if (err) return <div className="err">{err}</div>;
  if (!s) return <p className="mute">Loading your forecast...</p>;
  if (s.empty) return <div className="card"><h1>No data yet</h1><p><Link href="/import">Import a bank statement CSV</Link> to see your forecast.</p></div>;
  const f = s.forecast;
  const risk = f.shortageProbability;
  const riskCls = risk < 0.1 ? "ok" : risk < 0.4 ? "warn" : "bad";

  return (
    <>
      <h1>Cash-flow outlook</h1>
      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="card"><div className="mute">Balance on {f.asOfDate}</div><div className="stat">{money(f.startBalance)}</div></div>
        <div className="card"><div className="mute">Chance of going negative in {f.horizon} days</div><div className={`stat ${riskCls}`}>{pct(risk)}</div>
          <div className="mute">{f.expectedShortageDate ? `Most likely around ${f.expectedShortageDate}` : "No shortage expected"}</div></div>
        <div className="card"><div className="mute">Forecast confidence</div><div className="stat">{f.uncertainty === "LOW" ? "High" : f.uncertainty === "MEDIUM" ? "Medium" : "Low"}</div>
          <div className="mute">Worst realistic balance (p10): {money(f.worstCaseMin)}</div></div>
      </div>

      <div className="card">
        <h2>Projected balance</h2>
        <ForecastChart points={f.points} start={f.startBalance} />
        <ul className="mute">{f.assumptions.map((a: string) => <li key={a}>{a}</li>)}{f.uncertaintyReasons.map((a: string) => <li key={a} className="warn">{a}</li>)}</ul>
        <button className="ghost" onClick={async () => setWhy((await api("/analysis/explain", { method: "POST", body: {} })).explanation)}>Explain this in plain language</button>
        {why && <p className="expl">{why}</p>}
      </div>

      <div className="grid">
        <div className="card"><h2>Recurring payments</h2>
          <table><tbody>{s.recurring.map((r: any) => (
            <tr key={r.key}><td>{r.name}<div className="mute">{r.cadenceLabel} · {pct(r.confidence)} sure</div></td>
              <td className="right"><span className={r.amount < 0 ? "" : "ok"}>{money(r.amount)}</span><div className="mute">next {r.nextDate}</div></td></tr>))}
          </tbody></table>
          {!s.recurring.length && <p className="mute">None detected yet.</p>}
        </div>
        <div className="card"><h2>Suggested monthly limits</h2>
          <table><tbody>{s.limits.map((l: any) => (
            <tr key={l.category}><td>{l.category}<div className="mute">{l.reason}</div></td>
              <td className="right"><b>{money(l.suggested)}</b><div className="mute">avg {money(l.avgMonthly)}</div></td></tr>))}
          </tbody></table>
        </div>
        <div className="card"><h2>Unusual spending</h2>
          {s.anomalies.length ? <table><tbody>{s.anomalies.map((a: any) => (
            <tr key={a.txnId}><td>{a.description}<div className="mute">{a.date} · {a.reason}</div></td><td className="right bad">{money(a.amount)}</td></tr>))}</tbody></table>
            : <p className="mute">Nothing unusual found.</p>}
        </div>
        <div className="card"><h2>How accurate has this been?</h2>
          {bt?.folds?.length ? (<>
            <p>{bt.verdict}</p>
            <p className="mute">Backtested on {bt.folds.length} past cutoffs · avg error {money(bt.mae)} · {pct(bt.wape)} of balance · {pct(bt.coverage)} of actual days fell inside the band (ideal ≈ 80%)</p>
            <table><thead><tr><th>Cutoff</th><th>Error</th><th>In band</th></tr></thead><tbody>{bt.folds.map((x: any) => (
              <tr key={x.cutoff}><td>{x.cutoff}</td><td>{money(x.mae)}</td><td>{pct(x.coverage)}</td></tr>))}</tbody></table></>)
            : <p className="mute">{bt?.verdict ?? "Loading..."}</p>}
        </div>
      </div>
    </>
  );
}
