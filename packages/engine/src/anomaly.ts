import type { Anomaly, Txn } from "./types";
import { median, round2 } from "./util";

/**
 * Outlier detection per category on a log scale. Spending is heavy-tailed (many small payments, a few large ones),
 * so comparing raw amounts flags every big-but-normal payment. Log amounts compare "how many times larger than usual".
 * A payment must also be at least 3x the category's typical amount and ₹500.
 */
export function detectAnomalies(txns: Txn[], threshold = 3.5): Anomaly[] {
  const byCat = new Map<string, Txn[]>();
  for (const t of txns) if (t.amount < 0 && !["Transfers", "Investments"].includes(t.category)) (byCat.get(t.category) ?? byCat.set(t.category, []).get(t.category)!).push(t);
  const out: Anomaly[] = [];
  for (const [cat, list] of byCat) {
    if (list.length < 8 || ["Rent", "Loan/EMI", "Credit card"].includes(cat)) continue;
    const logs = list.map((t) => Math.log(Math.abs(t.amount)));
    const med = median(logs);
    const mad = Math.max(median(logs.map((v) => Math.abs(v - med))), 0.35);
    const typical = Math.exp(med);
    for (const t of list) {
      const z = (0.6745 * (Math.log(Math.abs(t.amount)) - med)) / mad;
      if (z > threshold && Math.abs(t.amount) >= typical * 3 && Math.abs(t.amount) >= 500)
        out.push({
          txnId: t.id, score: round2(z), category: cat, amount: t.amount, typical: round2(typical),
          reason: `${Math.abs(t.amount).toFixed(0)} is ${(Math.abs(t.amount) / typical).toFixed(1)}x your typical ${cat} payment (${typical.toFixed(0)})`,
        });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
