"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORIES } from "@finos/engine";
import { api, dayYear, money } from "@/lib/api";

const PAGE = 200;

export default function Transactions() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [err, setErr] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [offer, setOffer] = useState<{ id: string; label: string; category: string; count: number } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => api("/transactions").then(setRows).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setShown(PAGE); }, [q, cat]);

  const filtered = useMemo(
    () => (rows ?? []).filter((t) => (!cat || t.category === cat) && (!q || t.description.toLowerCase().includes(q.toLowerCase()) || (t.raw ?? "").toLowerCase().includes(q.toLowerCase()))),
    [rows, q, cat],
  );
  const net = filtered.reduce((a, t) => a + t.amount, 0);

  async function recategorize(t: any, category: string) {
    setErr(""); setNote("");
    const others = (rows ?? []).filter((r) => r.description === t.description && r.id !== t.id).length;
    setRows((r) => r && r.map((x) => (x.id === t.id ? { ...x, category } : x)));
    try {
      await api(`/transactions/${t.id}`, { method: "PATCH", body: { category } });
      setOffer(others > 0 ? { id: t.id, label: t.description, category, count: others } : null);
    } catch (e) { setErr((e as Error).message); load(); }
  }
  async function applyAll() {
    if (!offer) return;
    try {
      const r = await api(`/transactions/${offer.id}`, { method: "PATCH", body: { category: offer.category, applyToAll: true } });
      setNote(`${r.updated} payments from ${offer.label} are now ${offer.category}. Future imports will remember this.`);
      setOffer(null); load();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <>
      <section className="hero" style={{ paddingBottom: 32 }}>
        <h1 className="h-lg">Every <em>transaction</em>.</h1>
        <p className="lead">Fix a category and your budgets and forecast learn from it. Hover a row to see the original bank text.</p>
      </section>

      <div className="row" style={{ marginBottom: 20 }}>
        <input type="search" aria-label="Search transactions" placeholder="Search by description" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 280px", maxWidth: 420 }} />
        <select aria-label="Filter by category" value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: "auto" }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        {rows && <span className="muted small num">{filtered.length} of {rows.length}, net {money(net)}</span>}
      </div>
      {err && <p className="err">{err}</p>}
      {note && <p role="status" className="small" style={{ marginBottom: 12, fontWeight: 600 }}>{note}</p>}
      {offer && (
        <div className="float" role="status" style={{ padding: "16px 20px", marginBottom: 20 }}>
          <div className="between" style={{ alignItems: "center", flexWrap: "wrap" }}>
            <span>{offer.count} other payment{offer.count === 1 ? "" : "s"} from <b>{offer.label}</b>. Make them all <b>{offer.category}</b>?</span>
            <span className="row"><button className="btn sm" onClick={applyAll}>Apply to all</button><button className="btn ghost sm" onClick={() => setOffer(null)}>Just this one</button></span>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: "20px 16px" }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {filtered.slice(0, shown).map((t) => (
                <tr key={t.id} title={t.raw ?? undefined}>
                  <td className="num muted">{dayYear(t.date)}</td>
                  <td>{t.description}</td>
                  <td>
                    <select className="quiet" aria-label={`Category for ${t.description}`} value={t.category} onChange={(e) => recategorize(t, e.target.value)}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="r num" style={{ fontWeight: 600 }}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows && !filtered.length && (
          <div className="empty">
            {rows.length ? <p>No transactions match your search.</p> : (<><p>No transactions yet.</p><Link href="/import" className="btn">Import a statement</Link></>)}
          </div>
        )}
        {!rows && !err && <div className="empty">Loading transactions…</div>}
        {filtered.length > shown && (
          <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
            <button className="btn ghost sm" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, filtered.length - shown)} more</button>
          </div>
        )}
      </div>
      {rows && rows.length >= 2000 && <p className="small tag" style={{ marginTop: 14 }}>Showing your latest 2,000 transactions.</p>}
    </>
  );
}
