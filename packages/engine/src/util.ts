export const toDay = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};
export const fromDay = (n: number): string => new Date(n * 86400000).toISOString().slice(0, 10);

/** Calendar months a cadence stands for (monthly = 1, quarterly = 3, half-yearly = 6, yearly = 12), or 0 for day-based ones. */
const cadenceMonths = (cadenceDays: number) =>
  cadenceDays >= 28 && cadenceDays <= 31 ? 1 : cadenceDays >= 89 && cadenceDays <= 92 ? 3 : cadenceDays >= 180 && cadenceDays <= 184 ? 6 : cadenceDays >= 360 && cadenceDays <= 366 ? 12 : 0;

/**
 * The day `times` cycles after `day`. Monthly, quarterly and yearly cadences follow the calendar, so a salary
 * on the 1st stays on the 1st (fixed 30-day steps drift a day in every 31-day month and can skip a payment).
 * Always step from the same anchor with `times`, so the 31st does not slide to the 28th after February.
 */
export function addCadence(day: number, cadenceDays: number, times = 1): number {
  const months = cadenceMonths(cadenceDays);
  if (!months) return day + cadenceDays * times;
  const d = new Date(day * 86400000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months * times;
  const lastDom = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDom)) / 86400000);
}

/** First occurrence strictly after `afterDay` of a series last seen on `lastDay`. */
export function nextAfter(lastDay: number, cadenceDays: number, afterDay: number): number {
  let n = 1;
  while (addCadence(lastDay, cadenceDays, n) <= afterDay) n++;
  return addCadence(lastDay, cadenceDays, n);
}

export const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
export const std = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
};
export const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
/** p in [0,1]; input must be sorted ascending */
export const quantile = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
/** Deterministic PRNG so forecasts / backtests are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const round2 = (n: number) => Math.round(n * 100) / 100;
