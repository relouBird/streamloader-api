// routes/media.route.ts
import express from "express";
import { analyzeLimiter, downloadLimiter } from "../utils/limiters";
import { optionalAuth } from "../utils/helper";
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

// GET : consommé côté client via EventSource (SSE), qui ne fait que du GET
MediaRouter.get("/progress/:jobId", mediaController.progress);

// GET : sert un fichier / déclenche un download navigateur
MediaRouter.get("/file/:jobId", mediaController.file);

export default MediaRouter;
