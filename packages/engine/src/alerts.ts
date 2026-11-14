import { merchantName } from "./insights";
import type { RecurringItem, Txn } from "./types";
import { fromDay, median, round2 } from "./util";

export interface PriceHike {
  key: string;
  name: string;
  from: number; // usual amount before (positive rupees)
  to: number; // latest amount
  changePct: number;
  extraPerYear: number;
  since: string; // date of the first higher payment
}

export interface SubscriptionCheck {
  key: string;
  name: string;
  amount: number; // positive rupees per payment
  cadenceLabel: string;
  perYear: number;
  group: string | null; // e.g. "Video streaming" when it overlaps with another one
  lastDate: string;
}

export interface SubscriptionOverlap { group: string; names: string[]; perYear: number }

/** Services that do the same job: paying for two of them is often a forgotten subscription. */
const GROUPS: [string, RegExp][] = [
  ["Video streaming", /netflix|prime video|amazon prime|hotstar|disney|sonyliv|zee5|jiocinema|youtube premium|apple tv/i],
  ["Music", /spotify|apple music|gaana|wynk|jiosaavn|youtube music/i],
  ["Cloud storage", /icloud|google one|dropbox|onedrive/i],
  ["AI tools", /chatgpt|openai|claude|anthropic|gemini|copilot|perplexity/i],
  ["Food delivery membership", /swiggy one|zomato gold|zomato pro/i],
];
const groupOf = (name: string) => GROUPS.find(([, re]) => re.test(name))?.[0] ?? null;

/**
 * A repeating payment whose latest amount is clearly above its usual amount (at least 5% and ₹10 more):
 * a subscription price rise, a bigger EMI, a higher premium. Only rises within the last 3 cycles are reported.
 */
export function priceHikes(recurring: RecurringItem[], txns: Txn[], asOfDay: number): PriceHike[] {
  const byId = new Map(txns.map((t) => [t.id, t]));
  const out: PriceHike[] = [];
  for (const r of recurring) {
    if (r.stopped || r.amount >= 0) continue;
    const ts = r.txnIds.map((id) => byId.get(id)).filter((t): t is Txn => !!t).sort((a, b) => a.day - b.day);
    if (ts.length < 2) continue;
    const last = ts[ts.length - 1];
    if (asOfDay - last.day > r.cadenceDays * 2) continue;
    // The usual price is the median of payments before the change; walk back over payments already at the new price
    const to = Math.abs(last.amount);
    let i = ts.length - 1;
    while (i > 0 && Math.abs(ts[i - 1].amount) >= to * 0.98) i--;
    if (i === 0) continue; // always paid this much
    if (asOfDay - ts[i].day > r.cadenceDays * 3) continue; // an old rise is just the price now
    const before = ts.slice(0, i).map((t) => Math.abs(t.amount));
    const from = median(before);
    // Only fixed-price payments (rent, a plan, an EMI) can have a "price rise"; a bill that varies every
    // month (electricity, medicines) just had a bigger month
    if (before.length < 2 || before.some((a) => Math.abs(a - from) > from * 0.03)) continue;
    if (to < from * 1.05 || to - from < 10) continue;
    out.push({
      key: r.key, name: merchantName(r.name), from: round2(from), to: round2(to), changePct: round2((to - from) / from),
      extraPerYear: Math.round(((to - from) * 365) / r.cadenceDays), since: fromDay(ts[i].day),
    });
  }
  return out.sort((a, b) => b.extraPerYear - a.extraPerYear);
}

/**
 * Subscriptions the user has not confirmed they still use, biggest yearly cost first, plus groups of
 * services that overlap. A bank statement cannot show whether a service is used, so we ask.
 */
export function subscriptionReview(recurring: RecurringItem[], hikes: PriceHike[] = []): { toReview: SubscriptionCheck[]; overlaps: SubscriptionOverlap[] } {
  // A subscription that just went up costs its new price from now on
  const latest = new Map(hikes.map((h) => [h.key, h.to]));
  const perYear = (r: RecurringItem) => ((latest.get(r.key) ?? Math.abs(r.amount)) * 365) / r.cadenceDays;
  const subs = recurring.filter((r) => !r.stopped && r.amount < 0 && (r.category === "Subscriptions" || groupOf(r.name)));
  const byGroup = new Map<string, RecurringItem[]>();
  for (const r of subs) {
    const g = groupOf(r.name);
    if (g) (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(r);
  }
  const overlapping = new Map<string, string>();
  const overlaps: SubscriptionOverlap[] = [];
  for (const [group, list] of byGroup) {
    if (list.length < 2) continue;
    list.forEach((r) => overlapping.set(r.key, group));
    overlaps.push({ group, names: list.map((r) => merchantName(r.name)), perYear: Math.round(list.reduce((a, r) => a + perYear(r), 0)) });
  }
  const toReview = subs
    .filter((r) => !r.userConfirmed) // once the user answers, stop asking
    .map((r) => ({
      key: r.key, name: merchantName(r.name), amount: latest.get(r.key) ?? Math.abs(r.amount), cadenceLabel: r.cadenceLabel, perYear: Math.round(perYear(r)),
      group: overlapping.get(r.key) ?? null, lastDate: fromDay(r.lastDay),
    }))
    .sort((a, b) => Number(!!b.group) - Number(!!a.group) || b.perYear - a.perYear);
  return { toReview, overlaps };
}
