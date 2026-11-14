import "dotenv/config";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth";
import { txnRouter } from "./routes/transactions";
import { analysisRouter } from "./routes/analysis";
import { recallRouter } from "./routes/recalls";
import { requireAuth } from "./auth";

const app = express();
app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", authRouter);
app.use("/transactions", requireAuth, txnRouter);
app.use("/analysis", requireAuth, analysisRouter);
app.use("/recalls", requireAuth, recallRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`API listening on :${port}`));
