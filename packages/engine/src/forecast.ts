import { detectRecurring } from "./recurring";
import type { Flow, Forecast, RecurringItem, Txn } from "./types";
import { fromDay, median, quantile, rng, sum } from "./util";

export interface ForecastInput {
  txns: Txn[];
  openingBalance: number;
  asOfDay: number;
  horizon: number;
  recurring?: RecurringItem[];
  extraFlows?: Flow[];
  paths?: number;
  seed?: number;
}

export function balanceAt(txns: Txn[], openingBalance: number, day: number) {
  return openingBalance + sum(txns.filter((t) => t.day <= day).map((t) => t.amount));
}

/**
 * Monte Carlo cash-flow forecast.
 *  - Known flows: detected recurring payments/income land on their projected dates (deterministic).
 *  - Unknown flows: non-recurring daily spend is bootstrapped from the last 90 days; irregular income
 *    arrives as a Poisson-like process with amounts bootstrapped from past irregular inflows.
 * Output is a p10/p50/p90 band per day, plus the probability of the balance going negative.
 */
export function forecast(o: ForecastInput): Forecast {
  const { txns, openingBalance, asOfDay, horizon, extraFlows = [], paths = 500, seed = 42 } = o;
  const hist = txns.filter((t) => t.day <= asOfDay);
  const recurring = o.recurring ?? detectRecurring(hist, asOfDay);
  const startBalance = balanceAt(hist, openingBalance, asOfDay);
  const firstDay = hist.length ? Math.min(...hist.map((t) => t.day)) : asOfDay;
  const historyDays = asOfDay - firstDay + 1;
  const win = Math.max(1, Math.min(90, historyDays));
  const winStart = asOfDay - win + 1;

  const recIds = new Set(recurring.flatMap((r) => r.txnIds));
  const variable = hist.filter((t) => !recIds.has(t.id) && t.day >= winStart);
  const dailyExp = new Array<number>(win).fill(0);
  for (const t of variable) if (t.amount < 0) dailyExp[t.day - winStart] += -t.amount;
  const incomeEvents = variable.filter((t) => t.amount > 0).map((t) => t.amount);
  const incomeRate = incomeEvents.length / win;

  const det = new Float64Array(horizon + 1);
  for (const r of recurring)
    for (let d = r.nextDay; d <= asOfDay + horizon; d += r.cadenceDays) if (d > asOfDay) det[d - asOfDay] += r.amount;
  for (const f of extraFlows) if (f.offset >= 1 && f.offset <= horizon) det[f.offset] += f.amount;

  const rand = rng(seed);
  const cols: number[][] = Array.from({ length: horizon + 1 }, () => []);
  let shortage = 0;
  const firstNeg: number[] = [];
  const mins: number[] = [];
  for (let p = 0; p < paths; p++) {
    let bal = startBalance;
    let min = bal;
    let neg = -1;
    for (let d = 1; d <= horizon; d++) {
      bal += det[d];
      bal -= dailyExp[Math.floor(rand() * win)];
      if (incomeEvents.length && rand() < incomeRate) bal += incomeEvents[Math.floor(rand() * incomeEvents.length)];
      cols[d].push(bal);
      if (bal < min) min = bal;
      if (bal < 0 && neg < 0) neg = d;
    }
    mins.push(min);
    if (neg > 0) { shortage++; firstNeg.push(neg); }
  }

  const points = cols.slice(1).map((c, i) => {
    const s = c.sort((a, b) => a - b);
    return { day: asOfDay + i + 1, date: fromDay(asOfDay + i + 1), p10: quantile(s, 0.1), p50: quantile(s, 0.5), p90: quantile(s, 0.9) };
  });
  const last = points[points.length - 1];
  const spread = last ? (last.p90 - last.p10) / (Math.abs(last.p50) + Math.abs(startBalance) + 1) : 0;
  const reasons: string[] = [];
  let level: Forecast["uncertainty"] = spread < 0.25 ? "LOW" : spread < 0.6 ? "MEDIUM" : "HIGH";
  if (historyDays < 45) { level = "HIGH"; reasons.push(`Only ${historyDays} days of history; patterns are not yet reliable`); }
  if (variable.length < 10) reasons.push("Few non-recurring transactions to learn spending variability from");
  if (!recurring.length) reasons.push("No recurring payments detected, so the forecast relies entirely on random spending");
  if (spread >= 0.6) reasons.push("Wide p10-p90 band: irregular income or lumpy spending");
  mins.sort((a, b) => a - b);

  return {
    asOfDay, asOfDate: fromDay(asOfDay), startBalance, horizon, points,
    shortageProbability: shortage / paths,
    expectedShortageDate: firstNeg.length ? fromDay(asOfDay + Math.round(median(firstNeg))) : null,
    worstCaseMin: quantile(mins, 0.1),
    uncertainty: level, uncertaintyReasons: reasons,
    assumptions: [
      `${recurring.length} recurring items are projected on their expected dates`,
      `Variable spending is resampled from the last ${win} days (avg ${(sum(dailyExp) / win).toFixed(0)}/day)`,
      `${paths} simulated paths; band shows 10th-90th percentile`,
    ],
    recurringUsed: recurring.length,
  };
}
