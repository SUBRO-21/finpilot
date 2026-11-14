export interface Txn {
  id: string;
  day: number; // days since epoch (UTC)
  description: string;
  amount: number; // negative = outflow
  category: string;
}

export interface RecurringItem {
  key: string;
  name: string;
  amount: number; // signed median
  cadenceDays: number;
  cadenceLabel: string;
  lastDay: number;
  nextDay: number;
  confidence: number; // 0..1
  occurrences: number;
  txnIds: string[];
  category: string;
  stopped?: boolean; // user said they are cancelling it
  endDay?: number; // last expected occurrence
  userConfirmed?: boolean; // came from the user, not detection
  pref?: string; // CONTINUE | CHANGE | ENDS | STOP
  source?: "detected" | "candidate";
}

export interface Anomaly {
  txnId: string;
  score: number;
  category: string;
  amount: number;
  typical: number;
  reason: string;
}

export interface ForecastPoint {
  day: number;
  date: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface Forecast {
  asOfDay: number;
  asOfDate: string;
  startBalance: number;
  horizon: number;
  points: ForecastPoint[];
  shortageProbability: number;
  expectedShortageDate: string | null; // median first-negative date among shortage paths
  worstCaseMin: number; // p10 of path minimums
  uncertainty: "LOW" | "MEDIUM" | "HIGH";
  uncertaintyReasons: string[];
  assumptions: string[];
  recurringUsed: number;
}

export interface Flow {
  offset: number; // days after as-of date (1 = tomorrow)
  amount: number; // signed
  label?: string;
}

export interface ParsedRow {
  date: string; // ISO
  description: string; // readable label
  amount: number;
  raw?: string; // original bank particulars
  ref?: string; // bank transaction id
  category?: string; // hint from the statement itself (e.g. UPI merchant code)
}
