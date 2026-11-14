import { prisma } from "@finos/db";
import { applyPrefs, detectRecurring, toDay, type Flow, type Pref, type Txn } from "@finos/engine";

/**
 * Loads a user's data in engine form. "Now" is the last transaction date so historical CSVs forecast from where they end.
 * The user's answers (cancelling a subscription, an EMI ending, a planned purchase) are folded into `recurring` and `extraFlows`,
 * so every forecast, budget and simulation reflects them.
 */
export async function loadContext(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const rows = await prisma.transaction.findMany({ where: { userId }, orderBy: { date: "asc" } });
  const prefRows = await prisma.recurringPref.findMany({ where: { userId } });
  const plannedRows = await prisma.plannedItem.findMany({ where: { userId }, orderBy: { date: "asc" } });

  const txns: Txn[] = rows.map((r) => ({
    id: r.id,
    day: toDay(r.date.toISOString()),
    description: r.description,
    amount: r.amount,
    category: r.category,
  }));
  const asOfDay = txns.length ? Math.max(...txns.map((t) => t.day)) : toDay(new Date().toISOString());

  const prefs: Pref[] = prefRows.map((p) => ({
    key: p.key, decision: p.decision as Pref["decision"], name: p.name, amount: p.amount, cadenceDays: p.cadenceDays,
    lastDay: toDay(p.lastDate.toISOString()), category: p.category, newAmount: p.newAmount,
    endDay: p.endDate ? toDay(p.endDate.toISOString()) : null,
  }));
  const detected = detectRecurring(txns, asOfDay);
  const recurring = applyPrefs(detected, prefs, asOfDay, txns);

  const extraFlows: Flow[] = plannedRows
    .map((p) => ({ offset: toDay(p.date.toISOString()) - asOfDay, amount: p.amount, label: p.label }))
    .filter((f) => f.offset >= 1);

  return { user, txns, asOfDay, detected, recurring, prefs, planned: plannedRows, extraFlows, openingBalance: user.openingBalance };
}

/** How old the newest transaction is, relative to today. */
export function freshness(asOfDay: number, hasData: boolean) {
  if (!hasData) return { hasData: false, ageDays: null as number | null, level: "none" as const };
  const ageDays = Math.max(0, toDay(new Date().toISOString()) - asOfDay);
  return { hasData: true, ageDays, level: ageDays <= 7 ? ("fresh" as const) : ageDays <= 35 ? ("aging" as const) : ("stale" as const) };
}
