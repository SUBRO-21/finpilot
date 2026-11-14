import { balanceAt, DEFAULT_LOOKBACK, forecast } from "./forecast";
import type { Txn } from "./types";
import { mean, round2 } from "./util";

/**
 * How much past everyday spending should the forecast learn from?
 * Short windows react quickly when habits change (a raise, a move) but see few examples of rare big
 * expenses; long windows see more examples but keep repeating old habits. Rather than fix one answer,
 * we test several on the user's own history and pick the one that would have forecast best.
 */
export interface LookbackOption { key: string; label: string; lookbackDays: number; halfLifeDays: number | null }

const ALL = 3650; // "all history"
export const LOOKBACK_OPTIONS: LookbackOption[] = [
  { key: "30", label: "Last 30 days", lookbackDays: 30, halfLifeDays: null },
  { key: "60", label: "Last 60 days", lookbackDays: 60, halfLifeDays: null },
  { key: "90", label: "Last 90 days", lookbackDays: 90, halfLifeDays: null },
  { key: "180", label: "Last 180 days", lookbackDays: 180, halfLifeDays: null },
  { key: "365", label: "Last 365 days", lookbackDays: 365, halfLifeDays: null },
  { key: "all-hl60", label: "All history, recent weighted (half-life 60 days)", lookbackDays: ALL, halfLifeDays: 60 },
  { key: "all-hl120", label: "All history, recent weighted (half-life 120 days)", lookbackDays: ALL, halfLifeDays: 120 },
];
export const DEFAULT_OPTION = LOOKBACK_OPTIONS.find((o) => o.lookbackDays === DEFAULT_LOOKBACK && !o.halfLifeDays)!;

export interface LookbackScore {
  key: string;
  label: string;
  lookbackDays: number;
  halfLifeDays: number | null;
  loss: number; // quantile loss relative to the balance (lower is better)
  mae: number; // average miss of the middle estimate, rupees
  coverage: number; // share of days the real balance was inside the 10th-90th percentile range (ideal ~0.8)
}

export interface LookbackComparison {
  folds: number;
  horizon: number;
  scores: LookbackScore[]; // best first
  chosen: LookbackOption;
  reason: string;
}

/** Pinball loss: penalises a q-quantile forecast for landing on the wrong side of the truth, weighted by q. */
const pinball = (actual: number, pred: number, q: number) => (actual >= pred ? q * (actual - pred) : (1 - q) * (pred - actual));

/** Need at least this much history before a cutoff to forecast from it, and this many cutoffs to trust a comparison. */
const MIN_TRAIN_DAYS = 60;
const MIN_FOLDS = 4;
const MIN_GAIN = 0.05; // switch away from the default only for a clear (5%+) improvement

export function compareLookbacks(txns: Txn[], openingBalance: number, opts: { horizon?: number; step?: number; maxFolds?: number; paths?: number } = {}): LookbackComparison {
  const horizon = opts.horizon ?? 30, step = opts.step ?? 14, maxFolds = opts.maxFolds ?? 12, paths = opts.paths ?? 200;
  const none = (reason: string): LookbackComparison => ({ folds: 0, horizon, scores: [], chosen: DEFAULT_OPTION, reason });
  if (!txns.length) return none("No data yet");
  const first = Math.min(...txns.map((t) => t.day));
  const last = Math.max(...txns.map((t) => t.day));

  // Rolling origins: forecast from several past dates using only what was known then
  const cutoffs: number[] = [];
  for (let c = last - horizon; c - first >= MIN_TRAIN_DAYS && cutoffs.length < maxFolds; c -= step) cutoffs.push(c);
  if (cutoffs.length < MIN_FOLDS)
    return none(`Needs about ${MIN_TRAIN_DAYS + horizon + (MIN_FOLDS - 1) * step} days of history to compare; using the last ${DEFAULT_LOOKBACK} days for now`);

  const pastAt = new Map(cutoffs.map((c) => [c, txns.filter((t) => t.day <= c)]));
  const actualAt = new Map<number, number>();
  for (const c of cutoffs) for (let d = c + 1; d <= c + horizon; d++) if (!actualAt.has(d)) actualAt.set(d, balanceAt(txns, openingBalance, d));

  const scores: LookbackScore[] = LOOKBACK_OPTIONS.map((o) => {
    const losses: number[] = [], maes: number[] = [], covs: number[] = [];
    for (const c of cutoffs) {
      const f = forecast({ txns: pastAt.get(c)!, openingBalance, asOfDay: c, horizon, paths, seed: 7, lookbackDays: o.lookbackDays, halfLifeDays: o.halfLifeDays });
      let loss = 0, abs = 0, scale = 0, inside = 0;
      for (const p of f.points) {
        const a = actualAt.get(p.day)!;
        loss += (pinball(a, p.p10, 0.1) + pinball(a, p.p50, 0.5) + pinball(a, p.p90, 0.9)) / 3;
        abs += Math.abs(a - p.p50);
        scale += Math.abs(a);
        if (a >= p.p10 && a <= p.p90) inside++;
      }
      losses.push(loss / Math.max(1, scale));
      maes.push(abs / f.points.length);
      covs.push(inside / f.points.length);
    }
    return { key: o.key, label: o.label, lookbackDays: o.lookbackDays, halfLifeDays: o.halfLifeDays, loss: round2(mean(losses) * 1000) / 1000, mae: round2(mean(maes)), coverage: round2(mean(covs)) };
  }).sort((a, b) => a.loss - b.loss);

  const best = scores[0];
  const def = scores.find((s) => s.key === DEFAULT_OPTION.key)!;
  const gain = def.loss > 0 ? (def.loss - best.loss) / def.loss : 0;
  const useBest = best.key !== def.key && gain >= MIN_GAIN;
  const chosen = LOOKBACK_OPTIONS.find((o) => o.key === (useBest ? best.key : def.key))!;
  const reason = useBest
    ? `${best.label} forecast your past ${cutoffs.length} test periods ${Math.round(gain * 100)}% better than the last 90 days, so it is used`
    : best.key === def.key
      ? `The last 90 days forecast your past ${cutoffs.length} test periods best`
      : `No option beat the last 90 days by a clear margin (best: ${best.label}, ${Math.round(gain * 100)}% better), so the default is kept`;
  return { folds: cutoffs.length, horizon, scores, chosen, reason };
}
