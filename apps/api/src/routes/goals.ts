import { prisma } from "@finos/db";
import { forecast, fromDay, planGoals, toDay } from "@finos/engine";
import { Router } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../auth";
import { loadContext } from "../context";

export const goalsRouter = Router();
const uid = (r: unknown) => (r as AuthedRequest).userId;
const MAX_GOALS = 12;

/** Every goal with its plan: monthly amount needed, on-track status and the reasons behind it. */
export async function goalPlans(userId: string) {
  const c = await loadContext(userId);
  const rows = await prisma.savingsGoal.findMany({ where: { userId }, orderBy: { targetDate: "asc" } });
  if (!c.txns.length) return { hasData: false, asOfDate: null, pace: 0, paceDays: 0, goals: rows.map((g) => ({ id: g.id, label: g.label, target: g.target, saved: g.saved, targetDate: g.targetDate.toISOString().slice(0, 10) })) };
  const f = forecast({ ...c, horizon: 60 });
  const plan = planGoals(
    rows.map((g) => ({ id: g.id, label: g.label, target: g.target, saved: g.saved, targetDay: toDay(g.targetDate.toISOString()) })),
    { txns: c.txns, asOfDay: c.asOfDay, worstCaseMin: f.worstCaseMin },
  );
  return { hasData: true, asOfDate: fromDay(c.asOfDay), ...plan };
}

goalsRouter.get("/", async (req, res) => {
  res.json(await goalPlans(uid(req)));
});

const goal = z.object({
  label: z.string().trim().min(1).max(60),
  target: z.number().positive().max(1e10),
  saved: z.number().min(0).max(1e10).default(0),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

goalsRouter.post("/", async (req, res) => {
  const p = goal.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Give the goal a name, an amount and a date." });
  if (p.data.saved > p.data.target) return res.status(400).json({ error: "Already saved can't be more than the goal amount." });
  const userId = uid(req);
  if ((await prisma.savingsGoal.count({ where: { userId } })) >= MAX_GOALS) return res.status(409).json({ error: `You can have up to ${MAX_GOALS} goals. Remove one first.` });
  const g = await prisma.savingsGoal.create({ data: { userId, label: p.data.label, target: p.data.target, saved: p.data.saved, targetDate: new Date(p.data.targetDate + "T00:00:00Z") } });
  res.status(201).json({ id: g.id });
});

const update = z.object({ saved: z.number().min(0).max(1e10) });
goalsRouter.patch("/:id", async (req, res) => {
  const p = update.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Enter how much you have saved so far." });
  const g = await prisma.savingsGoal.findFirst({ where: { id: String(req.params.id), userId: uid(req) } });
  if (!g) return res.status(404).json({ error: "Goal not found." });
  await prisma.savingsGoal.update({ where: { id: g.id }, data: { saved: Math.min(p.data.saved, g.target) } });
  res.json({ ok: true });
});

goalsRouter.delete("/:id", async (req, res) => {
  await prisma.savingsGoal.deleteMany({ where: { id: String(req.params.id), userId: uid(req) } });
  res.json({ ok: true });
});
