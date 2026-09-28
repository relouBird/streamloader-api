// routes/media.route.ts
import express from "express";
import {
  analyzeLimiter,
  apiKeyLimiter,
  downloadLimiter,
} from "../utils/limiters";
import { optionalAuth, verifyPremiumApiKey } from "../utils/helper";
import * as mediaController from "../controllers/media.controller";

const MediaRouter = express.Router();

MediaRouter.get(
  "/analyze",
  analyzeLimiter,
  optionalAuth,
  mediaController.analyze,
);

MediaRouter.post(
  "/download/start",
  downloadLimiter,
  optionalAuth,
  mediaController.downloadStart,
);

MediaRouter.post(
  "/music/start",
  downloadLimiter,
  optionalAuth,
  mediaController.musicStart,
);

// GET : consommé côté client via EventSource (SSE), qui ne fait que du GET
MediaRouter.get("/progress/:jobId", mediaController.progress);

// GET : sert un fichier / déclenche un download navigateur
MediaRouter.get("/file/:jobId", mediaController.file);

// ─────────────────────────────────────────────────────────────────
//  API EXTERNE PREMIUM (/api/v1/*) — authentification par clé API
// ─────────────────────────────────────────────────────────────────

MediaRouter.get(
  "/v1/analyze",
  apiKeyLimiter,
  verifyPremiumApiKey,
  mediaController.analyze,
);

MediaRouter.get(
  "/v1/download",
  apiKeyLimiter,
  verifyPremiumApiKey,
  mediaController.downloadStart,
);

MediaRouter.get(
  "/download/:jobId",
  apiKeyLimiter,
  verifyPremiumApiKey,
  mediaController.progress,
);

MediaRouter.get(
  "/download/:jobId/file",
  apiKeyLimiter,
  verifyPremiumApiKey,
  mediaController.file,
);

export default MediaRouter;
