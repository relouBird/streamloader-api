// routes/admin.route.ts
import express from "express";
import { requireAdminToken } from "../utils/helper";
import * as reviewsController from "../controllers/reviews.controller";

const AdminReviewRouter = express.Router();

// Toutes les routes admin exigent le header X-Admin-Token
AdminReviewRouter.use(requireAdminToken);

// ─── Modération des avis ──────────────────────────────────────────

AdminReviewRouter.get("/pending", reviewsController.listPending);
AdminReviewRouter.post("/:id/approve", reviewsController.approve);
AdminReviewRouter.post("/:id/reject", reviewsController.reject);

export default AdminReviewRouter;
