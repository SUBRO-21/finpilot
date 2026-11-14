import type { Txn } from "./types";
import { fromDay, round2, sum } from "./util";

export interface GoalInput {
  id: string;
  label: string;
  target: number; // rupees
  saved: number; // already put aside
  targetDay: number;
}

export type GoalStatus = "DONE" | "ON_TRACK" | "STRETCH" | "OFF_TRACK" | "PAST_DUE";

export interface GoalPlan {
  id: string;
  label: string;
  target: number;
  saved: number;
  remaining: number;
  progress: number; // 0..1
  targetDate: string;
  monthsLeft: number;
  monthlyNeeded: number; // to finish on time
  availablePerMonth: number; // savings left for this goal after earlier goals
  status: GoalStatus;
  reachDate: string | null; // when it would be reached at the current pace
  reasons: string[];
}

const DAYS_PER_MONTH = 30.44;
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/**
 * How much the balance actually grows per month: everything in minus everything out over the last
 * 90 days, ignoring moves between your own accounts. SIPs and EMIs count as money out, because
 * that cash is not available for a goal.
 */
export function monthlySavingsPace(txns: Txn[], asOfDay: number, windowDays = 90) {
  const from = asOfDay - windowDays + 1;
  const inWin = txns.filter((t) => t.day >= from && t.day <= asOfDay && t.category !== "Transfers");
  if (!inWin.length) return { perMonth: 0, days: 0 };
  const firstDay = Math.min(...inWin.map((t) => t.day));
  const days = Math.max(30, asOfDay - firstDay + 1); // less than a month of data is treated as one month
  return { perMonth: round2((sum(inWin.map((t) => t.amount)) / days) * DAYS_PER_MONTH), days };
}

/**
 * Checks each goal against the user's real savings pace. Goals are funded in date order: an earlier
 * goal uses up savings first, so later goals see only what is left. A goal that fits the pace but
 * would push the bad-case balance below zero is marked a stretch.
 */
export function planGoals(goals: GoalInput[], o: { txns: Txn[]; asOfDay: number; worstCaseMin: number }): { pace: number; paceDays: number; goals: GoalPlan[] } {
  const { perMonth: pace, days: paceDays } = monthlySavingsPace(o.txns, o.asOfDay);
  let available = Math.max(0, pace);
  let cushion = o.worstCaseMin; // bad-case low point of the 60-day forecast
  const out: GoalPlan[] = [];

  for (const g of [...goals].sort((a, b) => a.targetDay - b.targetDay)) {
    const remaining = Math.max(0, g.target - g.saved);
    const monthsLeft = round2((g.targetDay - o.asOfDay) / DAYS_PER_MONTH);
    const base = {
      id: g.id, label: g.label, target: g.target, saved: g.saved, remaining,
      progress: g.target > 0 ? Math.min(1, g.saved / g.target) : 0, targetDate: fromDay(g.targetDay), monthsLeft,
    };
    const reachAt = (perMonth: number) => (perMonth > 0 ? fromDay(o.asOfDay + Math.ceil((remaining / perMonth) * DAYS_PER_MONTH)) : null);

    if (remaining <= 0) {
      out.push({ ...base, monthlyNeeded: 0, availablePerMonth: available, status: "DONE", reachDate: null, reasons: ["You have already saved the full amount."] });
      continue;
    }
    if (monthsLeft <= 0) {
      out.push({
        ...base, monthlyNeeded: remaining, availablePerMonth: available, status: "PAST_DUE", reachDate: reachAt(available),
        reasons: [`The date has passed with ${inr(remaining)} still to go.`, available > 0 ? `At your current pace you would get there around ${reachAt(available)}.` : "Pick a new date to get a monthly plan."],
      });
      continue;
    }

    const monthlyNeeded = round2(remaining / Math.max(monthsLeft, 0.5));
    const reasons: string[] = [];
    reasons.push(`${inr(remaining)} to go in ${monthsLeft < 1 ? "under a month" : `${monthsLeft.toFixed(1)} months`}: about ${inr(monthlyNeeded)} a month.`);
    if (pace <= 0) reasons.push(`Over the last ${paceDays} days your balance shrank by about ${inr(-pace)} a month, so there is nothing left over to save yet.`);
    else if (available < pace) reasons.push(`You save about ${inr(pace)} a month; ${inr(pace - available)} of that is already planned for earlier goals, leaving ${inr(available)}.`);
    else reasons.push(`You save about ${inr(pace)} a month (money in minus money out over the last ${paceDays} days).`);

    let status: GoalStatus;
    if (available >= monthlyNeeded) status = "ON_TRACK";
    else if (available >= monthlyNeeded * 0.6) status = "STRETCH";
    else status = "OFF_TRACK";

    // Putting money aside lowers the balance the forecast expects; check the next two months stay safe
    const setAside = monthlyNeeded * Math.min(2, monthsLeft);
    if (status === "ON_TRACK" && cushion - setAside < 0) {
      status = "STRETCH";
      reasons.push(`Setting this aside could leave your bad-case balance below zero in the next two months. Keep a buffer first.`);
    }
    cushion -= setAside;

    if (status === "STRETCH" && available < monthlyNeeded) reasons.push(`You are short by about ${inr(monthlyNeeded - available)} a month. Trimming spending a little would close the gap.`);
    if (status === "OFF_TRACK") {
      const when = reachAt(available);
      reasons.push(when ? `At your current pace you would reach it around ${when}. Push the date out, lower the target, or cut about ${inr(monthlyNeeded - available)} of spending a month.` : "Lower the target or push the date out, then cut spending to free up money each month.");
    }

    out.push({ ...base, monthlyNeeded, availablePerMonth: round2(available), status, reachDate: reachAt(available), reasons });
    available = Math.max(0, available - monthlyNeeded);
  }
  return { pace, paceDays, goals: out };
}
