import type { Forecast, RecurringItem, Txn } from "./types";
import { round2, sum } from "./util";

export interface SpendLimit {
  category: string;
  avgMonthly: number;
  suggested: number;
  reason: string;
}

/** Personalized monthly limits: recent average per discretionary category, tightened as shortage risk rises. */
export function suggestLimits(txns: Txn[], recurring: RecurringItem[], f: Forecast): SpendLimit[] {
  const recIds = new Set(recurring.flatMap((r) => r.txnIds));
  const from = f.asOfDay - 89;
  const span = Math.max(30, Math.min(90, f.asOfDay - Math.min(...txns.map((t) => t.day), f.asOfDay) + 1));
  const by = new Map<string, number>();
  for (const t of txns)
    if (t.amount < 0 && !recIds.has(t.id) && t.day >= from && !["Rent", "Loan/EMI", "Transfers", "Investments"].includes(t.category))
      by.set(t.category, (by.get(t.category) ?? 0) + -t.amount);
  const risk = f.shortageProbability;
  const factor = risk < 0.1 ? 1 : risk < 0.3 ? 0.9 : risk < 0.6 ? 0.8 : 0.7;
  return [...by.entries()]
    .map(([category, total]) => {
      const avgMonthly = (total / span) * 30;
      return {
        category,
        avgMonthly: round2(avgMonthly),
        suggested: round2(avgMonthly * factor),
        reason:
          factor === 1
            ? `Shortage risk is low (${(risk * 100).toFixed(0)}%), so your recent average is a sustainable cap`
            : `Shortage risk is ${(risk * 100).toFixed(0)}% over the next ${f.horizon} days, so the cap is trimmed ${Math.round((1 - factor) * 100)}% below your recent average`,
      };
    })
    .sort((a, b) => b.avgMonthly - a.avgMonthly)
    .slice(0, 10);
}
export { sum };
