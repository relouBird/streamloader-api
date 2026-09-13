// controllers/reviews.controller.ts
import type { Request, Response } from "express";
import { queries } from "../database/queries";

// ─────────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────────

// Filet supplémentaire au-delà du rate limiter (survit à un redémarrage du
// serveur, contrairement au compteur en mémoire d'express-rate-limit).
const MAX_PENDING_REVIEWS_PER_DAY = 5;
const MAX_COMMENT_LENGTH = 500;
const DEFAULT_LIST_LIMIT = 10;
const MAX_LIST_LIMIT = 50;

// ─────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────

/** `?limit=...` → entier borné entre 1 et MAX_LIST_LIMIT. */
function parseLimit(raw: unknown): number {
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(n, 1), MAX_LIST_LIMIT);
}

/** `req.params.id` → entier positif, ou null si invalide. */
function parseId(raw: unknown): number | null {
  const n = typeof raw === "string" ? parseInt(raw, 10) : Number.NaN;
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

// ─────────────────────────────────────────────────────────────────
//  PUBLIC — POST /api/reviews
// ─────────────────────────────────────────────────────────────────

export async function createReview(req: Request, res: Response) {
  const { rating, comment } = req.body ?? {};

  // Rating : 1 à 5, entier strict
  const ratingNum = Number(rating);
  if (
    !Number.isInteger(ratingNum) ||
    ratingNum < 1 ||
    ratingNum > 5
  ) {
    return res
      .status(400)
      .json({ error: "Note invalide (1 à 5 étoiles)." });
  }

  // Commentaire : tronqué à 500 caractères, null si absent
  const cleanComment =
    typeof comment === "string" && comment.trim().length > 0
      ? comment.trim().slice(0, MAX_COMMENT_LENGTH)
      : null;

  // Client anonyme identifié par IP (les avis sont ouverts sans compte)
  const clientKey = `ip:${req.ip ?? "unknown"}`;

  // Garde-fou base de données (résistant au redémarrage du process)
  const pendingToday = await queries.countPendingReviewsToday(clientKey);
  if (pendingToday >= MAX_PENDING_REVIEWS_PER_DAY) {
    return res.status(429).json({
      error: "Trop d'avis envoyés depuis cette adresse aujourd'hui.",
    });
  }

  await queries.createReview(clientKey, ratingNum, cleanComment ?? "");

  return res.status(201).json({
    success: true,
    message: "Merci ! Ton avis sera visible après validation.",
  });
}

// ─────────────────────────────────────────────────────────────────
//  PUBLIC — GET /api/reviews/stats
// ─────────────────────────────────────────────────────────────────

export async function getStats(_req: Request, res: Response) {
  const stats = await queries.getReviewStats();
  return res.json({
    count: stats.count ?? 0,
    // `average` est null s'il n'y a aucun avis approuvé
    average:
      stats.count > 0 && stats.average != null
        ? Math.round(stats.average * 10) / 10
        : null,
  });
}

// ─────────────────────────────────────────────────────────────────
//  PUBLIC — GET /api/reviews
// ─────────────────────────────────────────────────────────────────

export async function listApproved(req: Request, res: Response) {
  const limit = parseLimit(req.query.limit);
  const reviews = await queries.listApprovedReviews(limit);
  return res.json({ reviews });
}

// ─────────────────────────────────────────────────────────────────
//  ADMIN — GET /api/admin/reviews/pending
// ─────────────────────────────────────────────────────────────────

export async function listPending(_req: Request, res: Response) {
  const reviews = await queries.listPendingReviews();
  return res.json({ reviews });
}

// ─────────────────────────────────────────────────────────────────
//  ADMIN — POST /api/admin/reviews/:id/approve
// ─────────────────────────────────────────────────────────────────

export async function approve(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "ID d'avis invalide." });
  }
  await queries.approveReview(id);
  return res.json({ success: true });
}

// ─────────────────────────────────────────────────────────────────
//  ADMIN — POST /api/admin/reviews/:id/reject
// ─────────────────────────────────────────────────────────────────

export async function reject(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "ID d'avis invalide." });
  }
  await queries.rejectReview(id);
  return res.json({ success: true });
}