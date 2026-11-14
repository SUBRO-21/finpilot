"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ColumnChart } from "@/components/Bits";
import { AllocationDonut, DivergingBars, HoldScatter, PnlColumns, ShareRing, StepLine, WeightBars } from "@/components/PortfolioCharts";
import { api, compact, dayYear, money, monthShort } from "@/lib/api";

type Tab = "current" | "trades";
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n));
const signedPct = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toFixed(1)}%`;
const pl = (n: number) => (n < 0 ? "loss" : "gain");

function Upload({ kind, onDone }: { kind: "holdings" | "trades"; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [replace, setReplace] = useState(false);
  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await api(`/portfolio/${kind}`, { body: { csv: await file.text(), replace } });
      setMsg(kind === "holdings"
        ? `${r.imported} holdings loaded${r.warnings.length ? `, ${r.warnings.length} rows skipped` : ""}.`
        : `${r.imported} trades added${r.duplicatesSkipped ? `, ${r.duplicatesSkipped} already there` : ""}${r.warnings.length ? `, ${r.warnings.length} rows skipped` : ""}.`);
      onDone();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  return (
    <div>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {kind === "trades" && (
        <label className="row small" style={{ gap: 8, marginBottom: 12, flexWrap: "nowrap", cursor: "pointer" }}>
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} style={{ width: 18, minHeight: 18 }} />
          <span>Replace earlier trades (otherwise new ones are added and repeats skipped)</span>
        </label>
      )}
      <button className="btn" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Reading…" : kind === "holdings" ? "Upload holdings CSV" : "Upload tradebook CSV"}
      </button>
      {msg && <p className="small" role="status" style={{ marginTop: 10 }}>{msg}</p>}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card kpi">
      <div><div className="tag">{label}</div><div className="v num" style={value.length > 12 ? { fontSize: 22, whiteSpace: "normal" } : undefined}>{value}</div></div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

function Panel({ title, sub, children, wide }: { title: string; sub?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`card ${wide ? "wide" : ""}`} aria-label={title}>
      <h2 className="t-title">{title}</h2>
      {sub && <p className="small muted" style={{ marginTop: 4 }}>{sub}</p>}
      <div style={{ marginTop: 18 }}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ holdings dashboard */

function Current({ h }: { h: any }) {
  const conc = h.concentration;
  const top = h.holdings.slice(0, 10);
  const rest = h.holdings.slice(10);
  const weightBars = [
    ...top.map((x: any) => ({ label: x.symbol, value: x.weight, tip: <><b>{x.symbol}</b><div>{pct1(x.weight)} of portfolio · {money(x.current)}</div><div className="muted">{x.sector}</div></> })),
    ...(rest.length ? [{ label: `${rest.length} others`, value: rest.reduce((a: number, x: any) => a + x.weight, 0) }] : []),
  ];
  const pnlBars = [...h.holdings].sort((a: any, b: any) => b.pnl - a.pnl).map((x: any) => ({
    label: x.symbol, value: x.pnl, note: `(${signedPct(x.pnlPct)})`,
    tip: <><b>{x.symbol}</b><div>{signed(x.pnl)} ({signedPct(x.pnlPct)})</div><div className="muted">Bought at {money(x.avgPrice)}, now {money(x.lastPrice)}</div></>,
  }));
  return (
    <>
      <div className="kpis">
        <Kpi label="Current value" value={money(h.current)} sub={`${h.count} holdings`} />
        <Kpi label="You put in" value={money(h.invested)} sub="Quantity × average buy price" />
        <Kpi label="Profit or loss" value={signed(h.pnl)} sub={`${signedPct(h.pnlPct)} overall, not yet sold`} />
        <Kpi label="Diversification" value={conc.label} sub={`Like ${Math.max(1, Math.round(conc.effectiveHoldings))} equal-sized stocks`} />
      </div>

      <div className="dash-grid section">
        <Panel title="Where your money is" sub="Share of today's value by sector. Hover a slice for details.">
          <AllocationDonut centerLabel="Total value" centerValue={compact(h.current)}
            items={h.sectors.map((s: any) => ({ label: s.sector, value: s.current, sub: `${s.count} stock${s.count === 1 ? "" : "s"}` }))} />
        </Panel>
        <Panel title="Biggest positions" sub="Share of your portfolio in each stock.">
          <WeightBars items={weightBars} />
        </Panel>

        <Panel wide title="Profit and loss by stock" sub="Not yet sold: today's value minus what you paid. Bars to the right are up, to the left are down.">
          <DivergingBars items={pnlBars} />
        </Panel>

        <Panel title="What stands out">
          <ul className="md-list">{[...h.insights, ...conc.reasons].map((s: string) => <li key={s}>{s}</li>)}</ul>
          <p className="small muted" style={{ marginTop: 12 }}>
            &ldquo;Like N equal-sized stocks&rdquo; means your mix spreads risk as much as N stocks of the same size would. Under 5 means a few stocks drive most of your result.
          </p>
        </Panel>
        <Panel title="Invested vs today" sub="What you put in against what it is worth now.">
          <WeightBars format={(n) => compact(n)} max={Math.max(h.invested, h.current)} items={[
            { label: "You put in", value: h.invested, tip: <><b>You put in</b><div>{money(h.invested)}</div></> },
            { label: "Worth today", value: h.current, tip: <><b>Worth today</b><div>{money(h.current)}</div><div className="muted">{signed(h.pnl)} ({signedPct(h.pnlPct)})</div></> },
          ]} />
          <div className="divider" style={{ marginTop: 18 }}>
            {h.winners[0] && <div className="item"><span className="muted">Best performer</span><span className="num">{h.winners[0].symbol} {signedPct(h.winners[0].pnlPct)}</span></div>}
            {h.losers[0] && <div className="item"><span className="muted">Weakest</span><span className="num">{h.losers[0].symbol} {signedPct(h.losers[0].pnlPct)}</span></div>}
            {conc.top && <div className="item"><span className="muted">Largest holding</span><span className="num">{conc.top.symbol} {pct1(conc.top.weight)}</span></div>}
            <div className="item"><span className="muted">Top 5 holdings</span><span className="num">{pct1(conc.top5Weight)} of value</span></div>
          </div>
        </Panel>

        <Panel wide title="All holdings">
          <div className="table-wrap">
            <table className="ptable">
              <thead><tr><th>Stock</th><th>Sector</th><th className="r">Qty</th><th className="r">Avg buy</th><th className="r">Price now</th><th className="r">Value</th><th className="r">Profit / loss</th><th className="r">Share of total</th></tr></thead>
              <tbody>
                {h.holdings.map((x: any) => (
                  <tr key={x.symbol}>
                    <td style={{ fontWeight: 600 }}>{x.symbol}</td><td className="muted">{x.sector}</td>
                    <td className="r num">{x.quantity.toLocaleString("en-IN")}</td><td className="r num">{money(x.avgPrice)}</td><td className="r num">{money(x.lastPrice)}</td>
                    <td className="r num">{money(x.current)}</td>
                    <td className={`r num ${pl(x.pnl)}`}>{signed(x.pnl)} ({signedPct(x.pnlPct)})</td>
                    <td className="r num">{pct1(x.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>Prices are from your file, as of {dayYear(h.updatedAt.slice(0, 10))}. Upload a fresh export to update them.</p>
        </Panel>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ trade history dashboard */

function Lot({ title, l }: { title: string; l: any }) {
  return (
    <div className="card fog">
      <div className="tag">{title}</div>
      <div className="t-title" style={{ marginTop: 6 }}>{l.symbol}</div>
      <p className={`num ${pl(l.pnl)}`} style={{ marginTop: 4, fontSize: 20 }}>{signed(l.pnl)} ({signedPct(l.pnlPct)})</p>
      <p className="small muted" style={{ marginTop: 6 }}>{l.quantity} shares bought {dayYear(l.buyDate)} at {money(l.buyPrice)}, sold {dayYear(l.sellDate)} at {money(l.sellPrice)}. Held {l.holdDays} day{l.holdDays === 1 ? "" : "s"}.</p>
    </div>
  );
}

function Trades({ t }: { t: any }) {
  const c = t.closed;
  // Running total of booked profit, one step per sale day
  const byDay = new Map<string, { pnl: number; n: number }>();
  for (const l of t.lots) { const d = byDay.get(l.sellDate) ?? { pnl: 0, n: 0 }; d.pnl += l.pnl; d.n++; byDay.set(l.sellDate, d); }
  let run = 0;
  const cumulative = [{ date: t.firstDate, value: 0 }, ...[...byDay.entries()].map(([date, d]) => ({ date, value: (run += d.pnl), note: `${d.n} sale${d.n === 1 ? "" : "s"} that day: ${signed(d.pnl)}` }))];
  const months = t.monthly.slice(-18);
  const bySym = [...t.bySymbol].filter((s: any) => s.closedLots > 0).sort((a: any, b: any) => Math.abs(b.realized) - Math.abs(a.realized)).slice(0, 10).sort((a: any, b: any) => b.realized - a.realized);

  return (
    <>
      <div className="kpis">
        <Kpi label="Profit booked" value={signed(t.realized.total)} sub="From shares you sold (earliest bought, sold first)" />
        <Kpi label="Win rate" value={c.winRate == null ? "—" : pct1(c.winRate)} sub={`${c.wins} of ${c.count} sales made money`} />
        <Kpi label="Trades" value={t.tradeCount.toLocaleString("en-IN")} sub={`${t.buyCount} buys, ${t.sellCount} sells in ${t.symbolCount} stocks`} />
        <Kpi label="Trades a month" value={String(Math.round(t.tradesPerMonth))} sub={`${dayYear(t.firstDate)} to ${dayYear(t.lastDate)}`} />
      </div>

      <div className="dash-grid section">
        <Panel wide title="Profit booked over time" sub="Running total of profit from everything you have sold. Hover to see each sale day.">
          <StepLine label="Profit booked over time" points={cumulative} />
        </Panel>

        <Panel title="Profit or loss by month" sub="Booked profit from sales in each month.">
          <PnlColumns items={months.map((m: any) => ({
            key: m.month, label: monthShort(m.month), value: m.realized,
            tip: <><b>{new Date(m.month + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</b><div>Booked: {signed(m.realized)}</div><div className="muted">{m.trades} trades · bought {compact(m.buys)} · sold {compact(m.sells)}</div></>,
          }))} />
        </Panel>
        <Panel title="How often you win">
          <div className="row" style={{ gap: 24, flexWrap: "nowrap", alignItems: "center" }}>
            {c.winRate != null && <ShareRing value={c.winRate} label="won" />}
            <div className="divider" style={{ flex: 1 }}>
              <div className="item"><span className="muted">Average win</span><span className="num">{c.avgWinPct == null ? "—" : signedPct(c.avgWinPct)}</span></div>
              <div className="item"><span className="muted">Average loss</span><span className="num">{c.avgLossPct == null ? "—" : signedPct(c.avgLossPct)}</span></div>
              <div className="item"><span className="muted">Held, winners</span><span className="num">{c.avgHoldDaysWin == null ? "—" : `${Math.round(c.avgHoldDaysWin)} days`}</span></div>
              <div className="item"><span className="muted">Held, losers</span><span className="num">{c.avgHoldDaysLoss == null ? "—" : `${Math.round(c.avgHoldDaysLoss)} days`}</span></div>
            </div>
          </div>
          <h3 className="small" style={{ marginTop: 20, fontWeight: 600 }}>Profit by how long you held</h3>
          <div style={{ marginTop: 10 }}>
            <DivergingBars items={[
              { label: "Same day", value: t.realized.intraday, tip: <><b>Same day (intraday)</b><div>{signed(t.realized.intraday)}</div><div className="muted">Bought and sold on one day</div></> },
              { label: "Under a year", value: t.realized.shortTerm, tip: <><b>Short term</b><div>{signed(t.realized.shortTerm)}</div><div className="muted">Held up to a year</div></> },
              { label: "Over a year", value: t.realized.longTerm, tip: <><b>Long term</b><div>{signed(t.realized.longTerm)}</div><div className="muted">Held more than a year, usually taxed lower</div></> },
            ]} />
          </div>
        </Panel>

        {t.lots.length > 0 && (
          <Panel wide title="Return vs how long you held" sub="Each dot is one sale. Dots far right and below the line are losses you held on to for a long time.">
            <HoldScatter dots={t.lots.map((l: any) => ({
              x: l.holdDays, y: l.pnlPct, label: l.symbol,
              tip: <><b>{l.symbol}</b><div>{signedPct(l.pnlPct)} ({signed(l.pnl)})</div><div className="muted">Held {l.holdDays} days · sold {dayYear(l.sellDate)}</div></>,
            }))} />
          </Panel>
        )}

        {bySym.length > 0 && (
          <Panel title="Profit booked by stock" sub="The 10 stocks with the biggest booked profit or loss.">
            <DivergingBars items={bySym.map((s: any) => ({ label: s.symbol, value: s.realized, tip: <><b>{s.symbol}</b><div>{signed(s.realized)} booked</div><div className="muted">{s.trades} trades, {s.closedLots} sales matched</div></> }))} />
          </Panel>
        )}
        <Panel title="What your trading says">
          <ul className="md-list">{t.behaviour.map((s: string) => <li key={s}>{s}</li>)}</ul>
        </Panel>

        {months.length > 1 && (
          <Panel title="Trades per month" sub="How active you were over the last 12 months.">
            <ColumnChart items={months.slice(-12).map((m: any) => ({ label: monthShort(m.month), value: m.trades }))} height={120} format={(n) => String(n)} />
          </Panel>
        )}
        {(c.best || c.worst) && (
          <div style={{ display: "grid", gap: 24 }}>
            {c.best && <Lot title="Best trade" l={c.best} />}
            {c.worst && <Lot title="Worst trade" l={c.worst} />}
          </div>
        )}

        <Panel wide title="By stock">
          <div className="table-wrap">
            <table className="ptable">
              <thead><tr><th>Stock</th><th className="r">Trades</th><th className="r">Sales matched</th><th className="r">Still holding (from file)</th><th className="r">Profit booked</th></tr></thead>
              <tbody>
                {t.bySymbol.map((s: any) => (
                  <tr key={s.symbol}>
                    <td style={{ fontWeight: 600 }}>{s.symbol}</td><td className="r num">{s.trades}</td><td className="r num">{s.closedLots}</td>
                    <td className="r num">{s.openQty ? s.openQty.toLocaleString("en-IN") : "—"}</td>
                    <td className={`r num ${s.closedLots ? pl(s.realized) : ""}`}>{s.closedLots ? signed(s.realized) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ page */

export default function Portfolio() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("current");
  const load = useCallback(() => api("/portfolio").then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function clear(part: "holdings" | "trades") {
    try { await api(`/portfolio/${part}`, { method: "DELETE" }); await load(); } catch (e) { setErr((e as Error).message); }
  }

  if (err && !d) return <div className="card"><p className="err" style={{ margin: 0 }}>{err}</p></div>;
  if (!d) return <div className="skeleton" style={{ height: 420, marginTop: 40 }} />;

  const has = tab === "current" ? d.holdings : d.trades;
  return (
    <>
      <section className="hero" style={{ paddingBottom: 32 }}>
        <div className="tag">Investments, separate from your bank statement</div>
        <h1 className="h-lg">Your <em>portfolio</em>.</h1>
        <p className="lead">See what you own today and how your past trades worked out. Upload the CSV exports from your broker (Zerodha, Groww, Upstox and others).</p>
      </section>

      <div className="between" style={{ marginBottom: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div className="seg" role="tablist" aria-label="Portfolio view">
          <button role="tab" aria-selected={tab === "current"} aria-pressed={tab === "current"} onClick={() => setTab("current")}>Holdings</button>
          <button role="tab" aria-selected={tab === "trades"} aria-pressed={tab === "trades"} onClick={() => setTab("trades")}>Trade history</button>
        </div>
        {has && <button className="linkbtn small muted" onClick={() => clear(tab === "current" ? "holdings" : "trades")}>{tab === "current" ? "Remove holdings" : "Remove all trades"}</button>}
      </div>

      {!has ? (
        <div className="grid2" style={{ alignItems: "start" }}>
          <div className="float" style={{ padding: 32 }}>
            <h2 className="t-title">{tab === "current" ? "Upload your holdings" : "Upload your tradebook"}</h2>
            <p className="small muted" style={{ marginTop: 4, marginBottom: 20 }}>
              {tab === "current"
                ? "The list of stocks you own now, with quantity, average price and current price."
                : "Every buy and sell you made. Upload more files later; trades already added are skipped."}
            </p>
            <Upload kind={tab === "current" ? "holdings" : "trades"} onDone={load} />
          </div>
          <div className="card">
            <h2 className="t-title">Where to get it</h2>
            <div className="divider" style={{ marginTop: 16 }}>
              {tab === "current" ? (
                <>
                  <div className="item"><span>Zerodha</span><span className="muted r small">Kite → Holdings → Download, or Console → Portfolio → Holdings</span></div>
                  <div className="item"><span>Groww</span><span className="muted r small">Stocks → Holdings → Download report</span></div>
                  <div className="item"><span>Columns needed</span><span className="muted r small">Stock or symbol, quantity, average price, current price (LTP)</span></div>
                </>
              ) : (
                <>
                  <div className="item"><span>Zerodha</span><span className="muted r small">Console → Reports → Tradebook → Download CSV</span></div>
                  <div className="item"><span>Groww</span><span className="muted r small">Reports → Stocks → Order history</span></div>
                  <div className="item"><span>Columns needed</span><span className="muted r small">Symbol, trade date, buy/sell, quantity, price</span></div>
                </>
              )}
            </div>
            <p className="small muted" style={{ marginTop: 16 }}>Trying it out? Use <strong>{tab === "current" ? "sample_holdings.csv" : "sample_tradebook.csv"}</strong> from the project folder.</p>
          </div>
        </div>
      ) : (
        <>
          {tab === "current" ? <Current h={d.holdings} /> : <Trades t={d.trades} />}
          <section className="section">
            <div className="card fog">
              <h2 className="t-title">{tab === "current" ? "Update holdings" : "Add more trades"}</h2>
              <p className="small muted" style={{ marginTop: 4, marginBottom: 16 }}>{tab === "current" ? "A new holdings file replaces the current one." : "Repeats are skipped automatically."}</p>
              <Upload kind={tab === "current" ? "holdings" : "trades"} onDone={load} />
            </div>
          </section>
        </>
      )}
      {err && <p className="err" role="alert">{err}</p>}
    </>
  );
}
