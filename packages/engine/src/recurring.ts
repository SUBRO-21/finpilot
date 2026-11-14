import type { RecurringItem, Txn } from "./types";
import { mean, median, nextAfter, std } from "./util";

const CADENCES: [number, string][] = [[7, "weekly"], [14, "fortnightly"], [30, "monthly"], [91, "quarterly"], [365, "yearly"]];

export const normalizeKey = (d: string) =>
  d.toLowerCase().replace(/[0-9]+/g, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Groups transactions by normalized description, then accepts a group as recurring when
 * its inter-arrival gaps cluster tightly around a known cadence and amounts are stable.
 * Items whose last occurrence is older than 2 cadences are treated as cancelled.
 */
export function detectRecurring(txns: Txn[], asOfDay: number): RecurringItem[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.day > asOfDay) continue;
    const key = (t.amount < 0 ? "-" : "+") + normalizeKey(t.description);
    if (key.length < 3) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  const out: RecurringItem[] = [];
  for (const [key, g] of groups) {
    if (g.length < 3) continue;
    g.sort((a, b) => a.day - b.day);
    const gaps = g.slice(1).map((t, i) => t.day - g[i].day).filter((x) => x > 0);
    if (gaps.length < 2) continue;
    const med = median(gaps);
    const [cad, label] = CADENCES.reduce((best, c) => (Math.abs(c[0] - med) < Math.abs(best[0] - med) ? c : best));
    if (Math.abs(med - cad) / cad > 0.2) continue;
    const gapCv = std(gaps) / (mean(gaps) || 1);
    if (gapCv > 0.25) continue;
    const amts = g.map((t) => t.amount);
    const amtMed = median(amts);
    const amtCv = std(amts.map(Math.abs)) / (Math.abs(mean(amts)) || 1);
    if (amtCv > 0.35) continue;
    const lastDay = g[g.length - 1].day;
    if (asOfDay - lastDay > cad * 2) continue;
    const nextDay = nextAfter(lastDay, cad, asOfDay);
    const confidence = Math.max(0.05, Math.min(0.99, (1 - gapCv) * (1 - amtCv) * Math.min(1, g.length / 6)));
    out.push({
      key, name: g[g.length - 1].description, amount: amtMed, cadenceDays: cad, cadenceLabel: label,
      lastDay, nextDay, confidence, occurrences: g.length, txnIds: g.map((t) => t.id), category: g[g.length - 1].category,
    });
  }
  return out.sort((a, b) => a.nextDay - b.nextDay);
}
