import type { Anomaly, Txn } from "./types";
import { median, round2 } from "./util";

/** Robust per-category outlier detection (modified z-score using median/MAD). */
export function detectAnomalies(txns: Txn[], threshold = 3.5): Anomaly[] {
  const byCat = new Map<string, Txn[]>();
  for (const t of txns) if (t.amount < 0) (byCat.get(t.category) ?? byCat.set(t.category, []).get(t.category)!).push(t);
  const out: Anomaly[] = [];
  for (const [cat, list] of byCat) {
    if (list.length < 6 || ["Rent", "Loan/EMI"].includes(cat)) continue;
    const vals = list.map((t) => Math.abs(t.amount));
    const med = median(vals);
    const mad = Math.max(median(vals.map((v) => Math.abs(v - med))), med * 0.1, 1);
    for (const t of list) {
      const z = (0.6745 * (Math.abs(t.amount) - med)) / mad;
      if (z > threshold && Math.abs(t.amount) > med * 1.5)
        out.push({
          txnId: t.id, score: round2(z), category: cat, amount: t.amount, typical: round2(med),
          reason: `${Math.abs(t.amount).toFixed(0)} is ${(Math.abs(t.amount) / med).toFixed(1)}x your typical ${cat} payment (${med.toFixed(0)})`,
        });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
