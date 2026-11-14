"use client";
import Link from "next/link";
import { TOUR_EVENT } from "@/components/Tour";

const FIRST = [
  ["Import a statement", "Download a CSV from your bank and upload it on the Import page. Transactions are categorized for you.", "/import", "Open Import"],
  ["Read your Overview", "See your balance, how much is safe to spend, and where your cash is heading over the next 30 to 90 days.", "/", "Open Overview"],
  ["Ask the assistant", "Before a big purchase or a loan, ask. It runs your real numbers and answers with a verdict.", "/assistant", "Open Assistant"],
] as const;

const PAGES = [
  ["Overview", "/", "Your dashboard: balance, safe to spend, forecast chart, health score, budgets, bills due and unusual spending."],
  ["Assistant", "/assistant", "Chat about purchases, loans and spending. Answers use your own data and include a chart when a decision is simulated."],
  ["Spending", "/spending", "Every rupee by category and by shop or app. Select a tile for its history and trends."],
  ["Insights", "/insights", "This month against last, income against spending, weekday habits, top merchants and biggest payments."],
  ["Bills", "/bills", "Repeating payments and income found automatically, with the next date and the yearly cost."],
  ["Transactions", "/transactions", "Search everything and fix a category in one click. Fixes feed your budgets and forecast."],
] as const;

const WORDS: [string, string][] = [
  ["Safe to spend", "The amount you could spend today and still stay above zero in 9 out of 10 simulated futures. It is a cautious figure, not your whole balance."],
  ["Chance below zero", "Out of many simulated versions of the coming weeks, the share where your balance dips under zero at some point."],
  ["Forecast and likely range", "The line is the middle outcome. The shaded band covers the 10th to 90th percentile, so most futures land inside it."],
  ["Forecast confidence", "How much to trust the forecast. It is lower when you have little history, irregular income or no repeating bills to anchor on."],
  ["Financial health", "A 0 to 100 score from four measures: how many days your cash lasts, how much of your income you keep, how much goes to fixed bills, and shortfall risk."],
  ["Recurring bill", "A payment that repeated at least three times on a steady rhythm, such as rent, an EMI or a subscription."],
  ["Budget limit", "A suggested monthly cap per category, based on your last 90 days. It tightens when shortfall risk rises."],
  ["Month pace", "Your spending so far this month, added up day by day, compared with the same point last month."],
  ["Forecast accuracy", "A check of how well past forecasts matched what actually happened. About 80% of days inside the range is ideal."],
];

const FAQ: [string, string][] = [
  ["Which CSV formats work?", "Any bank statement with a date column, a description column and either one signed Amount column or separate Debit and Credit columns. Dates can be 2026-11-01, 01/11/2026 or 01-Nov-2026. An Opening Balance row sets your starting balance."],
  ["Why is my forecast marked low confidence?", "Usually because there is less than about 45 days of history, or no repeating bills were found yet. Importing more months fixes both."],
  ["A transaction landed in the wrong category.", "Open Transactions and change it from the category menu. It is applied right away and used by budgets and forecasts."],
  ["What gets sent to the AI?", "Descriptions of transactions the app could not categorize by itself are sent to Groq to be categorized. When you use the assistant, summary figures about your finances are sent so it can answer. Nothing is sent otherwise."],
  ["Is this financial advice?", "No. Forecasts and assistant answers are estimates built from your past transactions. They can be wrong, especially with limited history."],
];

export default function Guide() {
  return (
    <>
      <section className="hero" style={{ paddingBottom: 32 }}>
        <div className="tag">New here? Start below</div>
        <h1 className="h-lg">How FinOS <em>works</em>.</h1>
        <p className="lead">FinOS reads your bank statement, finds your repeating bills, and forecasts your balance so you can see a shortfall before it happens.</p>
        <div className="row">
          <button className="btn" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>Start the tour</button>
          <Link href="/import" className="btn ghost">Import a statement</Link>
        </div>
      </section>

      <section className="section" style={{ marginTop: 24 }} aria-labelledby="first">
        <div className="head"><h2 className="h" id="first">Your first <em>three steps</em></h2></div>
        <div className="grid3">
          {FIRST.map(([t, d, href, cta], n) => (
            <div key={t} className={`card ${n === 0 ? "pop" : ""}`}>
              <span className="num-badge" aria-hidden="true">{n + 1}</span>
              <h3 className="t-title" style={{ marginTop: 16 }}>{t}</h3>
              <p className="muted" style={{ marginTop: 8 }}>{d}</p>
              <p style={{ marginTop: 12 }}><Link href={href} className="more">{cta}</Link></p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="where">
        <div className="head"><h2 className="h" id="where">Where to find <em>things</em></h2></div>
        <div className="grid3">
          {PAGES.map(([name, href, d]) => (
            <Link key={name} href={href} className="page-card">
              <h3 className="t-title">{name}</h3>
              <p className="muted" style={{ marginTop: 8 }}>{d}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section grid2" style={{ alignItems: "start" }}>
        <div aria-labelledby="words">
          <h2 className="h" id="words" style={{ marginBottom: 24 }}>Words we <em>use</em></h2>
          <div className="card"><dl className="gloss">{WORDS.map(([w, d]) => <div key={w}><dt>{w}</dt><dd>{d}</dd></div>)}</dl></div>
        </div>
        <div aria-labelledby="faq">
          <h2 className="h" id="faq" style={{ marginBottom: 24 }}>Common <em>questions</em></h2>
          <div className="card"><dl className="gloss">{FAQ.map(([q, a]) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}</dl></div>
        </div>
      </section>
    </>
  );
}
