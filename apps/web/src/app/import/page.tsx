"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/lib/api";

export default function ImportPage() {
  const input = useRef<HTMLInputElement>(null);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true); setErr(""); setRes(null);
    try { setRes(await api("/transactions/import", { body: { csv: await file.text() } })); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <>
      <section className="hero" style={{ paddingBottom: 32 }}>
        <h1 className="h-lg">Bring in your <em>statement</em>.</h1>
        <p className="lead">Upload a bank statement as CSV. Transactions are categorized automatically and duplicates are skipped.</p>
      </section>
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="float" style={{ padding: 32 }}>
          <h2 className="t-title">Choose a file</h2>
          <p className="small muted" style={{ marginTop: 4 }}>CSV, up to about 5 MB</p>
          <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <div style={{ marginTop: 24 }}>
            <button className="btn" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Importing…" : "Choose CSV file"}</button>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          {res && (
            <div className="card pop" role="status" style={{ marginTop: 24 }}>
              <div className="serif" style={{ fontSize: 36, lineHeight: 1.1 }}>{res.imported} imported</div>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
                {res.duplicatesSkipped > 0 && <li>{res.duplicatesSkipped} duplicates skipped</li>}
                {res.aiCategorized > 0 && <li>{res.aiCategorized} categorized by AI</li>}
                {res.warnings.length > 0 && <li>{res.warnings.length} rows could not be read</li>}
              </ul>
              <p style={{ marginTop: 14 }}><Link href="/" className="more">See your forecast</Link></p>
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="t-title">What the file needs</h2>
          <div className="divider" style={{ marginTop: 18 }}>
            <div className="item"><span>A date column</span><span className="muted r small">2026-11-01, 01/11/2026 or 01-Nov-2026</span></div>
            <div className="item"><span>A description column</span><span className="muted r small">Description, Narration or Details</span></div>
            <div className="item"><span>Amounts</span><span className="muted r small">One signed Amount column, or Debit and Credit</span></div>
            <div className="item"><span>Opening balance</span><span className="muted r small">An optional row sets your starting balance</span></div>
          </div>
        </div>
      </div>
    </>
  );
}
