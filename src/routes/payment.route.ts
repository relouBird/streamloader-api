// routes/payment-test.route.ts
import express from "express";
import * as paymentTestController from "../controllers/payment.controller";
import { authMiddleware } from "../utils/helper";
import { downloadLimiter } from "../utils/limiters";

const PaymentTestRouter = express.Router();

PaymentTestRouter.post(
  "/initiate",
  authMiddleware,
  downloadLimiter,
  paymentTestController.initiate,
);

PaymentTestRouter.post(
  "/webhook/geniuspay",
  paymentTestController.geniuspayWebhook,
);

PaymentTestRouter.post(
  "/statut/:txId",
  authMiddleware,
  paymentTestController.getStatus,
);

// GET : ce sont des pages de retour (redirection navigateur), pas des soumissions
PaymentTestRouter.get("/success", paymentTestController.success);

PaymentTestRouter.get("/cancel", paymentTestController.cancel);

export default PaymentTestRouter;
