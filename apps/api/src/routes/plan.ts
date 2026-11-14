import { prisma } from "@finos/db";
import { addCadence, candidateRecurring, fromDay, guessPayType, merchantName, nextAfter, payTypeCategory, toDay, type RecurringItem } from "@finos/engine";
import { Router } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../auth";
import { freshness, loadContext } from "../context";

export const planRouter = Router();
const uid = (r: unknown) => (r as AuthedRequest).userId;

type Ctx = Awaited<ReturnType<typeof loadContext>>;

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase());

function kindOf(r: RecurringItem) {
  if (r.amount > 0) return "income";
  if (r.category === "Loan/EMI" || /\b(emi|loan)\b/i.test(r.name)) return "loan";
  if (r.category === "Subscriptions") return "subscription";
  return "bill";
}

function shape(r: RecurringItem) {
  return {
    // Salary lines read best as written; other money in (a tenant's UPI, a client's RTGS) is cleaned to the payer's name
    key: r.key, name: r.amount > 0 && /salary|payroll|stipend|pension/i.test(r.name) ? titleCase(r.name) : merchantName(r.name), raw: r.name, amount: r.amount, kind: kindOf(r),
    cadenceDays: r.cadenceDays, cadenceLabel: r.cadenceLabel, lastDate: fromDay(r.lastDay), nextDate: fromDay(r.nextDay),
    occurrences: r.occurrences, category: r.category, source: r.source ?? "detected",
    // What the payment is for: the user's answer, else our guess (null = we cannot tell and must ask)
    payType: r.payType ?? guessPayType(r.category, r.amount, r.name),
    toPerson: r.category === "Transfers" || r.category === "People",
  };
}

/** Everything we still need to ask: detected repeats with no answer yet, plus likely repeats seen fewer than three times. */
function questionsFor(c: Ctx): RecurringItem[] {
  const answered = new Set(c.prefs.map((p) => p.key));
  const det = c.detected.filter((r) => !answered.has(r.key)).map((r) => ({ ...r, source: "detected" as const }));
  const cands = candidateRecurring(c.txns, c.asOfDay, c.detected).filter((r) => !answered.has(r.key));
  return [...det, ...cands];
}

planRouter.get("/status", async (req, res) => {
  const c = await loadContext(uid(req));
  const f = freshness(c.asOfDay, c.txns.length > 0);
  res.json({ ...f, lastDate: c.txns.length ? fromDay(c.asOfDay) : null, pending: c.txns.length ? questionsFor(c).length : 0 });
});

planRouter.get("/review", async (req, res) => {
  const c = await loadContext(uid(req));
  const f = freshness(c.asOfDay, c.txns.length > 0);
  const answeredKeys = new Map(c.prefs.map((p) => [p.key, p]));
  res.json({
    asOfDate: c.txns.length ? fromDay(c.asOfDay) : null,
    ageDays: f.ageDays,
    questions: questionsFor(c).map(shape),
    answered: [
      ...c.recurring.filter((r) => answeredKeys.has(r.key)).map((r) => ({ ...shape(r), decision: answeredKeys.get(r.key)!.decision, newAmount: answeredKeys.get(r.key)!.newAmount, endDate: r.endDay ? fromDay(r.endDay) : null })),
    ],
    planned: c.planned.filter((p) => toDay(p.date.toISOString()) > c.asOfDay).map((p) => ({ id: p.id, label: p.label, amount: p.amount, date: p.date.toISOString().slice(0, 10) })),
  });
});

const answer = z.object({
  key: z.string().min(2).max(300),
  decision: z.enum(["CONTINUE", "CHANGE", "ENDS", "STOP", "ONEOFF"]),
  newAmount: z.number().positive().optional(),
  remaining: z.number().int().min(1).max(240).optional(), // payments still to come, including the next one
  cadenceDays: z.number().int().min(7).max(400).optional(), // for payments we only saw once
  payType: z.string().min(1).max(40).optional(), // "What is this payment for?" (engine/paytypes.ts)
});

planRouter.post("/recurring", async (req, res) => {
  const p = answer.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Choose an answer, and enter a number where one is asked for." });
  const userId = uid(req);
  const c = await loadContext(userId);
  const item =
    c.detected.find((r) => r.key === p.data.key) ??
    candidateRecurring(c.txns, c.asOfDay, c.detected).find((r) => r.key === p.data.key) ??
    c.recurring.find((r) => r.key === p.data.key);
  if (!item) return res.status(404).json({ error: "That payment is no longer in your history." });
  if (p.data.decision === "CHANGE" && !p.data.newAmount) return res.status(400).json({ error: "Enter the new amount." });
  if (p.data.decision === "ENDS" && !p.data.remaining) return res.status(400).json({ error: "Enter how many payments are left." });
  const typeCategory = p.data.payType ? payTypeCategory(p.data.payType, item.amount) : null;
  if (p.data.payType && !typeCategory) return res.status(400).json({ error: "Choose what this payment is for from the list." });

  // The type the user picked recategorizes every past payment in this series, and a payee rule
  // makes future imports of the same payee land in that category too.
  const category = typeCategory ?? item.category;
  if (typeCategory && typeCategory !== item.category) {
    await prisma.transaction.updateMany({ where: { userId, id: { in: item.txnIds } }, data: { category, categorySource: "user" } });
    const labels = [...new Set(c.txns.filter((t) => item.txnIds.includes(t.id)).map((t) => t.description))];
    for (const label of labels)
      await prisma.categoryRule.upsert({ where: { userId_label: { userId, label } }, create: { userId, label, category }, update: { category } });
  }

  const cadence = p.data.cadenceDays ?? item.cadenceDays;
  const next = nextAfter(item.lastDay, cadence, c.asOfDay);
  const endDay = p.data.decision === "ENDS" ? addCadence(next, cadence, p.data.remaining! - 1) : null;
  const data = {
    decision: p.data.decision, name: item.name, amount: item.amount, cadenceDays: cadence,
    lastDate: new Date(fromDay(item.lastDay) + "T00:00:00Z"), category,
    newAmount: p.data.decision === "CHANGE" ? p.data.newAmount! : null,
    endDate: endDay ? new Date(fromDay(endDay) + "T00:00:00Z") : null,
    payType: p.data.payType ?? null,
  };
  await prisma.recurringPref.upsert({
    where: { userId_key: { userId, key: p.data.key } },
    create: { userId, key: p.data.key, ...data },
    update: data,
  });
  res.json({ ok: true });
});

planRouter.post("/recurring/reset", async (req, res) => {
  const key = z.string().min(2).safeParse(req.body?.key);
  if (!key.success) return res.status(400).json({ error: "Missing payment." });
  await prisma.recurringPref.deleteMany({ where: { userId: uid(req), key: key.data } });
  res.json({ ok: true });
});

const planned = z.object({
  label: z.string().trim().min(1).max(80),
  amount: z.number().positive().max(1e9),
  direction: z.enum(["in", "out"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

planRouter.post("/planned", async (req, res) => {
  const p = planned.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Add a name, an amount and a date for it." });
  const userId = uid(req);
  if ((await prisma.plannedItem.count({ where: { userId } })) >= 40) return res.status(409).json({ error: "You have reached 40 planned items. Remove one first." });
  const item = await prisma.plannedItem.create({
    data: { userId, label: p.data.label, amount: p.data.direction === "out" ? -p.data.amount : p.data.amount, date: new Date(p.data.date + "T00:00:00Z") },
  });
  res.status(201).json({ id: item.id });
});

planRouter.delete("/planned/:id", async (req, res) => {
  await prisma.plannedItem.deleteMany({ where: { id: String(req.params.id), userId: uid(req) } });
  res.json({ ok: true });
});
