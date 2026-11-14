import { normalizeKey } from "./recurring";
import type { Forecast, RecurringItem, Txn } from "./types";
import { fromDay, round2, sum } from "./util";

const monthKey = (day: number) => fromDay(day).slice(0, 7);
const OWN_MONEY = new Set(["Transfers", "Investments"]); // moving your own money around, not spending or earning
const isSpend = (t: Txn) => t.amount < 0 && !OWN_MONEY.has(t.category);
const isIncome = (t: Txn) => t.amount > 0 && t.category !== "Refund" && !OWN_MONEY.has(t.category);

export function prevMonth(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
}

/** "UPI/BLINKIT/GROCERIES" -> "Blinkit", "ATM WDL - HDFC ATM KORAMANGALA" -> "Atm wdl" */
export function merchantName(desc: string) {
  // Labels produced by the statement reader ("Grocery store", "Person ending 1261") are already clean
  const raw = /[\/]|\s-\s|^(pos|upi|neft|imps|rtgs|ecs|atm|chq|cc)\b/i.test(desc) || /\d{5,}/.test(desc);
  if (!raw) return desc === desc.toUpperCase() ? desc.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase()).trim() : desc.trim();
  const cleaned = desc
    .replace(/^pos\s+\S*x{2,}\S*\s+/i, "")
    .replace(/^(upi\/|pos\/|neft-|rtgs-|imps-\d*-?|ecs\/nach\s*-\s*|atm wdl\s*-\s*|chq paid\s*-\s*\d*\s*-?\s*|cc payment\s*-\s*)/i, "")
    .split(/[/\-]|\s{2,}/)[0]
    .replace(/[0-9]{5,}/g, "")
    .trim();
  const base = cleaned.length >= 3 ? cleaned : normalizeKey(desc) || desc;
  return base.toLowerCase().replace(/(^|\s)(\S)/g, (_m, sp: string, c: string) => sp + c.toUpperCase());
}

export interface Insights {
  asOfDate: string;
  month: string;
  months: { month: string; income: number; spend: number; net: number }[];
  categories: { category: string; amount: number; share: number; previous: number }[];
  monthSpend: number;
  previousMonthSpend: number;
  merchants: { name: string; amount: number; count: number }[];
  weekday: { day: string; avg: number }[];
  biggest: { id: string; description: string; amount: number; date: string }[];
  history: { date: string; balance: number }[];
  income30: number;
  spend30: number;
  savingsRate: number | null;
  daily30: { income: number[]; spend: number[] };
  pace: { day: number; current: number | null; previous: number }[];
}

export function buildInsights(txns: Txn[], openingBalance: number, asOfDay: number): Insights {
  const month = monthKey(asOfDay);
  const prev = prevMonth(month);

  const byMonth = new Map<string, { income: number; spend: number }>();
  for (const t of txns) {
    const k = monthKey(t.day);
    const m = byMonth.get(k) ?? byMonth.set(k, { income: 0, spend: 0 }).get(k)!;
    if (isIncome(t)) m.income += t.amount;
    else if (isSpend(t)) m.spend += -t.amount;
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6)
    .map(([k, v]) => ({ month: k, income: round2(v.income), spend: round2(v.spend), net: round2(v.income - v.spend) }));

  const cur = new Map<string, number>(), old = new Map<string, number>();
  for (const t of txns) {
    if (!isSpend(t)) continue;
    const k = monthKey(t.day);
    if (k === month) cur.set(t.category, (cur.get(t.category) ?? 0) - t.amount);
    else if (k === prev) old.set(t.category, (old.get(t.category) ?? 0) - t.amount);
  }
  const monthSpend = sum([...cur.values()]);
  const categories = [...cur.entries()].sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount: round2(amount), share: monthSpend ? amount / monthSpend : 0, previous: round2(old.get(category) ?? 0) }));

  const from90 = asOfDay - 89, from30 = asOfDay - 29;
  const recent = txns.filter((t) => t.day >= from90 && t.day <= asOfDay);
  const mer = new Map<string, { amount: number; count: number }>();
  const wd = new Array(7).fill(0);
  for (const t of recent) {
    if (!isSpend(t)) continue;
    const name = merchantName(t.description);
    const m = mer.get(name) ?? mer.set(name, { amount: 0, count: 0 }).get(name)!;
    m.amount += -t.amount; m.count++;
    wd[(t.day + 3) % 7] += -t.amount;
  }
  const merchants = [...mer.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 6)
    .map(([name, v]) => ({ name, amount: round2(v.amount), count: v.count }));
  const firstDay = txns.length ? Math.min(...txns.map((t) => t.day)) : asOfDay;
  const windowStart = Math.max(from90, firstDay);
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => {
    let n = 0;
    for (let x = windowStart; x <= asOfDay; x++) if ((x + 3) % 7 === i) n++;
    return { day: d, avg: round2(n ? wd[i] / n : 0) };
  });

  const biggest = txns.filter((t) => isSpend(t) && t.day >= from30).sort((a, b) => a.amount - b.amount).slice(0, 5)
    .map((t) => ({ id: t.id, description: t.description, amount: t.amount, date: fromDay(t.day) }));

  const histStart = Math.max(firstDay, asOfDay - 89);
  let bal = openingBalance + sum(txns.filter((t) => t.day < histStart).map((t) => t.amount));
  const dayDelta = new Map<number, number>();
  for (const t of txns) if (t.day >= histStart && t.day <= asOfDay) dayDelta.set(t.day, (dayDelta.get(t.day) ?? 0) + t.amount);
  const history: Insights["history"] = [];
  for (let d = histStart; d <= asOfDay; d++) { bal += dayDelta.get(d) ?? 0; history.push({ date: fromDay(d), balance: round2(bal) }); }

  const last30 = txns.filter((t) => t.day >= from30 && t.day <= asOfDay);
  const income30 = sum(last30.filter(isIncome).map((t) => t.amount));
  const spend30 = sum(last30.filter(isSpend).map((t) => -t.amount));
  const series = (pred: (t: Txn) => boolean) =>
    Array.from({ length: 30 }, (_, i) => round2(sum(last30.filter((t) => t.day === from30 + i && pred(t)).map((t) => Math.abs(t.amount)))));
  const [cy, cm] = month.split("-").map(Number);
  const dim = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
  const dom = Number(fromDay(asOfDay).slice(8, 10));
  const perDay = (k: string) => {
    const a = new Array<number>(32).fill(0);
    for (const t of txns) if (isSpend(t) && monthKey(t.day) === k) a[Number(fromDay(t.day).slice(8, 10))] += -t.amount;
    return a;
  };
  const ca = perDay(month), pa = perDay(prev);
  let cc = 0, pc = 0;
  const pace = Array.from({ length: dim }, (_, i) => {
    const d = i + 1; cc += ca[d]; pc += pa[d];
    return { day: d, current: d <= dom ? round2(cc) : null, previous: round2(pc) };
  });
  return {
    daily30: { income: series(isIncome), spend: series(isSpend) }, pace,
    asOfDate: fromDay(asOfDay), month, months, categories, monthSpend: round2(monthSpend),
    previousMonthSpend: round2(sum([...old.values()])), merchants, weekday, biggest, history,
    income30: round2(income30), spend30: round2(spend30),
    savingsRate: income30 > 0 ? (income30 - spend30) / income30 : null,
  };
}

export interface Health {
  score: number;
  label: string;
  parts: { name: string; score: number; weight: number; detail: string }[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Explainable 0-100 score: every part shows its own score, weight and the number behind it. */
export function healthScore(ins: Insights, f: Forecast, recurring: RecurringItem[]): Health {
  const dailySpend = ins.spend30 / 30;
  const runwayDays = dailySpend > 0 ? f.startBalance / dailySpend : 365;
  const monthlyFixed = sum(recurring.filter((r) => r.amount < 0 && !r.stopped).map((r) => (-r.amount * 30) / r.cadenceDays));
  const fixedRatio = ins.income30 > 0 ? monthlyFixed / ins.income30 : null;
  const parts: Health["parts"] = [
    { name: "Cash runway", weight: 0.3, score: clamp((runwayDays / 90) * 100), detail: `Your balance covers about ${Math.round(runwayDays)} days of spending` },
    { name: "Savings rate", weight: 0.25, score: ins.savingsRate == null ? 50 : clamp((ins.savingsRate / 0.2) * 100), detail: ins.savingsRate == null ? "No income found in the last 30 days" : `You kept ${Math.round(ins.savingsRate * 100)}% of income in the last 30 days` },
    { name: "Fixed costs", weight: 0.2, score: fixedRatio == null ? 50 : clamp((1 - fixedRatio / 0.8) * 100), detail: fixedRatio == null ? "Not enough income data" : `Recurring bills take ${Math.round(fixedRatio * 100)}% of monthly income` },
    { name: "Shortfall risk", weight: 0.25, score: clamp((1 - f.shortageProbability) * 100), detail: `${Math.round(f.shortageProbability * 100)}% chance of going below zero in ${f.horizon} days` },
  ];
  const score = Math.round(sum(parts.map((p) => p.score * p.weight)));
  return { score, label: score >= 75 ? "Strong" : score >= 55 ? "Steady" : score >= 35 ? "Stretched" : "At risk", parts: parts.map((p) => ({ ...p, score: Math.round(p.score) })) };
}
