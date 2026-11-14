# FinOS - Predictive Cash Flow (PS 2.2)

Turborepo monorepo: `apps/web` (Next.js), `apps/api` (Express), `packages/db` (Prisma + MongoDB), `packages/engine` (pure-TS analytics), Groq for AI.

## Run
1. `npm install`
2. Copy `.env.example` values into `packages/db/.env` (DATABASE_URL) and `apps/api/.env`; set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local`.
   MongoDB must be a replica set (Atlas free tier works).
3. `npm run db:push`
4. `npm run dev` -> web on :3000, api on :4000

## How requirements map
| Requirement | Where |
|---|---|
| Recurring payment detection | `engine/recurring.ts` (cadence + gap/amount stability + confidence) |
| Cash-flow prediction + uncertainty | `engine/forecast.ts` (Monte Carlo, p10/p50/p90, shortage probability, uncertainty level + reasons) |
| Anomaly detection | `engine/anomaly.ts` (median/MAD per category) |
| Auto-categorization | rules first (`engine/categorize.ts`), Groq for leftovers; user overrides |
| Personalized limits | `engine/limits.ts` (tightens with shortage risk, each with a reason) |
| Loan / purchase simulation | `engine/simulate.ts`, run by the Groq assistant via tool calling (`api/routes/assistant.ts`) |
| Explainability | every output carries reasons/assumptions; Groq only narrates engine numbers |
| Accuracy evaluation | `engine/backtest.ts` (rolling-origin: error, WAPE, p10-p90 coverage) |

## Notes
- "Today" for forecasting is the last transaction date, so historical CSVs forecast forward from where they end.
- Forecasts are estimates, not financial advice.
