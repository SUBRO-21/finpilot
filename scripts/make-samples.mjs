/**
 * Generates realistic, synthetic test data for FinOS (fixed seed, so every run gives the same files):
 *   sample_bank_statement.csv  12 months of a salaried Bengaluru professional's bank account
 *   sample_tradebook.csv       2 years of stock trades (Zerodha tradebook format)
 *   sample_holdings.csv        what is still held at the end of that tradebook (Zerodha holdings format)
 *
 * Run from the repo root:  node scripts/make-samples.mjs
 *
 * The statement is built to exercise every feature:
 *  - rent paid to a landlord's personal account, a maid paid by IMPS and a tenant paying rent by NEFT
 *    (payments the app must ask about), a rent rise in September
 *  - salary raise in April, so spending habits change part-way (tests how much history to learn from)
 *  - quarterly school fees, yearly premiums, an annual bonus and irregular freelance income
 *  - overlapping streaming and music subscriptions, and a Netflix price rise in October
 */
import { writeFileSync } from "node:fs";

/* ---------- helpers ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261115);
const between = (lo, hi) => lo + rand() * (hi - lo);
const intBetween = (lo, hi) => Math.floor(between(lo, hi + 1));
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const chance = (p) => rand() < p;
const money = (n) => Math.round(n); // whole rupees, like most UPI payments
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dmy = (d) => `${String(d.getUTCDate()).padStart(2, "0")}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/* =================================================================== bank statement */
const START = new Date(Date.UTC(2025, 11, 1)); // 1 Dec 2025
const END = new Date(Date.UTC(2026, 10, 14)); // 14 Nov 2026 (the day before "today" in the demo)
const OPENING = 135000;

const events = []; // { date, desc, type, amount (signed) }
const add = (date, desc, type, amount) => events.push({ date, desc, type, amount: money(amount) });

for (let d = START; d <= END; d = addDays(d, 1)) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), dom = d.getUTCDate(), dow = d.getUTCDay();
  const afterRaise = y > 2026 || (y === 2026 && m >= 3); // April 2026 onwards
  const weekend = dow === 0 || dow === 6;
  const festive = (y === 2026 && m === 9 && dom >= 10) || (y === 2026 && m === 10 && dom <= 10); // Dussehra to Diwali
  const summer = m >= 2 && m <= 4;

  /* ---- monthly fixed ---- */
  if (dom === 1) add(d, "SALARY CREDIT - ACME TECH PVT LTD", "NEFT", afterRaise ? 125000 : 110000);
  if (dom === 2) add(d, "NEFT-SURESH KUMAR", "NEFT", -(y === 2026 && m >= 8 ? 34000 : 32000)); // landlord's personal account; rent rises in September
  if (dom === 3) add(d, "ECS/NACH - SBI MUTUAL FUND SIP", "ECS/NACH", -10000);
  if (dom === 3) add(d, "IMPS-LAKSHMI DEVI", "IMPS", -(y === 2026 && m === 9 ? 6000 : 4000)); // maid; Diwali bonus in October
  if (dom === 5) add(d, "ECS/NACH - HDFC HOME LOAN EMI", "ECS/NACH", -28450); // loan on the flat that is rented out
  if (dom === 5 + (m % 3)) add(d, "NEFT-RAHUL SHARMA", "NEFT", 18000); // tenant pays rent, a day or two late some months
  if (dom === 7) add(d, "UPI/AIRTEL/BROADBAND BILL", "UPI", -999);
  if (dom === 8) add(d, "UPI/NETFLIX/SUBSCRIPTION", "UPI", -(y === 2026 && m >= 9 ? 649 : 499)); // price rise from October
  if (dom === 10) add(d, "UPI/AMAZON PRIME VIDEO/SUBSCRIPTION", "UPI", -299);
  if (dom === 12) add(d, "UPI/SPOTIFY/SUBSCRIPTION", "UPI", -119);
  if (dom === 14) add(d, "UPI/JIOSAAVN/PRO SUBSCRIPTION", "UPI", -99);
  if (dom === 15) add(d, "UPI/DISNEY HOTSTAR/SUBSCRIPTION", "UPI", -299);
  if (dom === 18) add(d, "POS/OPENAI CHATGPT SUBSCRIPTION", "POS", -1999);
  if (dom === 20) add(d, "UPI/BESCOM/ELECTRICITY BILL", "UPI", -(summer ? between(2100, 2700) : between(1150, 1600)));
  if (dom === 22) add(d, "UPI/JIO/POSTPAID RECHARGE", "UPI", -399);
  if (dom === 28) add(d, "UPI/APOLLO PHARMACY/MEDICINES", "UPI", -between(350, 1400));

  /* ---- quarterly, yearly and one-offs ---- */
  if (dom === 10 && [0, 3, 6, 9].includes(m)) add(d, "NEFT-ST JOSEPHS SCHOOL-TERM FEES", "NEFT", -45000);
  if (dom === 31 && m === 2) add(d, "BONUS CREDIT - ACME TECH PVT LTD", "NEFT", 60000);
  if (dom === 15 && m === 2) add(d, "LIC PREMIUM - POLICY 4471", "ECS/NACH", -24000);
  if (dom === 20 && m === 6) add(d, "NEFT-NEW INDIA ASSURANCE-CAR INSURANCE", "NEFT", -14500);
  if (dom === 30 && [2, 5, 8].includes(m)) add(d, "INTEREST CREDIT - SAVINGS", "INT", between(850, 1100));
  if (y === 2026 && ((m === 1 && dom === 16) || (m === 5 && dom === 12) || (m === 8 && dom === 22)))
    add(d, `RTGS-GLOBAL SOLUTIONS LTD-INVOICE ${intBetween(4000, 4999)}`, "RTGS", pick([35000, 40000, 55000])); // freelance work
  if ((y === 2026 && m === 0 && dom === 6) || (y === 2026 && m === 4 && dom === 4) || (y === 2026 && m === 7 && dom === 4) || (y === 2026 && m === 10 && dom === 4))
    add(d, "NEFT-ZERODHA BROKING LTD", "NEFT", -25000); // adds money to the trading account
  if (y === 2026 && m === 5 && dom === 18) add(d, "IMPS-SELF-HDFC SAVINGS ACCOUNT", "IMPS", -20000); // to own account
  if (y === 2025 && m === 11 && dom === 19) add(d, "UPI/INDIGO/FLIGHT BOOKING", "UPI", -7400);
  if (y === 2026 && m === 4 && dom === 9) add(d, "UPI/MAKEMYTRIP/HOTEL BOOKING", "UPI", -16500);
  if (y === 2026 && m === 4 && dom === 11) add(d, "UPI/IRCTC/TRAIN TICKET", "UPI", -4200);
  if (y === 2026 && m === 4 && dom === 23) add(d, "UPI/MANIPAL HOSPITAL/OPD AND TESTS", "UPI", -18000);
  if (y === 2026 && m === 1 && dom === 9) add(d, "UPI/AMAZON/REFUND", "UPI", 1299);

  /* ---- day-to-day spending (busier after the raise and around festivals) ---- */
  const lift = afterRaise ? 1.25 : 1;
  if (chance(0.34 * lift)) add(d, pick(["UPI/BLINKIT/GROCERIES", "UPI/ZEPTO/GROCERIES", "UPI/BIGBASKET/GROCERIES", "UPI/DMART/GROCERIES"]), "UPI", -between(280, weekend ? 2600 : 1500));
  if (chance((weekend ? 0.6 : 0.3) * lift)) add(d, pick(["UPI/SWIGGY/FOOD ORDER", "UPI/ZOMATO/FOOD ORDER", "UPI/THIRD WAVE COFFEE/CAFE"]), "UPI", -between(180, 950));
  if (!weekend && chance(0.45)) add(d, pick(["UPI/UBER INDIA/RIDE", "UPI/OLA/RIDE", "UPI/NAMMA METRO/RECHARGE"]), "UPI", -between(90, 420));
  if (dom % 14 === 6) add(d, "UPI/HP PETROL PUMP/FUEL", "UPI", -between(1400, 2400));
  if (chance((festive ? 0.35 : 0.08) * lift)) add(d, pick(["UPI/AMAZON/SHOPPING", "UPI/FLIPKART/SHOPPING", "UPI/MYNTRA/SHOPPING"]), "UPI", -between(festive ? 1500 : 450, festive ? 11000 : 3800));
  if (weekend && chance(0.12)) add(d, "UPI/BOOKMYSHOW/MOVIE TICKETS", "UPI", -between(450, 1300));
  if (dom === 9 || (dom === 24 && chance(0.6))) add(d, "ATM WDL - SBI ATM KORAMANGALA", "ATM", -pick([2000, 3000, 5000]));
}

events.sort((a, b) => a.date - b.date);
let bal = OPENING;
let refSeq = 0;
const bankRows = [["Date", "Value Date", "Description", "Transaction Type", "Reference No", "Debit", "Credit", "Balance"]];
bankRows.push([dmy(START), dmy(START), "Opening Balance", "OPENING", "", "", "", OPENING.toFixed(2)]);
let minBal = OPENING, minDate = START;
for (const e of events) {
  bal += e.amount;
  if (bal < minBal) { minBal = bal; minDate = e.date; }
  const ymd = iso(e.date).replace(/-/g, "").slice(2);
  const ref = `${e.type.replace(/[^A-Z]/g, "").slice(0, 4)}${ymd}${String(++refSeq).padStart(4, "0")}`;
  bankRows.push([dmy(e.date), dmy(e.date), e.desc, e.type, ref, e.amount < 0 ? (-e.amount).toFixed(2) : "", e.amount > 0 ? e.amount.toFixed(2) : "", bal.toFixed(2)]);
}
writeFileSync("sample_bank_statement.csv", bankRows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n");

/* =================================================================== trades and holdings */
// Synthetic daily prices: a random walk with a drift per stock. Not real market data.
const STOCKS = {
  // core long-term holdings (bought regularly)
  HDFCBANK: { p: 1640, drift: 0.10, vol: 0.22, core: true }, ICICIBANK: { p: 1250, drift: 0.16, vol: 0.22, core: true },
  INFY: { p: 1850, drift: -0.04, vol: 0.26, core: true }, TCS: { p: 4100, drift: -0.12, vol: 0.22, core: true },
  RELIANCE: { p: 1290, drift: 0.08, vol: 0.24, core: true }, ITC: { p: 470, drift: -0.06, vol: 0.18, core: true },
  NIFTYBEES: { p: 265, drift: 0.09, vol: 0.14, core: true }, SUNPHARMA: { p: 1800, drift: 0.05, vol: 0.22, core: true },
  BHARTIARTL: { p: 1600, drift: 0.20, vol: 0.22, core: true }, LT: { p: 3600, drift: 0.07, vol: 0.24, core: true },
  // swing trades (in and out)
  TATAMOTORS: { p: 780, drift: -0.20, vol: 0.38 }, ZOMATO: { p: 270, drift: 0.05, vol: 0.45 }, PAYTM: { p: 950, drift: -0.05, vol: 0.50 },
  NYKAA: { p: 170, drift: 0.02, vol: 0.40 }, VEDL: { p: 450, drift: -0.08, vol: 0.38 }, ADANIPORTS: { p: 1200, drift: 0.04, vol: 0.36 },
  TITAN: { p: 3300, drift: 0.06, vol: 0.28 }, DRREDDY: { p: 1300, drift: 0.03, vol: 0.26 }, AXISBANK: { p: 1100, drift: 0.04, vol: 0.28 },
  WIPRO: { p: 300, drift: -0.02, vol: 0.30 }, TATASTEEL: { p: 145, drift: 0.02, vol: 0.34 }, SBIN: { p: 800, drift: 0.07, vol: 0.28 },
};
const ISIN = Object.fromEntries(Object.keys(STOCKS).map((s, i) => [s, `INE${(1000 + i * 37).toString(36).toUpperCase().padStart(4, "0")}A010${(i % 9) + 1}`]));
const T_START = new Date(Date.UTC(2024, 11, 2)); // 2 Dec 2024
const T_END = new Date(Date.UTC(2026, 10, 13)); // 13 Nov 2026
const px = Object.fromEntries(Object.entries(STOCKS).map(([s, v]) => [s, v.p]));
const lots = Object.fromEntries(Object.keys(STOCKS).map((s) => [s, []])); // open FIFO lots {qty, price, date}
const trades = [];
let tradeSeq = 2400000;
const round05 = (x) => Math.round(x * 20) / 20; // NSE tick size 0.05
const exec = (d) => `${iso(d)}T${String(intBetween(9, 15)).padStart(2, "0")}:${String(intBetween(15, 59)).padStart(2, "0")}:${String(intBetween(0, 59)).padStart(2, "0")}`;
function trade(d, s, side, qty, price) {
  if (qty <= 0) return;
  price = round05(price);
  trades.push({ symbol: s, date: d, side, qty, price, id: ++tradeSeq, time: exec(d) });
  if (side === "buy") lots[s].push({ qty, price, date: d });
  else {
    let left = qty;
    while (left > 0 && lots[s].length) { const l = lots[s][0]; const q = Math.min(left, l.qty); l.qty -= q; left -= q; if (!l.qty) lots[s].shift(); }
  }
}
const held = (s) => lots[s].reduce((a, l) => a + l.qty, 0);
const avgCost = (s) => { const q = held(s); return q ? lots[s].reduce((a, l) => a + l.qty * l.price, 0) / q : 0; };
const oldestDays = (s, d) => (lots[s].length ? (d - lots[s][0].date) / 86400000 : 0);

let monthSeen = -1;
for (let d = T_START; d <= T_END; d = addDays(d, 1)) {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) continue; // markets closed
  for (const [s, v] of Object.entries(STOCKS)) px[s] *= Math.exp((v.drift - v.vol ** 2 / 2) / 250 + (v.vol / Math.sqrt(250)) * (rand() + rand() + rand() - 1.5) * 2);

  // Core: on the first trading day of each month, top up two or three long-term holdings (~₹15,000 each)
  const mk = d.getUTCFullYear() * 12 + d.getUTCMonth();
  if (mk !== monthSeen) {
    monthSeen = mk;
    const core = Object.keys(STOCKS).filter((s) => STOCKS[s].core).sort(() => rand() - 0.5); // shuffled: distinct picks
    for (const s of core.slice(0, intBetween(2, 3))) trade(d, s, "buy", Math.max(1, Math.round(15000 / px[s])), px[s]);
  }
  // Core: book part of a big winner held over a year (long-term gain)
  for (const s of Object.keys(STOCKS).filter((x) => STOCKS[x].core)) {
    if (held(s) > 4 && px[s] > avgCost(s) * 1.3 && oldestDays(s, d) > 370 && chance(0.02)) trade(d, s, "sell", Math.floor(held(s) / 3), px[s]);
  }
  // Swing: enter now and then; sell winners fast (+7%), sit on losers for months (a very common habit)
  const swing = Object.keys(STOCKS).filter((s) => !STOCKS[s].core);
  if (chance(0.09)) { const s = pick(swing); if (!held(s)) trade(d, s, "buy", Math.max(1, Math.round(between(15000, 40000) / px[s])), px[s]); }
  for (const s of swing) {
    if (!held(s)) continue;
    const gain = px[s] / avgCost(s) - 1, age = oldestDays(s, d);
    if (gain >= 0.07 || (gain <= -0.18 && age > 150 && chance(0.03)) || (age > 330 && chance(0.02))) trade(d, s, "sell", held(s), px[s]);
  }
  // A few same-day (intraday) trades
  if (chance(0.025)) {
    const s = pick(["SBIN", "TATASTEEL", "AXISBANK", "WIPRO"]);
    const q = Math.round(between(20000, 50000) / px[s]);
    trades.push({ symbol: s, date: d, side: "buy", qty: q, price: round05(px[s]), id: ++tradeSeq, time: `${iso(d)}T09:${intBetween(16, 40)}:${String(intBetween(0, 59)).padStart(2, "0")}` });
    trades.push({ symbol: s, date: d, side: "sell", qty: q, price: round05(px[s] * between(0.985, 1.018)), id: ++tradeSeq, time: `${iso(d)}T14:${intBetween(30, 59)}:${String(intBetween(0, 59)).padStart(2, "0")}` });
  }
}

const tradeRows = [["symbol", "isin", "trade_date", "exchange", "segment", "series", "trade_type", "auction", "quantity", "price", "trade_id", "order_id", "order_execution_time"]];
for (const t of trades) tradeRows.push([t.symbol, ISIN[t.symbol], iso(t.date), "NSE", "EQ", "EQ", t.side, "false", t.qty, t.price.toFixed(2), t.id, `${iso(t.date).replace(/-/g, "")}${String(t.id).slice(-5)}`, t.time]);
writeFileSync("sample_tradebook.csv", tradeRows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n");

const holdRows = [["Instrument", "Qty.", "Avg. cost", "LTP", "Cur. val", "P&L", "Net chg.", "Day chg."]];
const holdings = Object.keys(STOCKS).filter((s) => held(s) > 0).map((s) => {
  const q = held(s), avg = avgCost(s), ltp = round05(px[s]);
  return { s, q, avg, ltp, val: q * ltp, pnl: q * (ltp - avg) };
}).sort((a, b) => b.val - a.val);
for (const h of holdings)
  holdRows.push([h.s, h.q, h.avg.toFixed(2), h.ltp.toFixed(2), h.val.toFixed(2), h.pnl.toFixed(2), ((h.ltp / h.avg - 1) * 100).toFixed(2), between(-1.5, 1.5).toFixed(2)]);
writeFileSync("sample_holdings.csv", holdRows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n");

console.log(`sample_bank_statement.csv  ${events.length} transactions, ${iso(START)} to ${iso(END)}, closing balance ₹${Math.round(bal).toLocaleString("en-IN")}, lowest ₹${Math.round(minBal).toLocaleString("en-IN")} on ${iso(minDate)}`);
console.log(`sample_tradebook.csv       ${trades.length} trades, ${iso(T_START)} to ${iso(T_END)}`);
console.log(`sample_holdings.csv        ${holdings.length} holdings worth ₹${Math.round(holdings.reduce((a, h) => a + h.val, 0)).toLocaleString("en-IN")}`);
