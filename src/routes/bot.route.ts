import express from "express";
import { botAuth, requireBotServiceToken } from "../utils/helper";
import {
  analyzeLimiter,
  botSessionLimiter,
  downloadLimiter,
} from "../utils/limiters";
import { requireSiteOfferSecret } from "../utils/helper";
import * as botController from "../controllers/bot.controller";
import * as mediaController from "../controllers/media.controller";

const BotRouter = express.Router();

BotRouter.post(
  "/session",
  botSessionLimiter,
  requireBotServiceToken,
  botController.exchangeSession,
);
BotRouter.post(
  "/link",
  botSessionLimiter,
  requireBotServiceToken,
  botController.linkAccount,
);
BotRouter.post("/site-offer", botAuth, botController.siteOffer);

BotRouter.post(
  "/verify-offer",
  requireSiteOfferSecret,
  botController.verifyOffer,
);
BotRouter.get("/me", botAuth, botController.me);

BotRouter.get(
  "/media/analyze",
  analyzeLimiter,
  botAuth,
  mediaController.analyze,
);
BotRouter.post(
  "/media/download/start",
  downloadLimiter,
  botAuth,
  mediaController.downloadStart,
);
BotRouter.post(
  "/media/music/start",
  downloadLimiter,
  botAuth,
  mediaController.musicStart,
);
BotRouter.get("/media/progress/:jobId", botAuth, mediaController.progress);
BotRouter.get("/media/file/:jobId", botAuth, mediaController.file);

export default BotRouter;
