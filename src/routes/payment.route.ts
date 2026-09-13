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
  paymentTestController.webhookCinetpayTest,
);

PaymentTestRouter.post(
  "/webhook/geniuspay",
  paymentTestController.webhookCinetpayTest,
);

PaymentTestRouter.post(
  "/statut/:txId",
  authMiddleware,
  paymentTestController.webhookCinetpayTest,
);

// GET : ce sont des pages de retour (redirection navigateur), pas des soumissions
PaymentTestRouter.get("/success", paymentTestController.success);

PaymentTestRouter.get("/cancel", paymentTestController.cancel);

export default PaymentTestRouter;
