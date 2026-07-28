// routes/payment-test.route.ts
import express from "express";
import * as paymentTestController from "../controllers/payment-test.controller";

const PaymentTestRouter = express.Router();

PaymentTestRouter.post(
  "/webhook/cinetpay",
  paymentTestController.webhookCinetpayTest,
);

// GET : ce sont des pages de retour (redirection navigateur), pas des soumissions
PaymentTestRouter.get("/success", paymentTestController.success);

PaymentTestRouter.get("/cancel", paymentTestController.cancel);

export default PaymentTestRouter;
