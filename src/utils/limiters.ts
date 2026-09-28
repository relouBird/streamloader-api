// utils/limiters.ts
import rateLimit from "express-rate-limit";

// Limiteur analyse — 15 analyses par minute par IP
export const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: "Trop d'analyses. Attends 1 minute." },
  keyGenerator: (req) => req.ip ?? "",
});

// Limiteur téléchargement — 8 téléchargements par minute par IP
export const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  message: { error: "Trop de téléchargements. Attends 1 minute." },
  keyGenerator: (req) => req.ip ?? "",
});

// Limiteur authentification — anti-brute force
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Trop de tentatives. Réessaie dans 15 minutes." },
  skipSuccessfulRequests: true,
});

export const reviewLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  message: { error: "Trop d'avis envoyés depuis cette adresse aujourd'hui." },
  keyGenerator: (req) => req.ip ?? "",
});

// Limiteur de l'API externe Premium (/api/v1/*) — basé sur la clé API et non
// l'IP, pour ne pas pénaliser un intégrateur dont le trafic sort d'une IP
// partagée (backend d'entreprise, proxy, etc.).
export const apiKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Trop de requêtes API. Réessaie dans 1 minute." },
  keyGenerator: (req) => req.get("x-api-key") || req.ip || "",
});
