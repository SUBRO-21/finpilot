import { buildInsights, forecast, fromDay, healthScore, simulate, suggestLimits, type Scenario } from "@finos/engine";
import { Router } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../auth";
import { client, MODEL } from "../ai";
import { loadContext } from "../context";

export const assistantRouter = Router();

const body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(1500) })).min(1).max(24),
});

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_overview",
      description: "The user's current financial picture: balance, forecast risk, safe-to-spend, health score, income and spending, this month's categories, top merchants, recurring bills and suggested budgets. Call this first for any question about their money.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "simulate_purchase",
      description: "Simulate a one-off purchase against the user's cash-flow forecast. Returns the change in chance of going below zero and the bad-case balance.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Purchase price in rupees" },
          in_days: { type: "integer", description: "Days from the end of the user's data until the purchase (1 to 180). Use 1 if they mean now." },
          label: { type: "string", description: "Short name of the purchase" },
        },
        required: ["amount", "in_days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "simulate_loan",
      description: "Simulate taking a loan (EMI repayments) against the user's cash-flow forecast.",
      parameters: {
        type: "object",
        properties: {
          principal: { type: "number", description: "Loan amount in rupees" },
          annual_rate_pct: { type: "number", description: "Annual interest rate in percent" },
          months: { type: "integer", description: "Term in months" },
          start_in_days: { type: "integer", description: "Days until the first EMI (default 30)" },
          label: { type: "string" },
        },
        required: ["principal", "annual_rate_pct", "months"],
      },
    },
  },
] as const;

assistantRouter.post("/chat", async (req, res) => {
  if (!client) return res.status(503).json({ error: "The assistant is off. Add GROQ_API_KEY to the API environment." });
  const p = body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Send between 1 and 24 messages of up to 1,500 characters." });

  const c = await loadContext((req as unknown as AuthedRequest).userId);
  if (!c.txns.length) return res.json({ reply: "I need some data first. Import a bank statement and then ask me again.", simulations: [] });

  const base = forecast({ ...c, horizon: 60 });
  const ins = buildInsights(c.txns, c.openingBalance, c.asOfDay);
  const health = healthScore(ins, base, c.recurring);
  const simulations: unknown[] = [];
  const used: string[] = [];

  const run = (name: string, a: any): unknown => {
    if (name === "get_overview") {
      used.push("Read your balance, bills and spending");
      return {
        dataEndsOn: ins.asOfDate, balance: Math.round(base.startBalance),
        chanceOfGoingBelowZeroIn60Days: base.shortageProbability, expectedShortageDate: base.expectedShortageDate,
        safeToSpendNow: Math.max(0, Math.floor(base.worstCaseMin)), forecastConfidence: base.uncertainty,
        healthScore: health.score, healthLabel: health.label,
        income30d: ins.income30, spending30d: ins.spend30, savingsRate: ins.savingsRate,
        thisMonth: { month: ins.month, spending: ins.monthSpend, lastMonthSpending: ins.previousMonthSpend, byCategory: ins.categories.slice(0, 8).map((x) => ({ category: x.category, amount: x.amount, lastMonth: x.previous })) },
        topMerchants90d: ins.merchants,
        recurring: c.recurring.map((r) => ({ name: r.name, amount: r.amount, every: r.cadenceLabel, next: fromDay(r.nextDay) })),
        suggestedMonthlyBudgets: suggestLimits(c.txns, c.recurring, base).slice(0, 6).map((l) => ({ category: l.category, budget: l.suggested, average: l.avgMonthly })),
      };
    }
    let scenario: Scenario;
    if (name === "simulate_purchase")
      scenario = { type: "PURCHASE", amount: Math.abs(Number(a.amount) || 0), inDays: Math.min(180, Math.max(1, Math.round(Number(a.in_days) || 1))), label: a.label };
    else if (name === "simulate_loan")
      scenario = { type: "LOAN", principal: Math.abs(Number(a.principal) || 0), annualRatePct: Math.min(60, Math.max(0, Number(a.annual_rate_pct) || 0)), months: Math.min(120, Math.max(1, Math.round(Number(a.months) || 12))), startInDays: Math.min(180, Math.max(1, Math.round(Number(a.start_in_days) || 30))), label: a.label };
    else return { error: "Unknown tool" };
    used.push(scenario.type === "LOAN" ? `Simulated a ₹${Math.round(scenario.principal).toLocaleString("en-IN")} loan` : `Simulated a ₹${Math.round(scenario.amount).toLocaleString("en-IN")} purchase`);
    const r = simulate({ ...c, horizon: 90 }, scenario);
    simulations.push({
      label: a.label ?? (scenario.type === "LOAN" ? "Loan" : "Purchase"), scenario, verdict: r.verdict, emi: r.emi,
      start: r.scenario.startBalance, baseline: r.baseline.points, points: r.scenario.points,
      riskBefore: r.baseline.shortageProbability, riskAfter: r.scenario.shortageProbability,
      worstBefore: r.baseline.worstCaseMin, worstAfter: r.scenario.worstCaseMin,
    });
    return {
      verdict: r.verdict, monthlyEmi: r.emi,
      chanceOfGoingBelowZero: { before: r.baseline.shortageProbability, after: r.scenario.shortageProbability },
      badCaseBalance: { before: Math.round(r.baseline.worstCaseMin), after: Math.round(r.scenario.worstCaseMin) },
      expectedShortageDateAfter: r.scenario.expectedShortageDate, forecastConfidence: r.scenario.uncertainty, uncertaintyNotes: r.scenario.uncertaintyReasons,
    };
  };

  const messages: any[] = [
    {
      role: "system",
      content:
        `You are FinOS Assistant, helping one person make everyday money decisions using their own data. Amounts are Indian rupees. Their data ends on ${ins.asOfDate}.\n` +
        "Rules:\n- Never state a figure about their money without getting it from a tool. Call get_overview first for questions about their finances.\n" +
        "- For 'can I afford', 'should I buy' or loan questions, run simulate_purchase or simulate_loan. If they give no timing, assume now (in_days 1). If a key number such as price is missing, ask for it.\n" +
        "- Give a clear recommendation (go ahead, wait, or avoid) first, then the 2-3 numbers that justify it, the main uncertainty, and one practical alternative.\n" +
        "- Be warm, plain and brief: under 170 words, no tables, no headings, short paragraphs. Use ₹ with Indian digit grouping.\n" +
        "- Use **bold** for the verdict and key figures, and short bullet lines starting with '- ' when listing numbers or options.\n" +
        "- End EVERY reply with one final line exactly in this form: FOLLOWUPS: <question> | <question> | <question> (three short follow-up questions the user might ask next, under 8 words each).\n" +
        "- Forecasts are estimates, not guarantees. For loans or investments add one short sentence that this is not professional financial advice.\n- Decline anything unrelated to personal finance.",
    },
    ...p.data.messages,
  ];

  try {
    for (let i = 0; i < 5; i++) {
      const r = await (client.chat.completions.create as any)({ model: MODEL, temperature: 0.3, max_tokens: 700, messages, tools: TOOLS, tool_choice: "auto" });
      const m = r.choices[0]?.message;
      if (m?.tool_calls?.length) {
        messages.push({ role: "assistant", content: m.content ?? "", tool_calls: m.tool_calls });
        for (const call of m.tool_calls) {
          let out: unknown;
          try { out = run(call.function.name, JSON.parse(call.function.arguments || "{}")); } catch { out = { error: "Could not run that tool" }; }
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out) });
        }
        continue;
      }
      return res.json({ reply: (m?.content ?? "").trim() || "I couldn't put an answer together. Try rephrasing.", simulations, used });
    }
    res.json({ reply: "That took more steps than I could finish. Try a more specific question.", simulations, used });
  } catch (e) {
    console.warn("assistant failed:", (e as Error).message);
    res.status(502).json({ error: "The assistant couldn't be reached. Try again in a moment." });
  }
});
