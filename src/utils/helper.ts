// utils/helper.ts
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { queries } from "../database/queries";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "";

// ─────────────────────────────────────────────────────────────────
//  AUTH HELPERS
//  ⚠️ queries.getUserById est async (mysql2/promise) → il faut await
// ─────────────────────────────────────────────────────────────────

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer "))
    return res.status(401).json({ error: "Non authentifié" });
  try {
    const p = jwt.verify(h.split(" ")[1], JWT_SECRET) as jwt.JwtPayload;
    const u = await queries.getUserById(p.id);
    if (!u) return res.status(401).json({ error: "Compte introuvable" });
    (req as any).user = u;
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) {
    try {
      const p = jwt.verify(h.split(" ")[1], JWT_SECRET) as jwt.JwtPayload;
      (req as any).user = (await queries.getUserById(p.id)) || null;
    } catch {
      (req as any).user = null;
    }
  } else {
    (req as any).user = null;
  }
  next();
}