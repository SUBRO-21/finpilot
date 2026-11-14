import { prisma } from "@finos/db";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, signToken, type AuthedRequest } from "../auth";

export const authRouter = Router();

const reg = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  openingBalance: z.number().default(0),
});

authRouter.post("/register", async (req, res) => {
  const p = reg.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Enter a valid email, a name, and a password of 8+ characters" });
  const email = p.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: "An account with this email already exists" });
  const user = await prisma.user.create({
    data: { email, name: p.data.name, openingBalance: p.data.openingBalance, passwordHash: await bcrypt.hash(p.data.password, 10) },
  });
  res.json({ token: signToken(user.id), user: { id: user.id, name: user.name, email } });
});

authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(String(req.body?.password ?? ""), user.passwordHash)))
    return res.status(401).json({ error: "Email or password is incorrect" });
  res.json({ token: signToken(user.id), user: { id: user.id, name: user.name, email } });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: (req as AuthedRequest).userId } });
  res.json({ id: u.id, name: u.name, email: u.email, openingBalance: u.openingBalance });
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const ob = z.number().safeParse(req.body?.openingBalance);
  if (!ob.success) return res.status(400).json({ error: "openingBalance must be a number" });
  const u = await prisma.user.update({ where: { id: (req as AuthedRequest).userId }, data: { openingBalance: ob.data } });
  res.json({ openingBalance: u.openingBalance });
});
