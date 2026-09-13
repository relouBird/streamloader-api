// controllers/payment-test.controller.ts
import { Request, Response } from "express";
import { activatePremium } from "../utils/premium";
import { payPage } from "../utils/payPage";

// Simule le webhook CinetPay pour tester activatePremium en local,
// sans dépendre d'un vrai paiement CinetPay.
export async function webhookCinetpayTest(req: Request, res: Response) {
  const { transaction_id } = req.body;
  if (!transaction_id)
    return res.status(400).json({ error: "transaction_id manquant" });

  await activatePremium(transaction_id);
  res.json({ success: true, simulated: true });
}

export function success(_req: Request, res: Response) {
  res.send(
    payPage(
      "✅",
      "Paiement réussi !",
      "Compte Premium activé. Retour au site…",
      "/?premium=success",
    ),
  );
}

export function cancel(_req: Request, res: Response) {
  res.send(
    payPage("❌", "Paiement annulé", "Tu seras redirigé dans 3 secondes…", "/"),
  );
}
