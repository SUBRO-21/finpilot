import { merchantName, prevMonth } from "./insights";
import type { Txn } from "./types";
import { fromDay, round2, sum, toDay } from "./util";

const isSpend = (t: Txn) => t.amount < 0 && t.category !== "Transfers";
const monthKey = (d: number) => fromDay(d).slice(0, 7);
export type Period = "month" | "90d" | "all";

export interface SpendingOverview {
  period: Period;
  from: string;
  to: string;
  total: number;
  count: number;
  avgPerDay: number;
  previousTotal: number | null;
  categories: { name: string; amount: number; share: number; count: number; previous: number | null }[];
  merchants: { name: string; amount: number; count: number; category: string; share: number }[];
}

export function spendingOverview(txns: Txn[], asOfDay: number, period: Period): SpendingOverview {
  const spend = txns.filter(isSpend);
  const first = spend.length ? Math.min(...spend.map((t) => t.day)) : asOfDay;
  let from = first, prevFrom: number | null = null, prevTo: number | null = null;
  if (period === "month") {
    const m = monthKey(asOfDay);
    from = toDay(m + "-01"); prevFrom = toDay(prevMonth(m) + "-01"); prevTo = from - 1;
  } else if (period === "90d") {
    from = asOfDay - 89; prevFrom = from - 90; prevTo = from - 1;
  }
  const inWin = spend.filter((t) => t.day >= from && t.day <= asOfDay);
  const prevWin = prevFrom == null ? null : spend.filter((t) => t.day >= prevFrom! && t.day <= prevTo!);

  const cats = new Map<string, { amount: number; count: number }>();
  const mers = new Map<string, { amount: number; count: number; cats: Map<string, number> }>();
  for (const t of inWin) {
    const c = cats.get(t.category) ?? cats.set(t.category, { amount: 0, count: 0 }).get(t.category)!;
    c.amount += -t.amount; c.count++;
    const name = merchantName(t.description);
    const m = mers.get(name) ?? mers.set(name, { amount: 0, count: 0, cats: new Map() }).get(name)!;
    m.amount += -t.amount; m.count++; m.cats.set(t.category, (m.cats.get(t.category) ?? 0) + 1);
  }
  const prevCats = new Map<string, number>();
  for (const t of prevWin ?? []) prevCats.set(t.category, (prevCats.get(t.category) ?? 0) - t.amount);
  const total = sum([...cats.values()].map((c) => c.amount));
  const days = Math.max(1, asOfDay - from + 1);
  return {
    period, from: fromDay(from), to: fromDay(asOfDay), total: round2(total), count: inWin.length,
    avgPerDay: round2(total / days), previousTotal: prevWin ? round2(sum([...prevCats.values()])) : null,
    categories: [...cats.entries()].sort((a, b) => b[1].amount - a[1].amount)
      .map(([name, v]) => ({ name, amount: round2(v.amount), share: total ? v.amount / total : 0, count: v.count, previous: prevWin ? round2(prevCats.get(name) ?? 0) : null })),
    merchants: [...mers.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 18)
      .map(([name, v]) => ({
        name, amount: round2(v.amount), count: v.count, share: total ? v.amount / total : 0,
        category: [...v.cats.entries()].sort((a, b) => b[1] - a[1])[0][0],
      })),
  };
}

export interface SpendingDetail {
  kind: "category" | "merchant";
  name: string;
  total: number;
  count: number;
  average: number;
  largest: { description: string; amount: number; date: string };
  share: number;
  firstDate: string;
  lastDate: string;
  thisMonth: number;
  lastMonth: number;
  months: { month: string; amount: number; count: number }[];
  weekday: { day: string; avg: number }[];
  breakdown: { name: string; amount: number; count: number; share: number }[];
  breakdownLabel: string;
  txns: { id: string; date: string; description: string; amount: number; category: string }[];
}

export function spendingDetail(txns: Txn[], kind: "category" | "merchant", name: string, asOfDay: number): SpendingDetail | null {
  const all = txns.filter(isSpend);
  const mine = all.filter((t) => (kind === "category" ? t.category === name : merchantName(t.description) === name));
  if (!mine.length) return null;
  const total = sum(mine.map((t) => -t.amount));
  const totalAll = sum(all.map((t) => -t.amount));
  const firstDay = Math.min(...mine.map((t) => t.day)), lastDay = Math.max(...mine.map((t) => t.day));
  const largest = [...mine].sort((a, b) => a.amount - b.amount)[0];

  const byMonth = new Map<string, { amount: number; count: number }>();
  for (const t of mine) {
    const m = byMonth.get(monthKey(t.day)) ?? byMonth.set(monthKey(t.day), { amount: 0, count: 0 }).get(monthKey(t.day))!;
    m.amount += -t.amount; m.count++;
  }
  const months: SpendingDetail["months"] = [];
  let cur = monthKey(firstDay);
  const endM = monthKey(asOfDay);
  for (let guard = 0; guard < 60; guard++) {
    const v = byMonth.get(cur);
    months.push({ month: cur, amount: round2(v?.amount ?? 0), count: v?.count ?? 0 });
    if (cur >= endM) break;
    const [y, m] = cur.split("-").map(Number);
    cur = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  }

  const wd = new Array(7).fill(0);
  for (const t of mine) wd[(t.day + 3) % 7] += -t.amount;
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => {
    let n = 0;
    for (let x = firstDay; x <= asOfDay; x++) if ((x + 3) % 7 === i) n++;
    return { day: d, avg: round2(n ? wd[i] / n : 0) };
  });

  const grp = new Map<string, { amount: number; count: number }>();
  for (const t of mine) {
    const key = kind === "category" ? merchantName(t.description) : t.category;
    const g = grp.get(key) ?? grp.set(key, { amount: 0, count: 0 }).get(key)!;
    g.amount += -t.amount; g.count++;
  }
  const curM = monthKey(asOfDay), prevM = prevMonth(curM);
  return {
    kind, name, total: round2(total), count: mine.length, average: round2(total / mine.length),
    largest: { description: largest.description, amount: largest.amount, date: fromDay(largest.day) },
    share: totalAll ? total / totalAll : 0, firstDate: fromDay(firstDay), lastDate: fromDay(lastDay),
    thisMonth: round2(byMonth.get(curM)?.amount ?? 0), lastMonth: round2(byMonth.get(prevM)?.amount ?? 0),
    months: months.slice(-12), weekday,
    breakdownLabel: kind === "category" ? "Shops and apps" : "Categories",
    breakdown: [...grp.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 12)
      .map(([n, v]) => ({ name: n, amount: round2(v.amount), count: v.count, share: total ? v.amount / total : 0 })),
    txns: [...mine].sort((a, b) => b.day - a.day).slice(0, 100)
      .map((t) => ({ id: t.id, date: fromDay(t.day), description: t.description, amount: t.amount, category: t.category })),
  };
}
