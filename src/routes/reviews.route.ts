// routes/reviews.route.ts
import express from "express";
import { reviewLimiter } from "../utils/limiters";
import * as reviewsController from "../controllers/reviews.controller";

const ReviewsRouter = express.Router();

// ─── Routes publiques ─────────────────────────────────────────────

// Soumission d'un avis (modéré : passe en statut 'pending')
ReviewsRouter.post("/", reviewLimiter, reviewsController.createReview);

// Stats publiques (note moyenne + nombre d'avis approuvés)
ReviewsRouter.get("/stats", reviewsController.getStats);

// Liste des avis approuvés récents (témoignages)
ReviewsRouter.get("/", reviewsController.listApproved);

export default ReviewsRouter;
