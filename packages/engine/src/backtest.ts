import { balanceAt, forecast } from "./forecast";
import type { Txn } from "./types";
import { fromDay, mean, round2 } from "./util";

export interface BacktestFold {
  cutoff: string;
  horizon: number;
  mae: number;
  wape: number; // sum|err| / sum|actual|
  coverage: number; // share of days actual balance fell inside the p10-p90 band
  predictedShortage: number;
  actualShortage: boolean;
}

export interface BacktestResult {
  folds: BacktestFold[];
  mae: number;
  wape: number;
  coverage: number; // calibration: ideal ~0.80 for a p10-p90 band
  verdict: string;
}

/** Rolling-origin evaluation: forecast from past cutoffs using only data available then, score against what happened. */
export function backtest(txns: Txn[], openingBalance: number, horizon = 14, folds = 4, opts: { lookbackDays?: number; halfLifeDays?: number | null } = {}): BacktestResult {
  if (!txns.length) return { folds: [], mae: 0, wape: 0, coverage: 0, verdict: "No data" };
  const first = Math.min(...txns.map((t) => t.day));
  const last = Math.max(...txns.map((t) => t.day));
  const out: BacktestFold[] = [];
  for (let k = folds; k >= 1; k--) {
    const cutoff = last - k * horizon;
    if (cutoff - first < 45) continue; // need enough training history
    const past = txns.filter((t) => t.day <= cutoff);
    const f = forecast({ txns: past, openingBalance, asOfDay: cutoff, horizon, paths: 300, seed: 7, ...opts });
    const errs: number[] = [];
    const actuals: number[] = [];
    let inside = 0;
    let actualShortage = false;
    for (const p of f.points) {
      const actual = balanceAt(txns, openingBalance, p.day);
      errs.push(Math.abs(actual - p.p50));
      actuals.push(Math.abs(actual));
      if (actual >= p.p10 && actual <= p.p90) inside++;
      if (actual < 0) actualShortage = true;
    }
    out.push({
      cutoff: fromDay(cutoff), horizon,
      mae: round2(mean(errs)),
      wape: round2(errs.reduce((a, b) => a + b, 0) / Math.max(1, actuals.reduce((a, b) => a + b, 0))),
      coverage: round2(inside / f.points.length),
      predictedShortage: round2(f.shortageProbability),
      actualShortage,
    });
  }
  if (!out.length) return { folds: [], mae: 0, wape: 0, coverage: 0, verdict: "Not enough history (need 45+ days before a cutoff) to backtest" };
  const mae = round2(mean(out.map((f) => f.mae)));
  const wape = round2(mean(out.map((f) => f.wape)));
  const coverage = round2(mean(out.map((f) => f.coverage)));
  const verdict =
    coverage >= 0.7 && wape < 0.15
      ? "Forecast is well calibrated and accurate on past data"
      : coverage < 0.5
        ? "Bands are too narrow: treat forecasts as optimistic"
        : "Reasonable accuracy; expect misses on irregular income or one-off spending";
  return { folds: out, mae, wape, coverage, verdict };
}
