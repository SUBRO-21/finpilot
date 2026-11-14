"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, dayYear, money } from "@/lib/api";

const CATS = ["Income","Rent","Groceries","Dining","Transport","Utilities","Subscriptions","Loan/EMI","Shopping","Health","Entertainment","Travel","Education","Transfers","Fees","Refund","Other"];

export default function Transactions() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(() => api("/transactions").then(setRows).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(
    () => (rows ?? []).filter((t) => (!cat || t.category === cat) && (!q || t.description.toLowerCase().includes(q.toLowerCase()))),
    [rows, q, cat],
  );
  const net = shown.reduce((a, t) => a + t.amount, 0);

  async function recategorize(id: string, category: string) {
    setErr("");
    setRows((r) => r && r.map((t) => (t.id === id ? { ...t, category } : t)));
    try { await api(`/transactions/${id}`, { method: "PATCH", body: { category } }); }
    catch (e) { setErr((e as Error).message); load(); }
  }

  return (
    <>
      <section className="hero" style={{ paddingBottom: 32 }}>
        <h1 className="h-lg">Every <em>transaction</em>.</h1>
        <p className="lead">Fix a category and your budgets and forecast learn from it.</p>
      </section>

      <div className="row" style={{ marginBottom: 20 }}>
        <input type="search" aria-label="Search transactions" placeholder="Search by description" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 280px", maxWidth: 420 }} />
        <select aria-label="Filter by category" value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: "auto" }}>
          <option value="">All categories</option>
          {CATS.map((c) => <option key={c}>{c}</option>)}
        </select>
        {rows && <span className="muted small num">{shown.length} of {rows.length}, net {money(net)}</span>}
      </div>
      {err && <p className="err">{err}</p>}

      <div className="card" style={{ padding: "20px 16px" }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id}>
                  <td className="num muted">{dayYear(t.date)}</td>
                  <td>{t.description}</td>
                  <td>
                    <select className="quiet" aria-label={`Category for ${t.description}`} value={t.category} onChange={(e) => recategorize(t.id, e.target.value)}>
                      {CATS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="r num" style={{ fontWeight: 450 }}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows && !shown.length && (
          <div className="empty">
            {rows.length ? <p>No transactions match your search.</p> : (<><p>No transactions yet.</p><Link href="/import" className="btn">Import a statement</Link></>)}
          </div>
        )}
        {!rows && !err && <div className="empty">Loading transactions…</div>}
      </div>
      {rows && rows.length >= 500 && <p className="small tag" style={{ marginTop: 14 }}>Showing your latest 500 transactions.</p>}
    </>
  );
}
