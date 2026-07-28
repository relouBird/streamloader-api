// routes/payment.route.ts
import express from "express";
import { downloadLimiter } from "../utils/limiters";
import { authMiddleware } from "../utils/helper";
import * as paymentController from "../controllers/payment.controller";

const PaymentRouter = express.Router();

PaymentRouter.post(
  "/initiate",
  authMiddleware,
  downloadLimiter,
  paymentController.initiate,
);

// Les webhooks restent en POST (appelés par les prestataires de paiement, pas par le navigateur)
PaymentRouter.post("/webhook/cinetpay", paymentController.webhookCinetpay);

// ⚠️ manquait dans le router d'origine (présent dans server.js) — rajouté
PaymentRouter.post("/webhook/campay", paymentController.webhookCampay);

PaymentRouter.post("/webhook/wave", paymentController.webhookWave);

// GET : simple lecture de statut
PaymentRouter.get("/status/:txId", authMiddleware, paymentController.status);

export default PaymentRouter;
