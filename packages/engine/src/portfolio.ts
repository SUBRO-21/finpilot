import { normDate, parseAmount, parseCsvRows } from "./csv";
import { fromDay, mean, round2, sum, toDay } from "./util";

/* ------------------------------------------------------------------ parsing */

export interface HoldingRow { symbol: string; quantity: number; avgPrice: number; lastPrice: number; sector?: string | null }
export interface TradeRow { symbol: string; day: number; side: "BUY" | "SELL"; quantity: number; price: number; tradeId: string }

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Finds the header row (the first row naming enough of the wanted columns) and maps each field to a column index. */
function locate(rows: string[][], fields: Record<string, string[]>, required: string[]) {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const heads = rows[r].map(norm);
    const idx: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(fields)) {
      // exact header name first, then a header that contains the alias
      let i = heads.findIndex((h) => aliases.includes(h));
      if (i < 0) i = heads.findIndex((h) => aliases.some((a) => h.includes(a)));
      idx[field] = i;
    }
    if (required.every((f) => idx[f] >= 0)) return { header: r, idx };
  }
  return null;
}

const HOLDING_FIELDS = {
  symbol: ["symbol", "instrument", "tradingsymbol", "stock name", "stock", "scrip", "scrip name", "security name", "company name", "name"],
  quantity: ["quantity available", "quantity", "qty", "net qty", "shares", "units"],
  avgPrice: ["average price", "avg price", "average buy price", "avg buy price", "avg cost", "average cost", "buy price", "buy avg"],
  lastPrice: ["ltp", "last price", "current price", "closing price", "previous closing price", "cmp", "market price", "close price"],
  value: ["current value", "cur val", "closing value", "present value", "market value"],
  sector: ["sector", "industry"],
};

/** Reads a broker holdings export (Zerodha Console, Groww, Upstox and similar). */
export function parseHoldingsCsv(text: string): { rows: HoldingRow[]; errors: string[] } {
  const rows = parseCsvRows(text);
  const loc = locate(rows, HOLDING_FIELDS, ["symbol", "quantity", "avgPrice"]);
  if (!loc) return { rows: [], errors: ["Couldn't find the columns. The file needs a stock name or symbol, a quantity and an average buy price."] };
  const { header, idx } = loc;
  if (idx.lastPrice < 0 && idx.value < 0) return { rows: [], errors: ["The file has no current price (LTP or closing price) or current value column."] };
  const out = new Map<string, HoldingRow>();
  const errors: string[] = [];
  for (let r = header + 1; r < rows.length; r++) {
    const row = rows[r];
    const symbol = (row[idx.symbol] ?? "").trim().toUpperCase();
    if (!symbol || /^total/i.test(symbol)) continue;
    const quantity = parseAmount(row[idx.quantity]);
    const avgPrice = parseAmount(row[idx.avgPrice]);
    let lastPrice = idx.lastPrice >= 0 ? parseAmount(row[idx.lastPrice]) : null;
    if ((lastPrice == null || lastPrice <= 0) && idx.value >= 0 && quantity) lastPrice = (parseAmount(row[idx.value]) ?? 0) / quantity;
    if (!quantity || quantity <= 0 || avgPrice == null || avgPrice < 0 || !lastPrice || lastPrice <= 0) {
      errors.push(`Row ${r + 1} (${symbol}): missing quantity or price`);
      continue;
    }
    const sector = idx.sector >= 0 ? (row[idx.sector] ?? "").trim() || null : null;
    // The same stock on two exchanges or in two accounts: merge into one position
    const prev = out.get(symbol);
    if (prev) {
      const q = prev.quantity + quantity;
      out.set(symbol, { ...prev, quantity: q, avgPrice: (prev.avgPrice * prev.quantity + avgPrice * quantity) / q, lastPrice });
    } else out.set(symbol, { symbol, quantity, avgPrice, lastPrice, sector });
  }
  return { rows: [...out.values()], errors };
}

const TRADE_FIELDS = {
  symbol: ["symbol", "tradingsymbol", "instrument", "stock name", "scrip", "scrip name", "security name", "name"],
  date: ["trade date", "date", "order execution time", "execution time", "transaction date", "trade time"],
  side: ["trade type", "buy sell", "buy or sell", "side", "transaction type", "action", "type"],
  quantity: ["quantity", "qty", "shares", "units"],
  price: ["price", "trade price", "rate", "avg price", "average price"],
  tradeId: ["trade id", "trade no", "trade number"],
};

/** Reads a broker tradebook export (every executed buy and sell). */
export function parseTradebookCsv(text: string): { rows: TradeRow[]; errors: string[] } {
  const rows = parseCsvRows(text);
  const loc = locate(rows, TRADE_FIELDS, ["symbol", "date", "side", "quantity", "price"]);
  if (!loc) return { rows: [], errors: ["Couldn't find the columns. A tradebook needs symbol, trade date, buy/sell, quantity and price."] };
  const { header, idx } = loc;
  const out: TradeRow[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();
  for (let r = header + 1; r < rows.length; r++) {
    const row = rows[r];
    const symbol = (row[idx.symbol] ?? "").trim().toUpperCase();
    if (!symbol) continue;
    const iso = normDate(row[idx.date] ?? "");
    const s = (row[idx.side] ?? "").trim().toLowerCase();
    const side = /^(b|buy|purchase)/.test(s) ? "BUY" : /^(s|sell|sale)/.test(s) ? "SELL" : null;
    const quantity = Math.abs(parseAmount(row[idx.quantity]) ?? 0);
    const price = parseAmount(row[idx.price]);
    if (!iso || !side || !quantity || price == null || price <= 0) {
      errors.push(`Row ${r + 1} (${symbol}): couldn't read the date, buy/sell, quantity or price`);
      continue;
    }
    // Broker trade id when present; otherwise a fingerprint, numbered so identical fills on one day stay distinct
    let tradeId = idx.tradeId >= 0 ? (row[idx.tradeId] ?? "").trim() : "";
    if (!tradeId) {
      const fp = `${symbol}|${iso}|${side}|${quantity}|${price}`;
      const n = (seen.get(fp) ?? 0) + 1;
      seen.set(fp, n);
      tradeId = `${fp}#${n}`;
    }
    out.push({ symbol, day: toDay(iso), side, quantity, price, tradeId });
  }
  return { rows: out.sort((a, b) => a.day - b.day), errors };
}

/* ---------------------------------------------------- current portfolio */

/** Sector for common NSE stocks when the holdings file has no sector column. */
const SECTORS: Record<string, string> = {
  TCS: "IT", INFY: "IT", WIPRO: "IT", HCLTECH: "IT", TECHM: "IT", LTIM: "IT", PERSISTENT: "IT", COFORGE: "IT", MPHASIS: "IT",
  HDFCBANK: "Banking", ICICIBANK: "Banking", SBIN: "Banking", KOTAKBANK: "Banking", AXISBANK: "Banking", INDUSINDBK: "Banking", BANKBARODA: "Banking", PNB: "Banking", IDFCFIRSTB: "Banking", FEDERALBNK: "Banking",
  BAJFINANCE: "Financial services", BAJAJFINSV: "Financial services", HDFCLIFE: "Insurance", SBILIFE: "Insurance", ICICIPRULI: "Insurance", LICI: "Insurance", JIOFIN: "Financial services", CHOLAFIN: "Financial services",
  RELIANCE: "Energy", ONGC: "Energy", BPCL: "Energy", IOC: "Energy", NTPC: "Power", POWERGRID: "Power", TATAPOWER: "Power", ADANIGREEN: "Power", COALINDIA: "Mining",
  HINDUNILVR: "FMCG", ITC: "FMCG", NESTLEIND: "FMCG", BRITANNIA: "FMCG", DABUR: "FMCG", TATACONSUM: "FMCG", MARICO: "FMCG", GODREJCP: "FMCG",
  MARUTI: "Auto", "M&M": "Auto", TATAMOTORS: "Auto", BAJAJ_AUTO: "Auto", "BAJAJ-AUTO": "Auto", EICHERMOT: "Auto", HEROMOTOCO: "Auto", TVSMOTOR: "Auto",
  SUNPHARMA: "Pharma", DRREDDY: "Pharma", CIPLA: "Pharma", DIVISLAB: "Pharma", APOLLOHOSP: "Healthcare", LUPIN: "Pharma",
  LT: "Infrastructure", ADANIPORTS: "Infrastructure", ULTRACEMCO: "Cement", GRASIM: "Cement", SHREECEM: "Cement", AMBUJACEM: "Cement",
  TATASTEEL: "Metals", JSWSTEEL: "Metals", HINDALCO: "Metals", VEDL: "Metals",
  BHARTIARTL: "Telecom", TITAN: "Consumer", ASIANPAINT: "Consumer", TRENT: "Retail", DMART: "Retail", ZOMATO: "Internet", ETERNAL: "Internet", NYKAA: "Internet", PAYTM: "Internet",
  NIFTYBEES: "Index fund", BANKBEES: "Index fund", GOLDBEES: "Gold", JUNIORBEES: "Index fund",
};

export interface HoldingView {
  symbol: string; sector: string; quantity: number; avgPrice: number; lastPrice: number;
  invested: number; current: number; pnl: number; pnlPct: number; weight: number;
}

export interface HoldingsAnalysis {
  count: number;
  invested: number;
  current: number;
  pnl: number;
  pnlPct: number;
  holdings: HoldingView[];
  sectors: { sector: string; current: number; weight: number; count: number }[];
  concentration: { label: "Concentrated" | "Moderately diversified" | "Well diversified"; top: { symbol: string; weight: number } | null; top5Weight: number; effectiveHoldings: number; reasons: string[] };
  winners: HoldingView[];
  losers: HoldingView[];
  insights: string[];
}

/** Ratios (returns, weights) keep 4 decimals so 8.67% is not shown as 9%. */
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const inr = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
const pctTxt = (x: number) => `${Math.round(x * 100)}%`;

export function analyzeHoldings(rows: HoldingRow[]): HoldingsAnalysis {
  const views0 = rows.map((h) => {
    const invested = h.quantity * h.avgPrice;
    const current = h.quantity * h.lastPrice;
    return {
      symbol: h.symbol, sector: h.sector || SECTORS[h.symbol] || "Other", quantity: h.quantity, avgPrice: round2(h.avgPrice), lastPrice: round2(h.lastPrice),
      invested: round2(invested), current: round2(current), pnl: round2(current - invested), pnlPct: invested > 0 ? r4((current - invested) / invested) : 0, weight: 0,
    };
  });
  const invested = sum(views0.map((v) => v.invested));
  const current = sum(views0.map((v) => v.current));
  const holdings = views0.map((v) => ({ ...v, weight: current > 0 ? r4(v.current / current) : 0 })).sort((a, b) => b.current - a.current);

  const bySector = new Map<string, { current: number; count: number }>();
  for (const h of holdings) {
    const s = bySector.get(h.sector) ?? bySector.set(h.sector, { current: 0, count: 0 }).get(h.sector)!;
    s.current += h.current; s.count++;
  }
  const sectors = [...bySector.entries()].map(([sector, s]) => ({ sector, current: round2(s.current), weight: current > 0 ? r4(s.current / current) : 0, count: s.count })).sort((a, b) => b.current - a.current);

  // Effective number of holdings = 1 / sum of squared weights (10 equal stocks = 10; one dominant stock pulls it toward 1)
  const hhi = sum(holdings.map((h) => h.weight ** 2));
  const effectiveHoldings = hhi > 0 ? round2(1 / hhi) : 0;
  const top = holdings[0] ? { symbol: holdings[0].symbol, weight: holdings[0].weight } : null;
  const top5Weight = r4(sum(holdings.slice(0, 5).map((h) => h.weight)));
  const topSector = sectors.find((s) => s.sector !== "Other");
  const reasons: string[] = [];
  let label: HoldingsAnalysis["concentration"]["label"] = "Well diversified";
  if ((top && top.weight > 0.25) || effectiveHoldings < 5) {
    label = "Concentrated";
    if (top && top.weight > 0.25) reasons.push(`${top.symbol} alone is ${pctTxt(top.weight)} of your portfolio.`);
    if (effectiveHoldings < 5) reasons.push(`Your money behaves like about ${Math.max(1, Math.round(effectiveHoldings))} equal-sized stocks, which is few.`);
  } else if (effectiveHoldings < 10 || (topSector && topSector.weight > 0.4)) {
    label = "Moderately diversified";
    if (topSector && topSector.weight > 0.4) reasons.push(`${pctTxt(topSector.weight)} is in one sector (${topSector.sector}).`);
    if (effectiveHoldings < 10) reasons.push(`Your money behaves like about ${Math.round(effectiveHoldings)} equal-sized stocks.`);
  } else reasons.push(`Spread across ${holdings.length} stocks and ${sectors.length} sectors with no single big bet.`);

  const byReturn = [...holdings].sort((a, b) => b.pnlPct - a.pnlPct);
  const winners = byReturn.filter((h) => h.pnl > 0).slice(0, 3);
  const losers = byReturn.filter((h) => h.pnl < 0).reverse().slice(0, 3);

  const insights: string[] = [];
  if (holdings.length) insights.push(`You have ${inr(current)} in ${holdings.length} stock${holdings.length === 1 ? "" : "s"}, ${current >= invested ? "up" : "down"} ${inr(Math.abs(current - invested))} (${pctTxt(Math.abs(invested ? (current - invested) / invested : 0))}) on the ${inr(invested)} you put in.`);
  if (top && top.weight >= 0.15) insights.push(`If ${top.symbol} fell 10%, your whole portfolio would drop about ${inr(top.weight * current * 0.1)} (${pctTxt(top.weight * 0.1)}).`);
  if (topSector && topSector.weight >= 0.3) insights.push(`Your biggest sector is ${topSector.sector} at ${pctTxt(topSector.weight)}. News that hits that sector hits a large part of your money.`);
  const inLoss = holdings.filter((h) => h.pnl < 0);
  if (inLoss.length) insights.push(`${inLoss.length} of ${holdings.length} holdings are below what you paid, ${inr(sum(inLoss.map((h) => h.pnl)))} in total.`);
  const unknown = holdings.filter((h) => h.sector === "Other").length;
  if (unknown) insights.push(`${unknown} holding${unknown === 1 ? " has" : "s have"} no known sector. Add a Sector column to the file for a fuller picture.`);

  return {
    count: holdings.length, invested: round2(invested), current: round2(current), pnl: round2(current - invested),
    pnlPct: invested > 0 ? r4((current - invested) / invested) : 0,
    holdings, sectors, concentration: { label, top, top5Weight, effectiveHoldings, reasons }, winners, losers, insights,
  };
}

/* ----------------------------------------------------- trade history */

export interface ClosedLot {
  symbol: string; buyDate: string; sellDate: string; quantity: number; buyPrice: number; sellPrice: number;
  pnl: number; pnlPct: number; holdDays: number; term: "INTRADAY" | "SHORT" | "LONG";
}

export interface TradesAnalysis {
  firstDate: string | null;
  lastDate: string | null;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  symbolCount: number;
  boughtValue: number;
  soldValue: number;
  tradesPerMonth: number;
  realized: { total: number; intraday: number; shortTerm: number; longTerm: number };
  closed: {
    count: number; wins: number; losses: number; winRate: number | null;
    avgWinPct: number | null; avgLossPct: number | null; avgHoldDaysWin: number | null; avgHoldDaysLoss: number | null;
    best: ClosedLot | null; worst: ClosedLot | null;
  };
  bySymbol: { symbol: string; realized: number; trades: number; openQty: number; closedLots: number }[];
  monthly: { month: string; buys: number; sells: number; trades: number; realized: number }[];
  unmatchedSellQty: number;
  lots: ClosedLot[]; // every matched sale, oldest sale first (for charts)
  behaviour: string[];
}

const LONG_TERM_DAYS = 365; // listed equity in India: held over a year counts as long term

/**
 * Matches every sell against the oldest unsold buys of the same stock (first in, first out), the way
 * brokers and the tax department compute realized profit. Each matched piece is a closed lot.
 */
export function analyzeTrades(trades: TradeRow[]): TradesAnalysis {
  const sorted = [...trades].sort((a, b) => a.day - b.day || (a.side === "BUY" ? -1 : 1));
  const open = new Map<string, { day: number; qty: number; price: number }[]>();
  const lots: ClosedLot[] = [];
  const stats = new Map<string, { realized: number; trades: number; closedLots: number }>();
  const monthly = new Map<string, { buys: number; sells: number; trades: number; realized: number }>();
  let unmatchedSellQty = 0;

  for (const t of sorted) {
    const s = stats.get(t.symbol) ?? stats.set(t.symbol, { realized: 0, trades: 0, closedLots: 0 }).get(t.symbol)!;
    s.trades++;
    const mk = fromDay(t.day).slice(0, 7);
    const m = monthly.get(mk) ?? monthly.set(mk, { buys: 0, sells: 0, trades: 0, realized: 0 }).get(mk)!;
    m.trades++;
    const queue = open.get(t.symbol) ?? open.set(t.symbol, []).get(t.symbol)!;
    if (t.side === "BUY") { m.buys += t.quantity * t.price; queue.push({ day: t.day, qty: t.quantity, price: t.price }); continue; }
    m.sells += t.quantity * t.price;
    let left = t.quantity;
    while (left > 1e-9 && queue.length) {
      const lot = queue[0];
      const q = Math.min(left, lot.qty);
      const pnl = (t.price - lot.price) * q;
      const holdDays = t.day - lot.day;
      lots.push({
        symbol: t.symbol, buyDate: fromDay(lot.day), sellDate: fromDay(t.day), quantity: q, buyPrice: lot.price, sellPrice: t.price,
        pnl: round2(pnl), pnlPct: r4((t.price - lot.price) / lot.price), holdDays,
        term: holdDays === 0 ? "INTRADAY" : holdDays > LONG_TERM_DAYS ? "LONG" : "SHORT",
      });
      s.realized += pnl; s.closedLots++; m.realized += pnl;
      lot.qty -= q; left -= q;
      if (lot.qty <= 1e-9) queue.shift();
    }
    if (left > 1e-9) unmatchedSellQty += left; // bought before the file starts
  }

  const wins = lots.filter((l) => l.pnl > 0);
  const losses = lots.filter((l) => l.pnl < 0);
  const realizedOf = (term: ClosedLot["term"]) => round2(sum(lots.filter((l) => l.term === term).map((l) => l.pnl)));
  const days = sorted.length ? sorted[sorted.length - 1].day - sorted[0].day + 1 : 0;
  const tradesPerMonth = days ? round2(sorted.length / Math.max(1, days / 30.44)) : 0;
  const byPnl = [...lots].sort((a, b) => b.pnl - a.pnl);
  const avg = (xs: number[]) => (xs.length ? r4(mean(xs)) : null);

  const closed = {
    count: lots.length, wins: wins.length, losses: losses.length,
    winRate: lots.length ? r4(wins.length / lots.length) : null,
    avgWinPct: avg(wins.map((l) => l.pnlPct)), avgLossPct: avg(losses.map((l) => l.pnlPct)),
    avgHoldDaysWin: avg(wins.map((l) => l.holdDays)), avgHoldDaysLoss: avg(losses.map((l) => l.holdDays)),
    best: byPnl[0] && byPnl[0].pnl > 0 ? byPnl[0] : null, worst: byPnl.length && byPnl[byPnl.length - 1].pnl < 0 ? byPnl[byPnl.length - 1] : null,
  };
  const realized = { total: round2(sum(lots.map((l) => l.pnl))), intraday: realizedOf("INTRADAY"), shortTerm: realizedOf("SHORT"), longTerm: realizedOf("LONG") };

  // Plain-language patterns, each backed by the numbers above
  const behaviour: string[] = [];
  if (lots.length) {
    behaviour.push(`${wins.length} of ${lots.length} closed trades made money (${pctTxt(closed.winRate!)}). Total realized ${realized.total >= 0 ? "profit" : "loss"}: ${inr(Math.abs(realized.total))}.`);
    if (closed.avgWinPct != null && closed.avgLossPct != null)
      behaviour.push(`Winning trades gained ${pctTxt(closed.avgWinPct)} on average; losing trades lost ${pctTxt(Math.abs(closed.avgLossPct))}.${Math.abs(closed.avgLossPct) > closed.avgWinPct ? " Your losses are bigger than your wins, so you need to be right more often just to break even." : ""}`);
    if (wins.length >= 3 && losses.length >= 3 && closed.avgHoldDaysLoss! > closed.avgHoldDaysWin! * 1.5)
      behaviour.push(`You sell winners after about ${Math.round(closed.avgHoldDaysWin!)} days but hold losers for about ${Math.round(closed.avgHoldDaysLoss!)} days. This common habit locks in small gains while letting losses run.`);
    const shortShare = lots.filter((l) => l.term !== "LONG").length / lots.length;
    if (shortShare >= 0.7 && lots.length >= 5)
      behaviour.push(`${pctTxt(shortShare)} of your sales happened within a year of buying. In India short-term gains on shares are taxed at a higher rate than long-term ones, so holding longer can keep more of the profit.`);
    const intra = lots.filter((l) => l.term === "INTRADAY");
    if (intra.length >= 3) behaviour.push(`${intra.length} trades were bought and sold the same day (intraday), with a combined ${realized.intraday >= 0 ? "profit" : "loss"} of ${inr(Math.abs(realized.intraday))}.`);
  }
  if (tradesPerMonth > 20) behaviour.push(`You trade about ${Math.round(tradesPerMonth)} times a month. Brokerage, taxes and charges add up quickly at that pace.`);
  const symRows = [...stats.entries()].map(([symbol, s]) => ({
    symbol, realized: round2(s.realized), trades: s.trades, closedLots: s.closedLots,
    openQty: round2(sum((open.get(symbol) ?? []).map((l) => l.qty))),
  })).sort((a, b) => b.realized - a.realized);
  const worstSym = symRows[symRows.length - 1];
  if (worstSym && worstSym.realized < 0 && realized.total !== 0) behaviour.push(`Your biggest loss came from ${worstSym.symbol}: ${inr(worstSym.realized)} realized.`);
  if (unmatchedSellQty > 0) behaviour.push(`Some sells had no matching buy in this file (shares bought before it starts), so their profit isn't counted. Upload an older tradebook to include them.`);

  return {
    firstDate: sorted.length ? fromDay(sorted[0].day) : null, lastDate: sorted.length ? fromDay(sorted[sorted.length - 1].day) : null,
    tradeCount: sorted.length, buyCount: sorted.filter((t) => t.side === "BUY").length, sellCount: sorted.filter((t) => t.side === "SELL").length,
    symbolCount: stats.size,
    boughtValue: round2(sum(sorted.filter((t) => t.side === "BUY").map((t) => t.quantity * t.price))),
    soldValue: round2(sum(sorted.filter((t) => t.side === "SELL").map((t) => t.quantity * t.price))),
    tradesPerMonth, realized, closed, bySymbol: symRows,
    monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-24).map(([month, v]) => ({ month, buys: round2(v.buys), sells: round2(v.sells), trades: v.trades, realized: round2(v.realized) })),
    unmatchedSellQty: round2(unmatchedSellQty), behaviour,
    lots: [...lots].sort((a, b) => a.sellDate.localeCompare(b.sellDate)),
  };
}
