"use client";
import { useState } from "react";
import { api } from "@/lib/api";

export default function ImportPage() {
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await api("/transactions/import", { body: { csv: await file.text() } });
      setMsg(`Imported ${r.imported} transactions (${r.duplicatesSkipped} duplicates skipped, ${r.aiCategorized} categorized by AI).${r.warnings.length ? ` ${r.warnings.length} rows skipped.` : ""}`);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1>Import bank statement</h1>
      <p className="mute">CSV with a header row. Needed: a date column, a description column, and either <code>amount</code> (negative = money out) or <code>debit</code>/<code>credit</code>. Optional: <code>receiver_type</code> (merchant or person) to control which payments can be recalled.</p>
      <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} aria-label="Statement CSV" />
      {busy && <p className="mute">Importing and categorizing...</p>}
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
