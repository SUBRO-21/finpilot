"use client";
import { useCallback, useEffect, useState } from "react";
import { api, money } from "@/lib/api";

const NEXT: Record<string, string[]> = {
  REQUESTED: ["UNDER_REVIEW", "REFUNDED", "REJECTED", "WITHDRAWN"],
  UNDER_REVIEW: ["REFUNDED", "REJECTED", "WITHDRAWN"],
};
const LABEL: Record<string, string> = { UNDER_REVIEW: "Merchant is reviewing", REFUNDED: "Mark refunded", REJECTED: "Mark rejected", WITHDRAWN: "Withdraw recall" };

export default function Recalls() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const load = useCallback(() => api("/recalls").then(setRows).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function move(id: string, status: string) {
    setErr("");
    try { await api(`/recalls/${id}`, { method: "PATCH", body: { status } }); load(); } catch (e) { setErr((e as Error).message); }
  }

  return (
    <>
      <h1>Recall requests</h1>
      <p className="mute">Track payments you have asked a merchant to reverse. Update the status as the merchant responds; marking a recall refunded adds the money back to your cash-flow forecast.</p>
      {err && <div className="err">{err}</div>}
      {rows.map((r) => (
        <div className="card" key={r.id}>
          <div className="row"><b>{r.transaction.description}</b><span className="pill">{r.status.replace("_", " ").toLowerCase()}</span><span className="sp" style={{ flex: 1 }} /><b>{money(r.transaction.amount)}</b></div>
          <p className="mute">Requested {r.createdAt.slice(0, 10)} · {r.reason}</p>
          <ol className="mute">{(r.history as any[]).map((h, i) => <li key={i}>{h.status.replace("_", " ").toLowerCase()} · {h.at.slice(0, 10)}</li>)}</ol>
          <div className="row">{(NEXT[r.status] ?? []).map((s) => (
            <button key={s} className={s === "WITHDRAWN" || s === "REJECTED" ? "danger" : "ghost"} onClick={() => move(r.id, s)}>{LABEL[s]}</button>))}</div>
        </div>
      ))}
      {!rows.length && <div className="card mute">No recalls yet. Open Transactions and choose Recall on a merchant payment.</div>}
    </>
  );
}
