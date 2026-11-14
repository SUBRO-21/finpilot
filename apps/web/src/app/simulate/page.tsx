"use client";
import { useState } from "react";
import { ForecastChart } from "@/components/ForecastChart";
import { api, money, pct } from "@/lib/api";

export default function Simulate() {
  const [type, setType] = useState<"PURCHASE" | "LOAN">("PURCHASE");
  const [v, setV] = useState({ amount: "50000", inDays: "7", principal: "300000", rate: "10", months: "24", startIn: "30" });
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  async function run(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    const scenario = type === "PURCHASE"
      ? { type, amount: +v.amount, inDays: +v.inDays }
      : { type, principal: +v.principal, annualRatePct: +v.rate, months: +v.months, startInDays: +v.startIn };
    try { setRes(await api("/analysis/simulate", { body: { scenario, horizon: 90 } })); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  const verdictCls = res?.verdict === "SAFE" ? "ok" : res?.verdict === "RISKY" ? "warn" : "bad";

  return (
    <>
      <h1>What if...?</h1>
      <form className="card" onSubmit={run} style={{ maxWidth: 520 }}>
        <div className="row"><button type="button" className={type === "PURCHASE" ? "" : "ghost"} onClick={() => setType("PURCHASE")}>Large purchase</button>
          <button type="button" className={type === "LOAN" ? "" : "ghost"} onClick={() => setType("LOAN")}>Take a loan</button></div>
        {type === "PURCHASE" ? (<>
          <label htmlFor="a">Amount</label><input id="a" type="number" min="1" value={v.amount} onChange={set("amount")} />
          <label htmlFor="d">Days from the end of your data</label><input id="d" type="number" min="1" value={v.inDays} onChange={set("inDays")} /></>) : (<>
          <label htmlFor="p">Loan amount</label><input id="p" type="number" min="1" value={v.principal} onChange={set("principal")} />
          <label htmlFor="r">Annual interest rate (%)</label><input id="r" type="number" min="0" step="0.1" value={v.rate} onChange={set("rate")} />
          <label htmlFor="m">Term (months)</label><input id="m" type="number" min="1" value={v.months} onChange={set("months")} />
          <label htmlFor="s">First repayment in (days)</label><input id="s" type="number" min="1" value={v.startIn} onChange={set("startIn")} /></>)}
        <div style={{ marginTop: 14 }}><button disabled={busy}>{busy ? "Simulating..." : "Run simulation"}</button></div>
        {err && <div className="err">{err}</div>}
      </form>

      {res && (<>
        <div className="grid" style={{ marginBottom: 16 }}>
          <div className="card"><div className="mute">Verdict</div><div className={`stat ${verdictCls}`}>{res.verdict === "UNAFFORDABLE" ? "Not affordable" : res.verdict === "RISKY" ? "Risky" : "Safe"}</div>
            {res.emi && <div className="mute">Monthly repayment ≈ {money(res.emi)}</div>}</div>
          <div className="card"><div className="mute">Chance of going negative</div><div className="stat">{pct(res.baseline.shortageProbability)} → {pct(res.scenario.shortageProbability)}</div></div>
          <div className="card"><div className="mute">Worst realistic balance (p10)</div><div className="stat">{money(res.baseline.worstCaseMin)} → {money(res.scenario.worstCaseMin)}</div></div>
        </div>
        <div className="card"><h2>Balance with this decision</h2><ForecastChart points={res.scenario.points} start={res.scenario.startBalance} />
          <p className="mute">Forecast confidence: {res.scenario.uncertainty.toLowerCase()}. {res.scenario.uncertaintyReasons.join(" ")}</p></div>
        <div className="card"><h2>Why</h2><p className="expl">{res.explanation}</p></div>
      </>)}
    </>
  );
}
