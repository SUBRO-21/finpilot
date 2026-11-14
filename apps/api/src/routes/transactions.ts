import { prisma } from "@finos/db";
import { CATEGORIES, categorizeRule, parseStatement } from "@finos/engine";
import { Router } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../auth";
import { aiCategorize } from "../ai";

export const txnRouter = Router();
const uid = (r: unknown) => (r as AuthedRequest).userId;

/** Body: { csv: "<file text>" }. Rules categorize first; Groq handles the leftovers. Duplicates are skipped. */
txnRouter.post("/import", async (req, res) => {
  const userId = uid(req);
  const csv = z.string().min(10).safeParse(req.body?.csv);
  if (!csv.success) return res.status(400).json({ error: "Choose a CSV file with a header row." });
  const { rows, errors, openingBalance } = parseStatement(csv.data);
  if (!rows.length) return res.status(400).json({ error: errors[0] ?? "No valid rows found.", errors });

  const cats = rows.map((r) => categorizeRule(r.description, r.amount));
  const unknown = [...new Set(rows.filter((_, i) => !cats[i]).map((r) => r.description))].slice(0, 80);
  const ai = await aiCategorize(unknown);

  const existing = await prisma.transaction.findMany({ where: { userId }, select: { date: true, description: true, amount: true } });
  const seen = new Set(existing.map((e) => `${e.date.toISOString().slice(0, 10)}|${e.description}|${e.amount}`));
  const data = [];
  let aiCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const k = `${r.date}|${r.description}|${r.amount}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const fromAi = !cats[i] && ai[r.description];
    if (fromAi) aiCount++;
    const category = cats[i] ?? ai[r.description] ?? "Other";
    data.push({
      userId, date: new Date(r.date + "T00:00:00Z"), description: r.description, amount: r.amount, category,
      categorySource: cats[i] ? "rule" : fromAi ? "ai" : "rule",
      isRefund: category === "Refund" && r.amount > 0,
    });
  }
  if (data.length) await prisma.transaction.createMany({ data });
  // The statement's opening balance seeds the account only if this user had no earlier history
  if (openingBalance != null && existing.length === 0) await prisma.user.update({ where: { id: userId }, data: { openingBalance } });
  res.json({ imported: data.length, duplicatesSkipped: rows.length - data.length, aiCategorized: aiCount, warnings: errors.slice(0, 10) });
});

txnRouter.get("/", async (req, res) => {
  const where: Record<string, unknown> = { userId: uid(req) };
  if (typeof req.query.category === "string") where.category = req.query.category;
  const rows = await prisma.transaction.findMany({ where, orderBy: { date: "desc" }, take: 500 });
  res.json(
    rows.map((t) => ({
      id: t.id, date: t.date.toISOString().slice(0, 10), description: t.description,
      amount: t.amount, category: t.category, categorySource: t.categorySource,
    })),
  );
});

const patch = z.object({ category: z.enum(CATEGORIES) });
txnRouter.patch("/:id", async (req, res) => {
  const p = patch.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pick a valid category." });
  const t = await prisma.transaction.findFirst({ where: { id: String(req.params.id), userId: uid(req) } });
  if (!t) return res.status(404).json({ error: "Transaction not found." });
  const u = await prisma.transaction.update({ where: { id: t.id }, data: { category: p.data.category, categorySource: "user" } });
  res.json({ id: u.id, category: u.category });
});
