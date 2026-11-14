"use client";
import { useCallback, useEffect, useState } from "react";
import { api, money } from "@/lib/api";

const CATS = ["Income","Rent","Groceries","Dining","Transport","Utilities","Subscriptions","Loan/EMI","Shopping","Health","Entertainment","Travel","Education","Transfers","Fees","Refund","Other"];

export default function Transactions() {
  const [rows, setRows] = useState<any[]>([]);
  const [merchantOnly, setMerchantOnly] = useState(false);
  const [recalling, setRecalling] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(() => api(`/transactions${merchantOnly ? "?merchantOnly=true" : ""}`).then(setRows).catch((e) => setErr(e.message)), [merchantOnly]);
  useEffect(() => { load(); }, [load]);

  async function patch(id: string, body: object) { await api(`/transactions/${id}`, { method: "PATCH", body }); load(); }
  async function submitRecall() {
    setErr("");
    try { await api("/recalls", { body: { transactionId: recalling.id, reason } }); setRecalling(null); setReason(""); load(); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <>
      <h1>Transactions</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <label style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={merchantOnly} onChange={(e) => setMerchantOnly(e.target.checked)} /> Merchant payments only</label>
      </div>
      {err && <div className="err">{err}</div>}
      {recalling && (
        <div className="card" role="dialog" aria-label="Recall payment">
          <h2>Recall payment to {recalling.description}</h2>
          <p className="mute">{money(recalling.amount)} on {recalling.date} · {recalling.recall.daysLeft} days left to recall</p>
          <label htmlFor="reason">Why are you recalling this payment?</label>
          <textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Item never arrived, charged twice" />
          <div className="row" style={{ marginTop: 12 }}>
            <button disabled={reason.trim().length < 5} onClick={submitRecall}>Request recall</button>
            <button className="ghost" onClick={() => setRecalling(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Receiver</th><th className="right">Amount</th><th></th></tr></thead>
          <tbody>{rows.map((t) => (
            <tr key={t.id}>
              <td>{t.date}</td><td>{t.description}</td>
              <td><select aria-label="Category" value={t.category} onChange={(e) => patch(t.id, { category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></td>
              <td>{t.amount < 0 ? (
                <select aria-label="Receiver type" value={t.isMerchant ? "m" : "p"} onChange={(e) => patch(t.id, { isMerchant: e.target.value === "m" })}>
                  <option value="m">Merchant</option><option value="p">Person / other</option></select>) : <span className="mute">-</span>}</td>
              <td className={`right ${t.amount < 0 ? "" : "ok"}`}>{money(t.amount)}</td>
              <td>{t.amount < 0 && (t.recall.eligible
                ? <button className="ghost" onClick={() => setRecalling(t)}>Recall</button>
                : t.recall.latest ? <span className="pill">{t.recall.latest.status.replace("_", " ").toLowerCase()}</span>
                : <span className="mute" title={t.recall.reason}>-</span>)}</td>
            </tr>))}
          </tbody>
        </table>
        {!rows.length && <p className="mute" style={{ padding: 16 }}>No transactions yet.</p>}
      </div>
    </>
  );
}
