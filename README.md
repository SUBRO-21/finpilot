# FinOS - Predictive Cash Flow (PS 2.2)

Turborepo monorepo: `apps/web` (Next.js), `apps/api` (Express), `packages/db` (Prisma + MongoDB), `packages/engine` (pure-TS analytics), Groq or Google Gemini for AI.

## Run
1. `npm install`
2. Copy `.env.example` values into `packages/db/.env` (DATABASE_URL) and `apps/api/.env`; set `NEXT_PUBLIC_API_URL` in `apps/web/.env.local`.
   MongoDB must be a replica set (Atlas free tier works).
   AI: set `GROQ_API_KEY` and/or `GEMINI_API_KEY` in `apps/api/.env`; `AI_PROVIDER=groq|gemini` chooses when both are set.
3. `npm run db:push`
4. `npm run dev` -> web on :3000, api on :4000

### Local MongoDB (instead of Atlas)
Run a single-node replica set from the repo root (data lives in the gitignored `.mongo-data/`):
```
"C:\Program Files\MongoDB\Server\9.0\bin\mongod.exe" --dbpath .mongo-data --replSet rs0 --bind_ip 127.0.0.1 --port 27018
```
First time only, initiate it: `npx mongosh "mongodb://127.0.0.1:27018/?directConnection=true" --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27018'}]})"`
Then use `DATABASE_URL="mongodb://127.0.0.1:27018/finos?replicaSet=rs0&directConnection=true"`.
(Port 27018 avoids the default MongoDB Windows service on 27017, which runs without replication.)

## How requirements map
| Requirement | Where |
|---|---|
| Recurring payment detection | `engine/recurring.ts` (cadence + gap/amount stability + confidence) |
| Cash-flow prediction + uncertainty | `engine/forecast.ts` (Monte Carlo, p10/p50/p90, shortage probability, uncertainty level + reasons) |
| Anomaly detection | `engine/anomaly.ts` (median/MAD per category) |
| Auto-categorization | rules first (`engine/categorize.ts`), AI (Groq/Gemini) for leftovers; user overrides |
| Personalized limits | `engine/limits.ts` (tightens with shortage risk, each with a reason) |
| Loan / purchase simulation | `engine/simulate.ts`, run by the AI assistant via tool calling (`api/routes/assistant.ts`) |
| Explainability | every output carries reasons/assumptions; the AI only narrates engine numbers |
| Payment type for recurring payments | `engine/paytypes.ts` + `engine/prefs.ts` (payments to/from personal accounts are asked about; the answer recategorizes history and future imports) |
| Savings goals | `engine/goals.ts` (real savings pace, goals funded in date order, bad-case buffer check) |
| Price-rise & subscription alerts | `engine/alerts.ts` (shown on Bills) |
| Portfolio analysis (separate from bank data) | `engine/portfolio.ts`: holdings (P&L, sectors, concentration) and tradebook (FIFO realized P&L, win rate, holding periods, behaviour). Try `sample_holdings.csv` / `sample_tradebook.csv` |
| How much history to learn from | `engine/lookback.ts`: tests 30/60/90/180/365 days and recency-weighted all-history on the user's own past (quantile loss over rolling 30-day forecasts) and uses the winner; 90 days unless another option is 5%+ better |
| Accuracy evaluation | `engine/backtest.ts` (rolling-origin: error, WAPE, p10-p90 coverage) |

## Sample data
Synthetic, for testing and demos (regenerate with `node scripts/make-samples.mjs`):
- `sample_bank_statement.csv`: 12 months (Dec 2025 to Nov 2026), 718 transactions. Rent to a landlord's personal account, a maid and a tenant (asked about on Review), a salary raise in April, quarterly school fees, yearly premiums, overlapping subscriptions, Netflix and rent price rises.
- `sample_tradebook.csv` (Zerodha tradebook format, 2 years) and `sample_holdings.csv` (what is still held at the end of it). Import these on the Portfolio page.

## Notes
- "Today" for forecasting is the last transaction date, so historical CSVs forecast forward from where they end.
- Forecasts are estimates, not financial advice.
