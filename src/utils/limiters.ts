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
