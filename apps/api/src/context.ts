import { prisma } from "@finos/db";
import { detectRecurring, toDay, type Txn } from "@finos/engine";

/** Loads a user's data in engine form. "Now" is the last transaction date so historical CSVs forecast from where they end. */
export async function loadContext(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const rows = await prisma.transaction.findMany({ where: { userId }, orderBy: { date: "asc" } });
  const txns: Txn[] = rows.map((r) => ({
    id: r.id,
    day: toDay(r.date.toISOString()),
    description: r.description,
    amount: r.amount,
    category: r.category,
    isMerchant: r.isMerchant,
  }));
  const asOfDay = txns.length ? Math.max(...txns.map((t) => t.day)) : toDay(new Date().toISOString());
  const recurring = detectRecurring(txns, asOfDay);
  return { user, txns, asOfDay, recurring, openingBalance: user.openingBalance };
}
