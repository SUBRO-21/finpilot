import { backtest, buildInsights, detectAnomalies, forecast, fromDay, healthScore, spendingDetail, spendingOverview, suggestLimits, type Period } from "@finos/engine";
import { Router } from "express";
import type { AuthedRequest } from "../auth";
import { aiExplain } from "../ai";
import { loadContext } from "../context";

export const analysisRouter = Router();
const uid = (r: unknown) => (r as AuthedRequest).userId;
const horizonOf = (q: unknown, d = 60) => Math.min(180, Math.max(7, Number(q) || d));

analysisRouter.get("/summary", async (req, res) => {
  const c = await loadContext(uid(req));
  if (!c.txns.length) return res.json({ empty: true, name: c.user.name });
  const f = forecast({ ...c, horizon: horizonOf(req.query.horizon) });
  const ins = buildInsights(c.txns, c.openingBalance, c.asOfDay);
  const spent = new Map(ins.categories.map((x) => [x.category, x.amount]));
  const anomalies = detectAnomalies(c.txns);
  const byId = new Map(c.txns.map((t) => [t.id, t]));
  const safe = Math.max(0, Math.floor(f.worstCaseMin));
  res.json({
    empty: false,
    name: c.user.name,
    forecast: f,
    safeToSpend: { amount: safe, perDay: Math.floor(safe / f.horizon) },
    health: healthScore(ins, f, c.recurring),
    insights: ins,
    history: ins.history,
    month: ins.month,
    monthSpend: ins.monthSpend,
    previousMonthSpend: ins.previousMonthSpend,
    income30: ins.income30,
    spend30: ins.spend30,
    recurring: c.recurring.map((r) => ({ ...r, nextDate: fromDay(r.nextDay), lastDate: fromDay(r.lastDay) })),
    anomalies: anomalies.slice(0, 6).map((a) => ({ ...a, description: byId.get(a.txnId)?.description, date: fromDay(byId.get(a.txnId)!.day) })),
    limits: suggestLimits(c.txns, c.recurring, f).map((l) => ({ ...l, spent: spent.get(l.category) ?? 0 })),
  });
});

analysisRouter.get("/insights", async (req, res) => {
  const c = await loadContext(uid(req));
  if (!c.txns.length) return res.json({ empty: true });
  res.json({ empty: false, ...buildInsights(c.txns, c.openingBalance, c.asOfDay) });
});

analysisRouter.get("/backtest", async (req, res) => {
  const c = await loadContext(uid(req));
  res.json(backtest(c.txns, c.openingBalance, horizonOf(req.query.horizon, 14)));
});

/** Groq explanation of the current outlook, grounded in engine output. */
analysisRouter.post("/explain", async (req, res) => {
  const c = await loadContext(uid(req));
  if (!c.txns.length) return res.status(400).json({ error: "Import transactions first." });
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

analysisRouter.get("/spending", async (req, res) => {
  const c = await loadContext(uid(req));
  if (!c.txns.length) return res.json({ empty: true });
  const period = (["month", "90d", "all"].includes(String(req.query.period)) ? req.query.period : "month") as Period;
  res.json({ empty: false, ...spendingOverview(c.txns, c.asOfDay, period) });
});

analysisRouter.get("/spending/detail", async (req, res) => {
  const kind = req.query.kind === "merchant" ? "merchant" : "category";
  const name = String(req.query.name ?? "").slice(0, 120);
  if (!name) return res.status(400).json({ error: "Choose a category, shop or app to look at." });
  const c = await loadContext(uid(req));
  const d = spendingDetail(c.txns, kind, name, c.asOfDay);
  if (!d) return res.status(404).json({ error: "No spending found for that yet." });
  res.json(d);
});
