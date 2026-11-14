"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DATA_EVENT } from "@/components/Shell";
import { api, dayYear, money } from "@/lib/api";

export default function ImportPage() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const lastCsv = useRef<string>("");
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(false);

  async function run(csv: string, replace: boolean, force = false) {
    setBusy(true); setErr(""); setRes(null);
    try {
      const r = await api("/transactions/import", { body: { csv, replace, force } });
      setRes(r);
      window.dispatchEvent(new Event(DATA_EVENT));
      // A mismatch means the file may belong to a different account: let the user decide before the questions start
      if (r.mismatch) { setBusy(false); return; }
      const st = await api("/plan/status");
      if (st.pending > 0) { router.push("/review?from=import"); return; }
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  async function onFile(file?: File) {
    if (!file) return;
    lastCsv.current = await file.text();
    await run(lastCsv.current, fresh);
    if (input.current) input.current.value = "";
  }

  return (
    <>
      <section className="hero" style={{ paddingBottom: 32 }}>
        <h1 className="h-lg">Bring in your <em>statement</em>.</h1>
        <p className="lead">Upload a bank statement as CSV. Transactions are labelled and categorized automatically, and ones you already imported are skipped.</p>
      </section>
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="float" style={{ padding: 32 }}>
          <h2 className="t-title">Choose a file</h2>
          <p className="small muted" style={{ marginTop: 4 }}>CSV, up to about 5 MB. A full year of UPI payments is fine.</p>
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />

          <label className="row" style={{ marginTop: 20, gap: 10, alignItems: "flex-start", flexWrap: "nowrap", cursor: "pointer" }}>
            <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} style={{ width: 20, minHeight: 20, marginTop: 3 }} />
            <span><span style={{ fontWeight: 600 }}>Start fresh with this file</span><br /><span className="small muted">Deletes your earlier transactions and answers first. Use this when the file is a different account.</span></span>
          </label>

          <div style={{ marginTop: 20 }}>
            <button className="btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Importing…" : "Choose CSV file"}</button>
          </div>
          {err && <p className="err" role="alert">{err}</p>}

          {res && (
            <div className={`card ${res.mismatch ? "" : "pop"}`} role="status" style={{ marginTop: 24, boxShadow: res.mismatch ? "var(--shadow-md2)" : undefined }}>
              <div className="h-sm">{res.blocked ? "Not imported yet" : `${res.imported.toLocaleString("en-IN")} imported`}</div>
              <p className="small" style={{ marginTop: 6 }}>{dayYear(res.firstDate)} to {dayYear(res.lastDate)}{res.replaced ? ", replacing your earlier data" : ""}</p>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
                {res.duplicatesSkipped > 0 && <li>{res.duplicatesSkipped} already imported, skipped</li>}
                {res.aiCategorized > 0 && <li>{res.aiCategorized} categorized by AI</li>}
                {res.warnings.length > 0 && <li>{res.warnings.length} rows could not be read</li>}
              </ul>
              {res.mismatch && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontWeight: 600 }}>This file does not continue from your earlier data.</p>
                  <p className="small" style={{ marginTop: 4 }}>Your records say the balance before it started should be {money(res.mismatch.expected)}, but the statement opens at {money(res.mismatch.found)}. It may be a different account. Nothing has been saved yet.</p>
                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn sm" disabled={busy} onClick={() => run(lastCsv.current, true)}>Replace my data with this file</button>
                    <button className="btn ghost sm" disabled={busy} onClick={() => run(lastCsv.current, false, true)}>Add anyway</button>
                  </div>
                </div>
              )}
              {!res.mismatch && <p style={{ marginTop: 14 }}><Link href="/review" className="more">Review what repeats</Link> <span className="muted">or</span> <Link href="/" className="more">see your forecast</Link></p>}
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="t-title">What the file needs</h2>
          <div className="divider" style={{ marginTop: 18 }}>
            <div className="item"><span>Dates</span><span className="muted r small">2026-11-01, 01/11/2026 or 15-NOV-2025</span></div>
            <div className="item"><span>A description</span><span className="muted r small">Description, Narration or Particulars</span></div>
            <div className="item"><span>Amounts</span><span className="muted r small">One signed Amount column, or Debit and Credit</span></div>
            <div className="item"><span>Starting balance</span><span className="muted r small">From an Opening Balance row or the running balance</span></div>
            <div className="item"><span>Header row</span><span className="muted r small">Optional. Bank exports without one are recognised</span></div>
          </div>
          <p className="small muted" style={{ marginTop: 18 }}>UPI payments are read for their shop type and payee, so &ldquo;UPIOUT/…/5411&rdquo; becomes a grocery store. The original bank text stays on each transaction.</p>
        </div>
      </div>
    </>
  );
}
