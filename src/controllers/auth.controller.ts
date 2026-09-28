// controllers/auth.controller.ts
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import ENV from "../config/env";
import { queries } from "../database/queries";
import { generateApiKey } from "../utils/helper";

const JWT_SECRET = ENV.JWT_SECRET;

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
      return res
        .status(409)
        .json({ error: "Un compte existe déjà avec cet email" });

    const hash = await bcrypt.hash(password, 12);
    const id = uuid();
    await queries.createUser(id, email.toLowerCase(), hash);

    const token = jwt.sign({ id }, JWT_SECRET, {
      expiresIn: "30d",
      algorithm: "HS256",
    });
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

    const token = jwt.sign({ id: user.id }, JWT_SECRET, {
      expiresIn: "30d",
      algorithm: "HS256",
    });
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        trim_trials_used: user.trim_trials_used,
        created_at: user.created_at,
      },
    });
  } catch (e: any) {
    console.error("[login]", e.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function me(req: Request, res: Response) {
  // req.user est déjà peuplé par authMiddleware
  res.json({ user: req.user });
}

// ─── Gestion de la clé API Premium (depuis le site, session JWT normale) ──

// Infos sur la clé actuelle (préfixe + date), jamais la clé en clair.
export async function getApiKeyInfo(req: Request, res: Response) {
  try {
    const info = await queries.getApiKeyInfo(req.user.id);
    res.status(200).json({
      hasKey: Boolean(info?.api_key_prefix),
      prefix: info?.api_key_prefix || null,
      createdAt: info?.api_key_created_at || null,
    });
  } catch (error: any) {
    console.error("[getApiKeyInfo]", error.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

// Génère (ou régénère) la clé — réservé aux abonnés Premium actifs.
// Régénérer invalide immédiatement l'ancienne clé (un seul hash stocké).
export async function createApiKey(req: Request, res: Response) {
  try {
    if (req.user.plan !== "premium") {
      return res.status(403).json({
        error: "La génération de clé API est réservée aux abonnés Premium.",
        code: "PREMIUM_REQUIRED",
      });
    }
    const { raw, hash, prefix } = generateApiKey();
    await queries.setApiKey(hash, prefix, req.user.id);

    // La clé en clair n'est renvoyée qu'ICI, une seule fois.
    res.json({ success: true, apiKey: raw, prefix });
  } catch (error: any) {
    console.error("[createApiKey]", error.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

// Suppression Clé d'api
export async function deleteApiKey(req: Request, res: Response) {
  try {
    await queries.revokeApiKey(req.user.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error("[deleteApiKey]", error.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
}
