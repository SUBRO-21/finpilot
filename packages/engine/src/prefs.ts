import { normalizeKey } from "./recurring";
import type { RecurringItem, Txn } from "./types";
import { nextAfter } from "./util";

export type Decision = "CONTINUE" | "CHANGE" | "ENDS" | "STOP" | "ONEOFF";

export interface Pref {
  key: string;
  decision: Decision;
  name: string;
  amount: number; // signed snapshot
  cadenceDays: number;
  lastDay: number;
  category: string;
  newAmount?: number | null;
  endDay?: number | null;
  payType?: string | null;
}

export const keyOf = (t: { description: string; amount: number }) => (t.amount < 0 ? "-" : "+") + normalizeKey(t.description);

const rollNext = (lastDay: number, cadence: number, asOfDay: number) => nextAfter(lastDay, cadence, asOfDay);

/**
 * Merges the user's answers into detected recurring items:
 *  STOP -> kept (so past payments are not mistaken for variable spend) but flagged, never projected
 *  CHANGE -> projected at the new amount
 *  ENDS -> projected until the last payment the user named
 *  CONTINUE on something not yet detected (e.g. seen once) -> becomes a confirmed recurring item
 */
export function applyPrefs(detected: RecurringItem[], prefs: Pref[], asOfDay: number, txns: Txn[]): RecurringItem[] {
  const byKey = new Map(prefs.map((p) => [p.key, p]));
  const out: RecurringItem[] = [];
  const seen = new Set<string>();
  for (const r of detected) {
    seen.add(r.key);
    const p = byKey.get(r.key);
    if (!p) { out.push({ ...r, source: "detected" }); continue; }
    const sign = r.amount < 0 ? -1 : 1;
    const base = { ...r, payType: p.payType ?? undefined };
    if (p.decision === "STOP") out.push({ ...base, stopped: true, pref: "STOP", userConfirmed: true });
    else if (p.decision === "CHANGE" && p.newAmount) out.push({ ...base, amount: sign * Math.abs(p.newAmount), pref: "CHANGE", userConfirmed: true });
    else if (p.decision === "ENDS") out.push({ ...base, endDay: p.endDay ?? undefined, pref: "ENDS", userConfirmed: true });
    else out.push({ ...base, pref: p.decision, userConfirmed: true });
  }
  for (const p of prefs) {
    if (seen.has(p.key) || !["CONTINUE", "CHANGE", "ENDS", "STOP"].includes(p.decision)) continue;
    const sign = p.amount < 0 ? -1 : 1;
    const amount = p.decision === "CHANGE" && p.newAmount ? sign * Math.abs(p.newAmount) : p.amount;
    const nextDay = rollNext(p.lastDay, p.cadenceDays, asOfDay);
    const txnIds = txns.filter((t) => keyOf(t) === p.key).map((t) => t.id);
    out.push({
      key: p.key, name: p.name, amount, cadenceDays: p.cadenceDays,
      cadenceLabel: p.cadenceDays <= 8 ? "weekly" : p.cadenceDays <= 16 ? "fortnightly" : p.cadenceDays <= 40 ? "monthly" : p.cadenceDays <= 120 ? "quarterly" : "yearly",
      lastDay: p.lastDay, nextDay, confidence: 0.9, occurrences: txnIds.length, txnIds, category: p.category,
      endDay: p.decision === "ENDS" ? p.endDay ?? undefined : undefined, pref: p.decision, userConfirmed: true,
      stopped: p.decision === "STOP" || undefined, payType: p.payType ?? undefined,
    });
  }
  return out.sort((a, b) => a.nextDay - b.nextDay);
}

const CATS = new Set(["Rent", "Loan/EMI", "Subscriptions", "Insurance", "Household", "Education"]);
const HINT = /\b(emi|loan|sip|insurance|premium|rent|installment|instalment|subscription|netflix|spotify|prime|recharge|broadband|postpaid|fastag|school|tuition|maid|maintenance)\b/i;
const INCOME_HINT = /salary|payroll|stipend|pension|\brent\b|tenant|client|invoice|retainer/i;
/** Moving money between your own accounts or cards: never a bill to ask about. */
const OWN_MONEY = /\bself\b|own account|credit card|card payment|wallet|paytm add|sweep|\bfd\b|fixed deposit|\bppf\b/i;
/** Payments to or from a person's own bank account (rent to a landlord, a maid, a tenant paying you) under this size are ignored. */
export const PERSON_MIN = 2000;
const PERSON_CATS = new Set(["Transfers", "People"]);

/**
 * Payments in the last ~45 days that look like they could repeat but have not repeated three times yet
 * (typical when someone has only uploaded a month or two). We ask the user rather than guess.
 * Sizeable payments to or from a person count too: landlords, tenants and household staff often use
 * personal accounts, so the bank text says only a name and we must ask what the payment is.
 */
export function candidateRecurring(txns: Txn[], asOfDay: number, detected: RecurringItem[]): RecurringItem[] {
  const used = new Set(detected.flatMap((r) => r.txnIds));
  const latest = new Map<string, Txn>();
  const ids = new Map<string, string[]>();
  for (const t of txns) {
    if (t.day > asOfDay || t.day < asOfDay - 44 || used.has(t.id)) continue;
    if (["Refund", "Investments", "Cash", "Credit card"].includes(t.category) || Math.abs(t.amount) < 50 || OWN_MONEY.test(t.description)) continue;
    const toPerson = PERSON_CATS.has(t.category) && Math.abs(t.amount) >= PERSON_MIN;
    if (!toPerson && PERSON_CATS.has(t.category)) continue;
    const ok = toPerson || (t.amount > 0 ? INCOME_HINT.test(t.description) : CATS.has(t.category) || HINT.test(t.description));
    if (!ok) continue;
    const k = keyOf(t);
    (ids.get(k) ?? ids.set(k, []).get(k)!).push(t.id);
    const cur = latest.get(k);
    if (!cur || t.day > cur.day) latest.set(k, t);
  }
  return [...latest.entries()]
    .sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount))
    .slice(0, 12)
    .map(([key, t]) => ({
      key, name: t.description, amount: t.amount, cadenceDays: 30, cadenceLabel: "monthly", lastDay: t.day,
      nextDay: rollNext(t.day, 30, asOfDay), confidence: 0.4, occurrences: ids.get(key)!.length, txnIds: ids.get(key)!,
      category: t.category, source: "candidate" as const,
    }));
}
