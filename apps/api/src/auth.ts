import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const secret = () => process.env.JWT_SECRET ?? "dev-secret";

export const signToken = (userId: string) => jwt.sign({ sub: userId }, secret(), { expiresIn: "7d" });

export interface AuthedRequest extends Request {
  userId: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in required" });
  try {
    const p = jwt.verify(h.slice(7), secret()) as { sub: string };
    (req as AuthedRequest).userId = p.sub;
    next();
  } catch {
    res.status(401).json({ error: "Session expired, please sign in again" });
  }
}
