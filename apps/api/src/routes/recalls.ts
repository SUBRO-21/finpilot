import { prisma } from "@finos/db";
import { ACTIVE_RECALL, RECALL_TRANSITIONS, recallEligibility, type RecallStatus } from "@finos/engine";
import { Router } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../auth";

export const recallRouter = Router();
const windowDays = () => Number(process.env.RECALL_WINDOW_DAYS ?? 120);

recallRouter.get("/", async (req, res) => {
  const rows = await prisma.recall.findMany({
    where: { userId: (req as unknown as AuthedRequest).userId },
    orderBy: { createdAt: "desc" },
    include: { transaction: { select: { description: true, amount: true, date: true, category: true } } },
  });
  res.json(rows);
});

recallRouter.post("/", async (req, res) => {
  const userId = (req as unknown as AuthedRequest).userId;
  const p = z.object({ transactionId: z.string(), reason: z.string().min(5).max(500) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Give a reason of at least 5 characters" });
  const t = await prisma.transaction.findFirst({ where: { id: p.data.transactionId, userId } });
  if (!t) return res.status(404).json({ error: "Transaction not found" });
  const active = await prisma.recall.count({ where: { transactionId: t.id, status: { in: ACTIVE_RECALL as never } } });
  const el = recallEligibility(t, active > 0, windowDays());
  if (!el.eligible) return res.status(422).json({ error: el.reason });
  const recall = await prisma.recall.create({
    data: {
      userId, transactionId: t.id, reason: p.data.reason,
      history: [{ status: "REQUESTED", at: new Date().toISOString(), note: p.data.reason }],
    },
  });
  res.status(201).json(recall);
});

/**
 * Records progress on a recall. Setting REFUNDED books a matching credit so cash-flow forecasts stay accurate.
 * Body: { status, note?, refundAmount? }  (refundAmount defaults to the full payment; partial refunds allowed)
 */
recallRouter.patch("/:id", async (req, res) => {
  const userId = (req as unknown as AuthedRequest).userId;
  const p = z
    .object({
      status: z.enum(["UNDER_REVIEW", "REFUNDED", "REJECTED", "WITHDRAWN"]),
      note: z.string().max(500).optional(),
      refundAmount: z.number().positive().optional(),
    })
    .safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid status update" });
  const r = await prisma.recall.findFirst({ where: { id: req.params.id, userId }, include: { transaction: true } });
  if (!r) return res.status(404).json({ error: "Recall not found" });
  if (!RECALL_TRANSITIONS[r.status as RecallStatus].includes(p.data.status))
    return res.status(409).json({ error: `A recall that is ${r.status.toLowerCase().replace("_", " ")} cannot move to ${p.data.status.toLowerCase().replace("_", " ")}` });

  if (p.data.status === "REFUNDED") {
    const full = Math.abs(r.transaction.amount);
    const amt = Math.min(p.data.refundAmount ?? full, full);
    await prisma.transaction.create({
      data: {
        userId, date: new Date(), description: `Refund: ${r.transaction.description}`, amount: amt,
        category: "Refund", categorySource: "import", isMerchant: false, isRefund: true,
      },
    });
  }
  const history = [...((r.history as unknown[]) ?? []), { status: p.data.status, at: new Date().toISOString(), note: p.data.note ?? null }];
  const updated = await prisma.recall.update({
    where: { id: r.id },
    data: { status: p.data.status, note: p.data.note ?? r.note, history: history as never },
  });
  res.json(updated);
});
