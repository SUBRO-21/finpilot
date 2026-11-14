"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { payTypesFor } from "@finos/engine";
import { DATA_EVENT } from "@/components/Shell";
import { api, day, dayYear, money } from "@/lib/api";

type Kind = "income" | "loan" | "subscription" | "bill";
type Q = {
  key: string; name: string; amount: number; kind: Kind;
  cadenceDays: number; cadenceLabel: string; lastDate: string; nextDate: string; occurrences: number; category: string; source: "detected" | "candidate";
  payType: string | null; toPerson: boolean;
};
type Opt = { label: string; decision: "CONTINUE" | "CHANGE" | "ENDS" | "STOP" | "ONEOFF"; ask?: "amount" | "remaining"; cadenceDays?: number };

/** The follow-up options depend on what the user says the payment is for (a loan ends, a subscription gets cancelled). */
function kindFor(q: Q, payType: string | null): Kind {
  if (q.amount > 0) return "income";
  const cat = payTypesFor(q.amount).find((t) => t.label === payType)?.category;
  if (cat === "Loan/EMI") return "loan";
  if (cat === "Subscriptions") return "subscription";
  return cat ? "bill" : q.kind;
}

function title(q: Q) {
  if (q.source === "candidate") {
    if (q.kind === "income") return q.toPerson ? `Do you receive money from ${q.name} regularly?` : `Is ${q.name} regular income?`;
    return q.toPerson ? `Do you pay ${q.name} regularly?` : `Does ${q.name} repeat?`;
  }
  if (q.kind === "income") return `Will you keep receiving ${q.name}?`;
  if (q.kind === "loan") return `Is ${q.name} still running?`;
  return `Will you keep paying ${q.name}?`;
}

function options(q: Q, kind: Kind): Opt[] {
  if (q.source === "candidate")
    return kind === "income"
      ? [{ label: "Yes, every month", decision: "CONTINUE", cadenceDays: 30 }, { label: "No, it was one-off", decision: "ONEOFF" }]
      : [
          { label: "Every month", decision: "CONTINUE", cadenceDays: 30 },
          { label: "Every 3 months", decision: "CONTINUE", cadenceDays: 91 },
          { label: "Once a year", decision: "CONTINUE", cadenceDays: 365 },
          { label: "No, it was one-off", decision: "ONEOFF" },
        ];
  if (kind === "income")
    return [{ label: "Yes, same amount", decision: "CONTINUE" }, { label: "The amount will change", decision: "CHANGE", ask: "amount" }, { label: "No, it is ending", decision: "STOP" }];
  if (kind === "loan")
    return [{ label: "Yes, it keeps going", decision: "CONTINUE" }, { label: "It ends after a few more payments", decision: "ENDS", ask: "remaining" }, { label: "No, it is paid off", decision: "STOP" }];
  return [
    { label: "Yes, as it is", decision: "CONTINUE" },
    { label: "The amount will change", decision: "CHANGE", ask: "amount" },
    { label: "It ends after a few more payments", decision: "ENDS", ask: "remaining" },
    { label: "No, I am stopping it", decision: "STOP" },
  ];
}

const DECISION_TEXT: Record<string, string> = { CONTINUE: "Continuing", CHANGE: "Amount changing", ENDS: "Ending", STOP: "Stopped", ONEOFF: "One-off" };

export default function Review() {
  const router = useRouter();
  const [qs, setQs] = useState<Q[] | null>(null);
  const [answered, setAnswered] = useState<any[]>([]);
  const [planned, setPlanned] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ asOfDate: string | null; ageDays: number | null }>({ asOfDate: null, ageDays: null });
  const [idx, setIdx] = useState(0);
  const [ask, setAsk] = useState<Opt | null>(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fromImport, setFromImport] = useState(false);
  const [saved, setSaved] = useState(0);
  const [ptype, setPtype] = useState<string | null>(null);

  const [pf, setPf] = useState({ label: "", amount: "", direction: "out" as "out" | "in", date: "" });
  const top = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api("/plan/review");
      setQs(r.questions); setAnswered(r.answered); setPlanned(r.planned); setMeta({ asOfDate: r.asOfDate, ageDays: r.ageDays });
      setIdx(0); setAsk(null); setVal("");
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { setFromImport(new URLSearchParams(window.location.search).get("from") === "import"); load(); }, [load]);
  useEffect(() => { top.current?.scrollIntoView({ block: "start" }); }, [idx]);
  // Each question starts from our guess of the payment type; null means the user has to pick one
  useEffect(() => { setPtype(qs?.[idx]?.payType ?? null); }, [qs, idx]);

  if (err && !qs) return <div className="card"><p className="err" style={{ margin: 0 }}>{err}</p></div>;
  if (!qs) return <div className="skeleton" style={{ height: 380, marginTop: 24 }} />;
  if (!meta.asOfDate)
    return (
      <section className="hero">
        <h1 className="h-lg">Review your <em>repeats</em>.</h1>
        <p className="lead">Import a statement first, then answer a few questions that make your forecast more accurate.</p>
        <div className="row"><Link href="/import" className="btn">Import a statement</Link></div>
      </section>
    );

  const total = qs.length;
  const onPlanned = idx === total;
  const onDone = idx > total;
  const q = !onPlanned && !onDone ? qs[idx] : null;

  async function save(o: Opt) {
    if (!q) return;
    setBusy(true); setErr("");
    try {
      await api("/plan/recurring", {
        body: {
          key: q.key, decision: o.decision, cadenceDays: o.cadenceDays, ...(ptype ? { payType: ptype } : {}),
          ...(o.decision === "CHANGE" ? { newAmount: Number(val) } : {}),
          ...(o.decision === "ENDS" ? { remaining: Math.round(Number(val)) } : {}),
        },
      });
      setSaved((n) => n + 1); setAsk(null); setVal(""); setIdx(idx + 1);
      window.dispatchEvent(new Event(DATA_EVENT));
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  function pick(o: Opt) { setErr(""); if (o.ask) { setAsk(o); setVal(""); } else save(o); }

  async function addPlanned(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      await api("/plan/planned", { body: { label: pf.label, amount: Number(pf.amount), direction: pf.direction, date: pf.date } });
      const r = await api("/plan/review"); setPlanned(r.planned);
      setPf({ label: "", amount: "", direction: pf.direction, date: "" });
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function removePlanned(id: string) {
    await api(`/plan/planned/${id}`, { method: "DELETE" });
    setPlanned((p) => p.filter((x) => x.id !== id));
  }
  async function changeAnswer(key: string) {
    await api("/plan/recurring/reset", { body: { key } });
    window.dispatchEvent(new Event(DATA_EVENT));
    load();
  }

  const minDate = meta.asOfDate ? new Date(Date.parse(meta.asOfDate) + 86400000).toISOString().slice(0, 10) : undefined;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }} ref={top}>
      <section className="hero" style={{ paddingBottom: 24 }}>
        <div className="tag">{fromImport ? "Statement imported" : "Quick review"}, data through {dayYear(meta.asOfDate)}</div>
        <h1 className="h-lg">A few quick <em>questions</em>.</h1>
        <p className="lead">Your answers tell the forecast what is changing, such as a subscription you will cancel or a loan that ends. Takes about a minute.</p>
      </section>

      {!onDone && (
        <div className="progress" style={{ marginBottom: 20 }} aria-hidden="true">
          {Array.from({ length: total + 1 }, (_, n) => <i key={n} className={n <= idx ? "on" : ""} />)}
        </div>
      )}

      {q && (
        <div className="float" style={{ padding: 32 }} role="group" aria-labelledby="qt">
          <div className="between"><span className="tag">Question {idx + 1} of {total}</span><button className="linkbtn small muted" onClick={() => { setAsk(null); setIdx(idx + 1); }}>Skip for now</button></div>
          <h2 className="h-sm" id="qt" style={{ marginTop: 16 }}>{title(q)}</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            {money(q.amount)} {q.source === "candidate" ? `paid on ${day(q.lastDate)}. We have only seen it once so far.` : `${q.cadenceLabel}, seen ${q.occurrences} times, next around ${day(q.nextDate)}.`}
          </p>

          {!ask && (
            <fieldset className="ptype">
              <legend>
                {q.amount < 0 ? "What is this payment for?" : "What is this money?"}
                {!q.payType && <span className="small muted"> {q.toPerson ? "It went " + (q.amount < 0 ? "to" : "from") + " a personal account, so we can't tell on our own." : "We couldn't tell from the bank text."}</span>}
              </legend>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                {/* our guess may be a plain category (Transport, Health) that is not one of the listed types */}
                {[...(q.payType && !payTypesFor(q.amount).some((t) => t.label === q.payType) ? [q.payType] : []), ...payTypesFor(q.amount).map((t) => t.label)].map((label) => (
                  <button key={label} type="button" className="pchip" aria-pressed={ptype === label} disabled={busy} onClick={() => setPtype(label)}>{label}</button>
                ))}
              </div>
            </fieldset>
          )}

          {!ask ? (
            <>
              {!ptype && <p className="small muted" style={{ marginTop: 20 }}>Pick a type above, then answer:</p>}
              <div className="row" style={{ marginTop: ptype ? 24 : 10 }}>
                {options(q, kindFor(q, ptype)).map((o) => <button key={o.label} className="btn ghost" disabled={busy || !ptype} onClick={() => pick(o)}>{o.label}</button>)}
              </div>
            </>
          ) : (
            <form style={{ marginTop: 20 }} onSubmit={(e) => { e.preventDefault(); save(ask); }}>
              <label className="f" htmlFor="ans" style={{ marginTop: 0 }}>{ask.ask === "amount" ? "New amount (₹)" : "How many payments are left, counting the next one?"}</label>
              <input id="ans" type="number" min="1" step={ask.ask === "amount" ? "any" : "1"} autoFocus required value={val} onChange={(e) => setVal(e.target.value)} />
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn" disabled={busy || !val}>{busy ? "Saving…" : "Save answer"}</button>
                <button type="button" className="btn ghost" onClick={() => setAsk(null)}>Back</button>
              </div>
            </form>
          )}
          {err && <p className="err" role="alert">{err}</p>}
          {idx > 0 && <p style={{ marginTop: 20 }}><button className="linkbtn small muted" onClick={() => { setAsk(null); setIdx(idx - 1); }}>&larr; Previous question</button></p>}
        </div>
      )}

      {onPlanned && (
        <div className="float" style={{ padding: 32 }} role="group" aria-labelledby="pt">
          <span className="tag">{total ? "Last question" : "One question"}</span>
          <h2 className="h-sm" id="pt" style={{ marginTop: 16 }}>Is anything big coming up?</h2>
          <p className="muted" style={{ marginTop: 8 }}>A purchase, a fee, a bonus or a refund you are expecting. The forecast will plan for it.</p>

          {planned.length > 0 && (
            <div className="divider" style={{ marginTop: 20 }}>
              {planned.map((p) => (
                <div className="item" key={p.id} style={{ padding: "12px 0", alignItems: "center" }}>
                  <div><div>{p.label}</div><div className="small tag">{dayYear(p.date)}</div></div>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <span className="num">{p.amount > 0 ? "+" : ""}{money(p.amount)}</span>
                    <button className="linkbtn small muted" aria-label={`Remove ${p.label}`} onClick={() => removePlanned(p.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={addPlanned} style={{ marginTop: 20 }}>
            <div className="seg" role="group" aria-label="Money direction">
              <button type="button" aria-pressed={pf.direction === "out"} onClick={() => setPf({ ...pf, direction: "out" })}>Money out</button>
              <button type="button" aria-pressed={pf.direction === "in"} onClick={() => setPf({ ...pf, direction: "in" })}>Money in</button>
            </div>
            <label className="f" htmlFor="pl">What is it?</label><input id="pl" maxLength={80} placeholder={pf.direction === "out" ? "New laptop, insurance premium" : "Bonus, tax refund"} value={pf.label} onChange={(e) => setPf({ ...pf, label: e.target.value })} required />
            <div className="grid2" style={{ gap: 16 }}>
              <div><label className="f" htmlFor="pa">Amount (₹)</label><input id="pa" type="number" min="1" step="any" value={pf.amount} onChange={(e) => setPf({ ...pf, amount: e.target.value })} required /></div>
              <div><label className="f" htmlFor="pd">Expected on</label><input id="pd" type="date" min={minDate} value={pf.date} onChange={(e) => setPf({ ...pf, date: e.target.value })} required /></div>
            </div>
            <div className="row" style={{ marginTop: 16 }}><button className="btn ghost" disabled={busy}>Add to forecast</button></div>
          </form>
          {err && <p className="err" role="alert">{err}</p>}

          <div className="row" style={{ marginTop: 28, justifyContent: "space-between" }}>
            {total > 0 ? <button className="linkbtn small muted" onClick={() => setIdx(idx - 1)}>&larr; Previous question</button> : <span />}
            <button className="btn" onClick={() => { setIdx(total + 1); window.dispatchEvent(new Event(DATA_EVENT)); }}>{planned.length ? "Finish" : "Nothing coming up"}</button>
          </div>
        </div>
      )}

      {onDone && (
        <div className="card pop" style={{ padding: 32 }} role="status">
          <h2 className="h-sm">Your forecast is updated.</h2>
          <p style={{ marginTop: 10 }}>
            {saved > 0 ? `${saved} answer${saved === 1 ? "" : "s"} saved` : "No new answers this time"}
            {planned.length ? `, ${planned.length} planned item${planned.length === 1 ? "" : "s"} included` : ""}. Upload next month&rsquo;s statement and we will only ask about what is new.
          </p>
          <div className="row" style={{ marginTop: 24 }}>
            <button className="btn" onClick={() => router.push("/")}>See your forecast</button>
            <Link href="/assistant" className="btn ghost" style={{ background: "var(--paper)" }}>Ask the assistant</Link>
          </div>
        </div>
      )}

      {answered.length > 0 && (
        <section className="section" aria-labelledby="prev">
          <h2 className="t-title" id="prev">Your earlier answers</h2>
          <div className="card divider" style={{ marginTop: 16 }}>
            {answered.map((a) => (
              <div className="item" key={a.key} style={{ alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div>{a.name}</div>
                  <div className="small tag">
                    {a.payType ? `${a.payType}, ` : ""}{DECISION_TEXT[a.decision]}
                    {a.decision === "CHANGE" && a.newAmount ? `, now ${money(a.newAmount)}` : ""}
                    {a.decision === "ENDS" && a.endDate ? `, last payment ${day(a.endDate)}` : ""}
                  </div>
                </div>
                <button className="btn ghost sm" onClick={() => changeAnswer(a.key)}>Change</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
