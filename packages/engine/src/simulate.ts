import { forecast, type ForecastInput } from "./forecast";
import type { Flow, Forecast } from "./types";
import { round2 } from "./util";

export type Scenario =
  | { type: "PURCHASE"; amount: number; inDays: number; label?: string }
  | { type: "LOAN"; principal: number; annualRatePct: number; months: number; startInDays: number; label?: string };

export function scenarioFlows(s: Scenario, horizon: number): { flows: Flow[]; emi?: number } {
  if (s.type === "PURCHASE") return { flows: [{ offset: Math.max(1, s.inDays), amount: -Math.abs(s.amount), label: s.label ?? "Purchase" }] };
  const r = s.annualRatePct / 100 / 12;
  const emi = r === 0 ? s.principal / s.months : (s.principal * r) / (1 - Math.pow(1 + r, -s.months));
  const flows: Flow[] = [];
  for (let k = 0; k < s.months; k++) {
    const offset = s.startInDays + k * 30;
    if (offset >= 1 && offset <= horizon) flows.push({ offset, amount: -emi, label: `Loan EMI ${k + 1}/${s.months}` });
  }
  return { flows, emi: round2(emi) };
}

export interface SimulationResult {
  baseline: Forecast;
  scenario: Forecast;
  emi?: number;
  deltaShortageProbability: number;
  deltaMinBalance: number;
  verdict: "SAFE" | "RISKY" | "UNAFFORDABLE";
}

/** Same seed for both runs, so the difference is attributable to the decision rather than sampling noise. */
export function simulate(base: ForecastInput, s: Scenario): SimulationResult {
  const { flows, emi } = scenarioFlows(s, base.horizon);
  const baseline = forecast(base);
  const scenario = forecast({ ...base, extraFlows: [...(base.extraFlows ?? []), ...flows] });
  const risk = scenario.shortageProbability;
  return {
    baseline, scenario, emi,
    deltaShortageProbability: scenario.shortageProbability - baseline.shortageProbability,
    deltaMinBalance: scenario.worstCaseMin - baseline.worstCaseMin,
    verdict: risk < 0.1 ? "SAFE" : risk < 0.4 ? "RISKY" : "UNAFFORDABLE",
  };
}
