// utils/helper.ts
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import net from "net";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";
import { promises } from "dns";
import ENV from "../config/env";
import { queries } from "../database/queries";
import { CONSTANTS } from "../constants";
import { VideoServiceErrorResponse } from "../types/videoService.type";

dotenv.config();

const JWT_VERIFY_OPTS: jwt.VerifyOptions = { algorithms: ["HS256"] };
const JWT_SECRET = ENV.JWT_SECRET;
const ADMIN_TOKEN = ENV.ADMIN_TOKEN;

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
    const p = jwt.verify(
      h.split(" ")[1],
      JWT_SECRET,
      JWT_VERIFY_OPTS,
    ) as jwt.JwtPayload;
    const u = await queries.getUserById(p.id);
    if (!u) return res.status(401).json({ error: "Compte introuvable" });
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) {
    try {
      const p = jwt.verify(
        h.split(" ")[1],
        JWT_SECRET,
        JWT_VERIFY_OPTS,
      ) as jwt.JwtPayload;
      req.user = (await queries.getUserById(p.id)) || null;
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

/**
 * Protège les routes de modération des avis. Comparaison en temps constant
 * (comme pour la signature webhook) pour éviter une fuite d'information par
 * timing sur le jeton admin.
 */
export function requireAdminToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const provided = req.get("x-admin-token") || "";
  if (!ADMIN_TOKEN || !provided)
    return res.status(401).json({ error: "Non autorisé" });
  const a = Buffer.from(provided);
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Non autorisé" });
  }
  next();
}

/**
 * Comme optionalAuth, mais accepte aussi le token via ?token=... en plus du
 * header Authorization. Nécessaire pour /api/progress/:jobId (EventSource) et
 * /api/file/:jobId (lien <a href>) : ces deux appels du frontend ne peuvent
 * pas envoyer de header Authorization personnalisé (limitation native de
 * EventSource et de la navigation via <a>), donc s'appuyer uniquement sur le
 * header casserait le contrôle de propriété pour tout utilisateur connecté.
 */
export async function optionalAuthHeaderOrQuery(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.split(" ")[1]
    : null;
  const token = bearer || String(req.query.token) || null;
  if (token) {
    try {
      const p = jwt.verify(
        token,
        JWT_SECRET,
        JWT_VERIFY_OPTS,
      ) as jwt.JwtPayload;
      req.user = (await queries.getUserById(p.id)) || null;
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

// ─────────────────────────────────────────────────────────────────
//  FUNCTION HELPERS
// ─────────────────────────────────────────────────────────────────
export const isWeakSecret = (s: string | any) =>
  !s || s.length < 32 || /change[_-]?me|CHANGE_MOI|placeholder/i.test(s);

// Permet de recuperer le prix du plan premium en fonction de la monnaie utiliser
export function getPlanAmount(plan: string, currency: string) {
  const selectedPlan =
    CONSTANTS.SUBSCRIPTION_PLANS[
      plan as keyof typeof CONSTANTS.SUBSCRIPTION_PLANS
    ];
  const rate =
    CONSTANTS.CURRENCY_RATES[currency as keyof typeof CONSTANTS.CURRENCY_RATES];
  if (!selectedPlan || !rate) return null;
  const amount = selectedPlan.usd * rate;
  return currency === "USD" ||
    currency === "EUR" ||
    currency === "GBP" ||
    currency === "CAD" ||
    currency === "CHF"
    ? Math.round(amount * 100) / 100
    : Math.round(amount);
}

export function getTargetHeight(quality: string) {
  return (
    (
      {
        "4k": 2160,
        "2160p": 2160,
        "1440p": 1440,
        "1080p": 1080,
        "720p": 720,
        "480p": 480,
        "360p": 360,
      } as Record<string, number>
    )[quality] || 1080
  );
}

/**
 * Protection SSRF : rejette les URL pointant vers une IP privée/réservée
 * (loopback, réseaux privés RFC1918, link-local — dont 169.254.169.254 utilisé
 * par les métadonnées cloud AWS/GCP/Azure). yt-dlp effectue une vraie requête
 * HTTP sortante depuis ce serveur vers l'URL fournie par le client : sans ce
 * filtre, n'importe qui pourrait sonder le réseau interne ou les endpoints de
 * métadonnées cloud via /api/analyze ou /api/download/start.
 */
export function isPrivateOrReservedIP(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || a >= 224) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    )
      return true;
    if (lower.startsWith("::ffff:"))
      return isPrivateOrReservedIP(lower.slice(7));
    return false;
  }
  return true; // format inconnu : on bloque par prudence
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL invalide");
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("URL invalide");

  let addresses: { address: string }[];
  try {
    const results = await promises.lookup(parsed.hostname, { all: true });
    addresses = Array.isArray(results) ? results : [results];
  } catch {
    throw new Error("URL invalide");
  }

  const isPrivate = addresses.some((a) => isPrivateOrReservedIP(a.address));
  if (isPrivate) throw new Error("URL invalide");
  
  return parsed;
}

/** "MM:SS" ou "H:MM:SS" → secondes. `null` si invalide. */
export function parseTimeToSeconds(t: unknown): number | null {
  if (typeof t !== "string") return null;
  const parts = t.trim().split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/**
 * Normalise une erreur (axios ou autre) en `{ status, message, code? }`.
 */
export function normalizeError(e: unknown): {
  status: number;
  message: string;
  code?: string;
} {
  if (axios.isAxiosError<VideoServiceErrorResponse>(e)) {
    const status = e.response?.status ?? 502;
    const message = e.response?.data?.error ?? "Service vidéo indisponible.";
    const code = e.response?.data?.code;
    return code ? { status, message, code } : { status, message };
  }
  if (e instanceof Error) return { status: 500, message: e.message };
  return { status: 500, message: "Erreur inconnue." };
}

/** `?url=x&url=y` renvoie un array : on ne garde que le premier string. */
export function firstString(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

const SAFE_TITLE_RE = /[^a-zA-Z0-9\s\-_àâäéèêëîïôöùûüç]/g;

/** Miroir de sanitize_title() côté Python — même règles, même résultat. */
export function sanitizeTitle(title: string | undefined | null): string {
  const cleaned = (title || "video").replace(SAFE_TITLE_RE, "").trim();
  return cleaned.slice(0, 80) || "video";
}
