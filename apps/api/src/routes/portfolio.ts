import { prisma } from "@finos/db";
import { analyzeHoldings, analyzeTrades, fromDay, parseHoldingsCsv, parseTradebookCsv, toDay } from "@finos/engine";
import { Router } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../auth";

/**
 * Investment portfolio, separate from the bank statement: a holdings snapshot (what you own now)
 * and a tradebook (every buy and sell), both uploaded as broker CSV exports.
 */
export const portfolioRouter = Router();
const uid = (r: unknown) => (r as AuthedRequest).userId;
const MAX_TRADES = 20000;

portfolioRouter.get("/", async (req, res) => {
  const userId = uid(req);
  const [holdings, trades] = await Promise.all([
    prisma.holding.findMany({ where: { userId } }),
    prisma.trade.findMany({ where: { userId }, orderBy: { date: "asc" } }),
  ]);
  res.json({
    holdings: holdings.length ? { ...analyzeHoldings(holdings), updatedAt: holdings[0].updatedAt.toISOString() } : null,
    trades: trades.length
      ? analyzeTrades(trades.map((t) => ({ symbol: t.symbol, day: toDay(t.date.toISOString()), side: t.side as "BUY" | "SELL", quantity: t.quantity, price: t.price, tradeId: t.tradeId })))
      : null,
  });
});

const upload = z.object({ csv: z.string().min(1).max(5_000_000), replace: z.boolean().optional() });

portfolioRouter.post("/holdings", async (req, res) => {
  const p = upload.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Choose a holdings CSV file." });
  const { rows, errors } = parseHoldingsCsv(p.data.csv);
  if (!rows.length) return res.status(400).json({ error: errors[0] ?? "No holdings found in that file." });
  const userId = uid(req);
  const now = new Date();
  // A holdings file is a full snapshot of today, so it replaces the previous one
  await prisma.$transaction([
    prisma.holding.deleteMany({ where: { userId } }),
    prisma.holding.createMany({ data: rows.map((h) => ({ userId, symbol: h.symbol, quantity: h.quantity, avgPrice: h.avgPrice, lastPrice: h.lastPrice, sector: h.sector ?? null, updatedAt: now })) }),
  ]);
  res.json({ imported: rows.length, warnings: errors.slice(0, 20) });
});

portfolioRouter.post("/trades", async (req, res) => {
  const p = upload.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Choose a tradebook CSV file." });
  const { rows, errors } = parseTradebookCsv(p.data.csv);
  if (!rows.length) return res.status(400).json({ error: errors[0] ?? "No trades found in that file." });
  const userId = uid(req);
  if (p.data.replace) await prisma.trade.deleteMany({ where: { userId } });
  const existing = new Set((await prisma.trade.findMany({ where: { userId }, select: { tradeId: true } })).map((t) => t.tradeId));
  const fresh = rows.filter((t) => !existing.has(t.tradeId));
  if (existing.size + fresh.length > MAX_TRADES) return res.status(413).json({ error: `That would be more than ${MAX_TRADES.toLocaleString("en-IN")} trades. Upload a shorter period.` });
  if (fresh.length)
    await prisma.trade.createMany({
      data: fresh.map((t) => ({ userId, symbol: t.symbol, date: new Date(fromDay(t.day) + "T00:00:00Z"), side: t.side, quantity: t.quantity, price: t.price, tradeId: t.tradeId })),
    });
  res.json({ imported: fresh.length, duplicatesSkipped: rows.length - fresh.length, firstDate: fromDay(rows[0].day), lastDate: fromDay(rows[rows.length - 1].day), warnings: errors.slice(0, 20) });
});

portfolioRouter.delete("/:part", async (req, res) => {
  const userId = uid(req);
  if (req.params.part === "holdings") await prisma.holding.deleteMany({ where: { userId } });
  else if (req.params.part === "trades") await prisma.trade.deleteMany({ where: { userId } });
  else return res.status(404).json({ error: "Nothing to delete there." });
  res.json({ ok: true });
});
