import { backtest, detectAnomalies, forecast, fromDay, simulate, suggestLimits, type Scenario } from "@finos/engine";
import { Router } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../auth";
import { aiExplain } from "../ai";
import { loadContext } from "../context";

export const analysisRouter = Router();
const uid = (r: unknown) => (r as AuthedRequest).userId;
const horizonOf = (q: unknown, d = 60) => Math.min(180, Math.max(7, Number(q) || d));

analysisRouter.get("/summary", async (req, res) => {
  const c = await loadContext(uid(req));
  if (!c.txns.length) return res.json({ empty: true });
  const f = forecast({ ...c, horizon: horizonOf(req.query.horizon) });
  const anomalies = detectAnomalies(c.txns);
  const byId = new Map(c.txns.map((t) => [t.id, t]));
  res.json({
    empty: false,
    forecast: f,
    recurring: c.recurring.map((r) => ({ ...r, nextDate: fromDay(r.nextDay), lastDate: fromDay(r.lastDay) })),
    anomalies: anomalies.slice(0, 10).map((a) => ({ ...a, description: byId.get(a.txnId)?.description, date: fromDay(byId.get(a.txnId)!.day) })),
    limits: suggestLimits(c.txns, c.recurring, f),
  });
});

analysisRouter.get("/backtest", async (req, res) => {
  const c = await loadContext(uid(req));
  res.json(backtest(c.txns, c.openingBalance, horizonOf(req.query.horizon, 14)));
});

const scenario = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PURCHASE"), amount: z.number().positive(), inDays: z.number().int().min(1).max(180), label: z.string().optional() }),
  z.object({
    type: z.literal("LOAN"), principal: z.number().positive(), annualRatePct: z.number().min(0).max(60),
    months: z.number().int().min(1).max(120), startInDays: z.number().int().min(1).max(180), label: z.string().optional(),
  }),
]);

analysisRouter.post("/simulate", async (req, res) => {
  const p = scenario.safeParse(req.body?.scenario);
  if (!p.success) return res.status(400).json({ error: "Invalid scenario", details: p.error.flatten() });
  const c = await loadContext(uid(req));
  if (!c.txns.length) return res.status(400).json({ error: "Import transactions first" });
  const result = simulate({ ...c, horizon: horizonOf(req.body?.horizon, 90) }, p.data as Scenario);
  const explanation = await aiExplain("What-if simulation of a financial decision", {
    scenario: p.data,
    emi: result.emi,
    baselineShortageProbability: result.baseline.shortageProbability,
    scenarioShortageProbability: result.scenario.shortageProbability,
    worstCaseBalanceBefore: result.baseline.worstCaseMin,
    worstCaseBalanceAfter: result.scenario.worstCaseMin,
    uncertainty: result.scenario.uncertainty,
    verdict: result.verdict,
  });
  res.json({ ...result, explanation });
});

/** Groq explanation of the current outlook, grounded in engine output. */
analysisRouter.post("/explain", async (req, res) => {
  const c = await loadContext(uid(req));
  if (!c.txns.length) return res.status(400).json({ error: "Import transactions first" });
  const f = forecast({ ...c, horizon: 60 });
  const limits = suggestLimits(c.txns, c.recurring, f).slice(0, 5);
  const text = await aiExplain("Cash-flow outlook and spending limits", {
    startBalance: f.startBalance, shortageProbability: f.shortageProbability, expectedShortageDate: f.expectedShortageDate,
    worstCaseMin: f.worstCaseMin, uncertainty: f.uncertainty, uncertaintyReasons: f.uncertaintyReasons,
    upcomingRecurring: c.recurring.slice(0, 5).map((r) => ({ name: r.name, amount: r.amount, next: fromDay(r.nextDay) })),
    limits,
  });
  res.json({ explanation: text });
});
