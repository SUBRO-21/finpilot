import { prisma } from "@finos/db";
import { CATEGORIES, categorizeRule, parseStatement } from "@finos/engine";
import { Router } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../auth";
import { aiCategorize } from "../ai";

export const txnRouter = Router();
const uid = (r: unknown) => (r as AuthedRequest).userId;

const dedupeKey = (t: { ref?: string | null; date: string; description: string; amount: number }) =>
  t.ref ? `ref|${t.ref}|${t.date}|${t.amount}` : `txt|${t.date}|${t.description}|${t.amount}`;

/**
 * Body: { csv: "<file text>", replace?: boolean, force?: boolean }.
 * Statement hints (UPI merchant codes, payee names) and keyword rules categorize first; the AI provider handles the leftovers.
 * Duplicates are skipped by bank transaction id. `replace` wipes this user's earlier data first, which is what you want
 * when switching to a different account. Without it, the new file's opening balance is checked against the running
 * balance; an unrelated-looking statement is held back until the caller resends it with `force`.
 */
txnRouter.post("/import", async (req, res) => {
  const userId = uid(req);
  const csv = z.string().min(10).safeParse(req.body?.csv);
  if (!csv.success) return res.status(400).json({ error: "Choose a CSV file with a header row." });
  const replace = req.body?.replace === true;
  const { rows, errors, openingBalance } = parseStatement(csv.data);
  if (!rows.length) return res.status(400).json({ error: errors[0] ?? "No valid rows found.", errors });

  if (replace) {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.recurringPref.deleteMany({ where: { userId } });
    await prisma.plannedItem.deleteMany({ where: { userId } });
  }

  // Payee rules the user taught us ("always treat this as Transfers") beat statement hints and keywords
  const rules = new Map((await prisma.categoryRule.findMany({ where: { userId } })).map((r) => [r.label, r.category]));
  const cats = rows.map((r) => rules.get(r.description) ?? r.category ?? categorizeRule(r.description, r.amount));

  const existing = await prisma.transaction.findMany({ where: { userId }, select: { date: true, description: true, amount: true, ref: true } });
  const seen = new Set(existing.map((e) => dedupeKey({ ref: e.ref, date: e.date.toISOString().slice(0, 10), description: e.description, amount: e.amount })));

  const firstDate = rows.reduce((m, r) => (r.date < m ? r.date : m), rows[0].date);
  const lastDate = rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date);

  // Does this file continue from what we already hold?
  let mismatch: { expected: number; found: number } | null = null;
  if (!replace && openingBalance != null && existing.length > 0) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const before = existing.filter((e) => e.date.toISOString().slice(0, 10) < firstDate).reduce((a, e) => a + e.amount, 0);
    const expected = Math.round((user.openingBalance + before) * 100) / 100;
    if (Math.abs(expected - openingBalance) > 1.5) mismatch = { expected, found: openingBalance };
  }
  // Hold an unrelated-looking file until the user confirms, so two accounts are never mixed by accident
  if (mismatch && req.body?.force !== true) {
    return res.json({ imported: 0, blocked: true, duplicatesSkipped: 0, aiCategorized: 0, warnings: [], replaced: false, firstDate, lastDate, openingBalance, mismatch });
  }

  const unknown = [...new Set(rows.filter((_, i) => !cats[i]).map((r) => r.description))].slice(0, 80);
  const ai = await aiCategorize(unknown);


  const data = [];
  let aiCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const k = dedupeKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    const fromAi = !cats[i] && ai[r.description];
    if (fromAi) aiCount++;
    const category = cats[i] ?? ai[r.description] ?? "Other";
    data.push({
      userId, date: new Date(r.date + "T00:00:00Z"), description: r.description, amount: r.amount, category,
      categorySource: rules.has(r.description) ? "user" : r.category ? "import" : cats[i] ? "rule" : fromAi ? "ai" : "rule",
      isRefund: category === "Refund" && r.amount > 0,
      raw: r.raw ?? null, ref: r.ref ?? null,
    });
  }
  // createMany in slices keeps large yearly statements well under request limits
  for (let i = 0; i < data.length; i += 500) await prisma.transaction.createMany({ data: data.slice(i, i + 500) });

  // The statement's opening balance seeds the account when starting fresh or when there was no earlier history
  if (openingBalance != null && (replace || existing.length === 0)) await prisma.user.update({ where: { id: userId }, data: { openingBalance } });

  res.json({
    imported: data.length, duplicatesSkipped: rows.length - data.length, aiCategorized: aiCount, warnings: errors.slice(0, 10),
    replaced: replace, firstDate, lastDate, openingBalance, mismatch: null, forced: mismatch !== null,
  });
});

txnRouter.get("/", async (req, res) => {
  const where: Record<string, unknown> = { userId: uid(req) };
  if (typeof req.query.category === "string") where.category = req.query.category;
  const rows = await prisma.transaction.findMany({ where, orderBy: { date: "desc" }, take: 2000 });
  res.json(
    rows.map((t) => ({
      id: t.id, date: t.date.toISOString().slice(0, 10), description: t.description, raw: t.raw,
      amount: t.amount, category: t.category, categorySource: t.categorySource,
    })),
  );
});

const patch = z.object({ category: z.enum(CATEGORIES), applyToAll: z.boolean().optional() });
txnRouter.patch("/:id", async (req, res) => {
  const p = patch.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pick a valid category." });
  const t = await prisma.transaction.findFirst({ where: { id: String(req.params.id), userId: uid(req) } });
  if (!t) return res.status(404).json({ error: "Transaction not found." });
  const u = await prisma.transaction.update({ where: { id: t.id }, data: { category: p.data.category, categorySource: "user" } });
  let updated = 1;
  if (p.data.applyToAll) {
    const r = await prisma.transaction.updateMany({ where: { userId: uid(req), description: t.description }, data: { category: p.data.category, categorySource: "user" } });
    updated = r.count;
    await prisma.categoryRule.upsert({
      where: { userId_label: { userId: uid(req), label: t.description } },
      create: { userId: uid(req), label: t.description, category: p.data.category },
      update: { category: p.data.category },
    });
  }
  res.json({ id: u.id, category: u.category, updated });
});
