// controllers/auth.controller.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { queries } from "../database/queries";

const JWT_SECRET = process.env.JWT_SECRET || "";

export async function register(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email et mot de passe requis" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "Email invalide" });
  if (password.length < 6)
    return res.status(400).json({ error: "Mot de passe min 6 caractères" });

  try {
    const existing = await queries.getUserByEmail(email.toLowerCase());
    if (existing)
      return res.status(409).json({ error: "Un compte existe déjà avec cet email" });

    const hash = await bcrypt.hash(password, 12);
    const id = uuid();
    await queries.createUser(id, email.toLowerCase(), hash);

    const token = jwt.sign({ id }, JWT_SECRET, { expiresIn: "30d" });
    const user = await queries.getUserById(id);

    res.status(201).json({ success: true, token, user });
  } catch (e: any) {
    console.error("[register]", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Champs requis" });

  try {
    const user = await queries.getUserByEmail(email.toLowerCase());
    const valid = user && (await bcrypt.compare(password, user.password));
    if (!valid)
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, plan: user.plan, created_at: user.created_at },
    });
  } catch (e: any) {
    console.error("[login]", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function me(req: Request, res: Response) {
  // req.user est déjà peuplé par authMiddleware
  res.json({ user: (req as any).user });
}