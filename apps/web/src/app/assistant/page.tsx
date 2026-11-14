"use client";
import { useEffect, useRef, useState } from "react";
import { ForecastChart } from "@/components/ForecastChart";
import { Md } from "@/components/Md";
import { api, money, pct } from "@/lib/api";

type Sim = any;
type Msg = { role: "user" | "assistant"; content: string; sims?: Sim[]; used?: string[]; followups?: string[]; error?: boolean };

const STARTERS = [
  "Can I afford a ₹60,000 laptop this week?",
  "Should I take a ₹5,00,000 loan at 11% for 3 years?",
  "Will I run short of cash soon?",
  "Where can I cut spending the most?",
];
const VERDICT: Record<string, string> = { SAFE: "Affordable", RISKY: "Tight", UNAFFORDABLE: "Likely to overdraw" };
/** One plain sentence per verdict, for people who don't read forecasts. */
const VERDICT_MEANING: Record<string, string> = {
  SAFE: "You can do this. Your balance should stay comfortably above zero.",
  RISKY: "You can do this, but there is little room left for surprises.",
  UNAFFORDABLE: "There is a real chance your balance goes below zero. Wait, or spend less.",
};

function Stat({ label, value, meaning }: { label: string; value: string; meaning: string }) {
  return (
    <div>
      <div className="small" style={{ opacity: 0.75 }}>{label}</div>
      <div style={{ fontWeight: 500, fontSize: 18 }}>{value}</div>
      <div className="small" style={{ opacity: 0.75, marginTop: 4, lineHeight: 1.35 }}>{meaning}</div>
    </div>
  );
}

/** Splits the trailing "FOLLOWUPS: a | b | c" line the model is asked to add. */
function parseReply(raw: string) {
  const m = raw.match(/\n?\s*FOLLOWUPS:\s*(.+)\s*$/i);
  const followups = m ? m[1].split("|").map((s) => s.trim().replace(/^[-*\d.\s]+/, "")).filter((s) => s.length > 2).slice(0, 3) : [];
  return { text: (m ? raw.slice(0, m.index) : raw).trim(), followups };
}

function SimCard({ s }: { s: Sim }) {
  const warn = s.verdict !== "SAFE";
  return (
    <div style={{ marginTop: 18 }}>
      <div className={`verdict ${warn ? "warn" : ""}`}>
        <div className="small" style={{ opacity: 0.8 }}>{s.label}: we tested it against your expected balance for the next 90 days</div>
        <div className="serif" style={{ marginTop: 4 }}>{VERDICT[s.verdict]}</div>
        <div style={{ marginTop: 4 }}>{VERDICT_MEANING[s.verdict]}</div>
        <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginTop: 14 }}>
          <Stat label="Chance below zero" value={`${pct(s.riskBefore)} to ${pct(s.riskAfter)}`}
            meaning="How likely your balance drops under ₹0 in the next 90 days: now, then after this." />
          <Stat label="Bad-case balance" value={`${money(s.worstBefore)} to ${money(s.worstAfter)}`}
            meaning="The lowest your balance could fall if the coming months go badly (a 1-in-10 chance)." />
          {s.emi && <Stat label="Monthly EMI" value={money(s.emi)} meaning="What you would repay to the lender every month, interest included." />}
        </div>
      </div>
      <div className="float" style={{ marginTop: 14, padding: "20px 20px 14px" }}>
        <ForecastChart points={s.points} start={s.start} baseline={s.baseline} />
        <p className="small muted" style={{ marginTop: 8 }}>The solid line is your expected balance each day with this decision, the dashed line without it. The shaded band is the likely range: real life usually lands inside it.</p>
      </div>
    </div>
  );
}

function Reply({ m, last, onAsk, busy }: { m: Msg; last: boolean; onAsk: (q: string) => void; busy: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(m.content); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  }
  return (
    <div className="msg bot">
      <div className="avatar" aria-hidden="true">F</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        {m.used && m.used.length > 0 && <div className="checked">{m.used.map((u) => <span key={u}>{u}</span>)}</div>}
        <div className="bubble" style={m.error ? { color: "var(--ink)", fontWeight: 600 } : undefined}><Md text={m.content} /></div>
        {m.sims?.map((s, j) => <SimCard key={j} s={s} />)}
        {!m.error && <div className="msg-actions"><button className="linkbtn small muted" onClick={copy}>{copied ? "Copied" : "Copy answer"}</button></div>}
        {last && !busy && m.followups && m.followups.length > 0 && (
          <div className="row" style={{ marginTop: 14 }}>{m.followups.map((f) => <button key={f} className="btn ghost sm" onClick={() => onAsk(f)}>{f}</button>)}</div>
        )}
      </div>
    </div>
  );
}

export default function Assistant() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  async function send(text: string, history: Msg[]) {
    const t = text.trim();
    if (t.length < 2 || busy) return;
    const next: Msg[] = [...history, { role: "user", content: t }];
    setMsgs(next); setQ(""); setBusy(true);
    try {
      const r = await api("/assistant/chat", { body: { messages: next.slice(-12).map(({ role, content }) => ({ role, content })) } });
      const { text: body, followups } = parseReply(r.reply);
      setMsgs([...next, { role: "assistant", content: body, sims: r.simulations, used: r.used, followups }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: (e as Error).message, error: true }]);
    }
    setBusy(false);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) send(initial, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastBot = msgs.map((m) => m.role).lastIndexOf("assistant");

  return (
    <div className="chat">
      <section className="hero" style={{ paddingBottom: msgs.length ? 0 : 24 }}>
        <div className="tag">Answers come from your own numbers</div>
        <h1 className="h-lg" style={{ marginTop: 12 }}>Ask before you <em>decide</em>.</h1>
        {!msgs.length && <p className="lead">Tell the assistant what you are thinking of buying or borrowing. It checks your balance, bills and forecast, runs the numbers, and gives you a straight answer.</p>}
      </section>

      {!msgs.length && (
        <div className="row" style={{ marginBottom: 8 }}>
          {STARTERS.map((s) => <button key={s} className="btn ghost sm" disabled={busy} onClick={() => send(s, [])}>{s}</button>)}
        </div>
      )}

      <div aria-live="polite">
        {msgs.map((m, i) =>
          m.role === "user"
            ? <div key={i} className="msg user"><div className="bubble">{m.content}</div></div>
            : <Reply key={i} m={m} last={i === lastBot} onAsk={(f) => send(f, msgs)} busy={busy} />,
        )}
        {busy && (
          <div className="msg bot"><div className="avatar" aria-hidden="true">F</div>
            <div className="bubble muted"><span className="dots" aria-hidden="true"><span /><span /><span /></span>Checking your numbers</div></div>
        )}
      </div>
      <div ref={end} />

      <div className="chat-composer float" style={{ padding: 12 }}>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(q, msgs); }}>
          <input aria-label="Message the assistant" placeholder="Ask about a purchase, a loan, or your spending" value={q} maxLength={1000} onChange={(e) => setQ(e.target.value)} />
          <button className="send" aria-label="Send message" disabled={busy || q.trim().length < 2}>→</button>
        </form>
        <div className="between" style={{ marginTop: 10, padding: "0 6px" }}>
          <span className="small tag">Estimates from your data, not professional financial advice.</span>
          {msgs.length > 0 && <button className="linkbtn small" onClick={() => setMsgs([])}>New chat</button>}
        </div>
      </div>
    </div>
  );
}
