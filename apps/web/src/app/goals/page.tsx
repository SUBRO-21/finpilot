"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Meter } from "@/components/Bits";
import { api, dayYear, money, pct } from "@/lib/api";

type Goal = {
  id: string; label: string; target: number; saved: number; remaining?: number; progress?: number; targetDate: string;
  monthsLeft?: number; monthlyNeeded?: number; availablePerMonth?: number; status?: string; reachDate?: string | null; reasons?: string[];
};
type Data = { hasData: boolean; asOfDate: string | null; pace: number; paceDays: number; goals: Goal[] };

const STATUS: Record<string, { label: string; meaning: string }> = {
  ON_TRACK: { label: "On track", meaning: "Your usual savings cover this." },
  STRETCH: { label: "A stretch", meaning: "Reachable, but only with a little less spending." },
  OFF_TRACK: { label: "Off track", meaning: "At your current pace you will miss the date." },
  DONE: { label: "Done", meaning: "You have saved the full amount." },
  PAST_DUE: { label: "Date passed", meaning: "Set a new date to get a fresh plan." },
};

export default function Goals() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ label: "", target: "", saved: "", date: "" });
  const [edit, setEdit] = useState<{ id: string; saved: string } | null>(null);

  const load = useCallback(() => api<Data>("/goals").then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await api("/goals", { body: { label: f.label, target: Number(f.target), saved: Number(f.saved || 0), targetDate: f.date } });
      setF({ label: "", target: "", saved: "", date: "" });
      await load();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function saveProgress(e: React.FormEvent) {
    e.preventDefault(); if (!edit) return;
    setBusy(true); setErr("");
    try { await api(`/goals/${edit.id}`, { method: "PATCH", body: { saved: Number(edit.saved) } }); setEdit(null); await load(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function remove(id: string) {
    setBusy(true);
    try { await api(`/goals/${id}`, { method: "DELETE" }); await load(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  if (err && !d) return <div className="card"><p className="err" style={{ margin: 0 }}>{err}</p></div>;
  if (!d) return <div className="skeleton" style={{ height: 420, marginTop: 40 }} />;

  const minDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <>
      <section className="hero">
        {d.asOfDate && <div className="tag">Checked against your data through {dayYear(d.asOfDate)}</div>}
        <h1 className="h-lg">Save for what <em>matters</em>.</h1>
        <p className="lead">Set a goal and a date. We check it against how much you really save each month and tell you if it fits.</p>
      </section>

      {d.hasData ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="tag">Your savings pace</div>
          <div className="serif" style={{ fontSize: 40, marginTop: 6 }}>{d.pace >= 0 ? money(d.pace) : `−${money(-d.pace)}`} <span className="small muted" style={{ fontWeight: 400, letterSpacing: 0 }}>a month</span></div>
          <p className="small muted" style={{ marginTop: 6 }}>
            Money in minus money out over the last {d.paceDays} days, not counting moves between your own accounts. SIPs and EMIs count as money out, since that cash is not free for a goal.
          </p>
        </div>
      ) : (
        <div className="card fog" style={{ marginBottom: 24 }}>
          <p>Goals are checked against your bank statement. <Link href="/import" className="more">Import a statement</Link> to see whether each one fits.</p>
        </div>
      )}

      <div className="grid2" style={{ alignItems: "start" }}>
        <div style={{ display: "grid", gap: 20 }}>
          {d.goals.length === 0 && <div className="card empty">No goals yet. Add your first one to see a monthly plan.</div>}
          {d.goals.map((g) => {
            const st = g.status ? STATUS[g.status] : null;
            const warn = g.status === "OFF_TRACK" || g.status === "PAST_DUE";
            return (
              <article key={g.id} className="card" aria-labelledby={`g-${g.id}`}>
                <div className="between">
                  <h2 className="t-title" id={`g-${g.id}`}>{g.label}</h2>
                  {st && <span className={`chip ${warn ? "warn-chip" : ""}`} title={st.meaning}>{st.label}</span>}
                </div>
                <p className="small muted" style={{ marginTop: 4 }}>{money(g.target)} by {dayYear(g.targetDate)}</p>
                <div style={{ marginTop: 14 }}><Meter value={g.saved} max={g.target} /></div>
                <div className="between small" style={{ marginTop: 8 }}>
                  <span>{money(g.saved)} saved ({pct(g.target ? g.saved / g.target : 0)})</span>
                  <span className="muted">{money(Math.max(0, g.target - g.saved))} to go</span>
                </div>

                {g.monthlyNeeded != null && g.status !== "DONE" && (
                  <div className="divider" style={{ marginTop: 16 }}>
                    <div className="item" style={{ padding: "12px 0" }}><span>Needed each month</span><span className="num" style={{ fontWeight: 600 }}>{money(g.monthlyNeeded)}</span></div>
                    <div className="item" style={{ padding: "12px 0" }}><span>Free for this goal each month</span><span className="num">{money(g.availablePerMonth ?? 0)}</span></div>
                    {g.reachDate && g.status !== "ON_TRACK" && <div className="item" style={{ padding: "12px 0" }}><span>At your current pace</span><span className="num">{dayYear(g.reachDate)}</span></div>}
                  </div>
                )}
                {st && <p className="small" style={{ marginTop: 14, fontWeight: 600 }}>{st.meaning}</p>}
                {g.reasons && g.reasons.length > 0 && (
                  <ul className="md-list small" style={{ marginTop: 8 }}>{g.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                )}

                {edit?.id === g.id ? (
                  <form onSubmit={saveProgress} style={{ marginTop: 14 }}>
                    <label className="f" htmlFor={`s-${g.id}`} style={{ marginTop: 0 }}>Saved so far (₹)</label>
                    <input id={`s-${g.id}`} type="number" min="0" step="any" autoFocus required value={edit.saved} onChange={(e) => setEdit({ ...edit, saved: e.target.value })} />
                    <div className="row" style={{ marginTop: 12 }}>
                      <button className="btn sm" disabled={busy}>Save</button>
                      <button type="button" className="btn ghost sm" onClick={() => setEdit(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="row" style={{ marginTop: 16 }}>
                    <button className="btn ghost sm" disabled={busy} onClick={() => setEdit({ id: g.id, saved: String(g.saved) })}>Update saved amount</button>
                    <button className="linkbtn small muted" disabled={busy} onClick={() => remove(g.id)} aria-label={`Remove goal ${g.label}`}>Remove</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="float" style={{ padding: 32 }}>
          <h2 className="t-title">Add a goal</h2>
          <p className="small muted" style={{ marginTop: 4 }}>A trip, an emergency fund, a down payment. Earlier goals get your savings first.</p>
          <form onSubmit={add}>
            <label className="f" htmlFor="gl">What are you saving for?</label>
            <input id="gl" maxLength={60} placeholder="Goa trip, emergency fund" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} required />
            <div className="grid2" style={{ gap: 16 }}>
              <div><label className="f" htmlFor="gt">Amount (₹)</label><input id="gt" type="number" min="1" step="any" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} required /></div>
              <div><label className="f" htmlFor="gs">Already saved (₹)</label><input id="gs" type="number" min="0" step="any" placeholder="0" value={f.saved} onChange={(e) => setF({ ...f, saved: e.target.value })} /></div>
            </div>
            <label className="f" htmlFor="gd">By when?</label>
            <input id="gd" type="date" min={minDate} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
            <div className="row" style={{ marginTop: 20 }}><button className="btn" disabled={busy}>{busy ? "Saving…" : "Add goal"}</button></div>
          </form>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
      </div>
    </>
  );
}
