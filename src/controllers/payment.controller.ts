// controllers/payment.controller.ts
import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";
import ENV from "../config/env";
import { queries } from "../database/queries";
import { getPlanAmount } from "../utils/helper";
import { payPage } from "../utils/payPage";
import {
  initGeniusPay,
  activatePremium,
  verifyGeniusPaySignature,
  isWebhookTimestampFresh,
} from "../services/genius-pay.service";
import type { GeniusPayWebhookPayload } from "../types/geniuspay.type";

// ─────────────────────────────────────────────────────────────────
//  POST /api/payment/initiate
// ─────────────────────────────────────────────────────────────────

export async function initiate(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Non authentifié" });
  }

  const {
    provider = "geniuspay",
    currency = "XAF",
    plan = "monthly",
  } = req.body ?? {};

  if (provider !== "geniuspay") {
    return res
      .status(400)
      .json({ error: "Prestataire de paiement non supporté" });
  }

  const normalizedCurrency = String(currency).toUpperCase();
  const amount = getPlanAmount(plan, normalizedCurrency);
  if (amount === null) {
    return res.status(400).json({ error: "Forfait ou monnaie non supporté" });
  }

  const txId = "SL-" + uuid().replace(/-/g, "").slice(0, 16).toUpperCase();
  await queries.createTransaction(
    txId,
    req.user.id,
    provider,
    amount,
    currency,
    plan,
  );

  try {
    const payment_url = await initGeniusPay(
      txId,
      req.user,
      amount,
      normalizedCurrency === "XAF" ? "XOF" : normalizedCurrency,
    );
    return res.json({
      success: true,
      payment_url,
      transaction_id: txId,
      currency: normalizedCurrency,
      amount,
      plan,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Paiement indisponible.";
    console.error("[GENIUSPAY INITIATE]", message);
    const status = message.startsWith("Paiement indisponible") ? 503 : 500;
    return res.status(status).json({ error: message });
  }
}

// ─────────────────────────────────────────────────────────────────
//  POST /api/payment/webhook/geniuspay
//  Pas d'auth JWT : c'est GeniusPay qui appelle. La sécurité repose
//  entièrement sur la vérification HMAC + timestamp ci-dessous.
// ─────────────────────────────────────────────────────────────────

export async function geniuspayWebhook(req: Request, res: Response) {
  // ⬇️ AJOUT : identifie la requête (timestamp + headers signature/event/env)
  console.log(
    `\n[Webhook] ${new Date().toISOString()} sig=${req.get("X-Webhook-Signature")?.slice(0, 12) ?? "ABSENT"}… event=${req.get("X-Webhook-Event") ?? "—"} env=${req.get("X-Webhook-Environment") ?? "—"}`,
  );

  // 1. Signature HMAC-SHA256 (timestamp + "." + payload brut)
  if (!verifyGeniusPaySignature(req)) {
    return res.status(401).json({ error: "Signature webhook invalide" });
  }

  // 2. Anti-replay (±5 min)
  if (!isWebhookTimestampFresh(req)) {
    return res.status(400).json({ error: "Timestamp trop ancien" });
  }

  // 3. Payload typé
  const payload = req.body as GeniusPayWebhookPayload;

  // 4. Traitement — on répond TOUJOURS 200 pour éviter les retries inutiles
  //    de GeniusPay, sauf erreur vraiment fatale.
  try {
    switch (payload.event) {
      case "payment.success": {
        await activatePremium(
          (payload.data.metadata as any).txId,
          payload.data.amount,
        );
        break;
      }
      case "payment.failed":
      case "payment.cancelled":
      case "payment.expired": {
        // Optionnel : marquer la transaction en 'failed' en DB.
        await queries.failTransaction(payload.data.reference);
        break;
      }
      case "payment.refunded": {
        // Optionnel : downgrade de l'utilisateur (politique commerciale à définir).
        break;
      }
      default:
        // webhook.test, cashout.*, etc. → on ignore silencieusement.
        break;
    }
  } catch (e) {
    // On loggue mais on n'expose jamais l'erreur à GeniusPay (il déclencherait
    // un retry alors que notre webhook a bien été reçu).
    console.error("[GeniusPay Webhook]", e);
  }

  return res.json({ received: true });
}

// ─────────────────────────────────────────────────────────────────
//  GET /api/payment/status/:txId
// ─────────────────────────────────────────────────────────────────

export async function getStatus(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Non authentifié" });
  }

  const tx = await queries.getTransaction(req.params.txId);
  if (!tx || tx.user_id !== req.user.id) {
    return res.status(404).json({ error: "Transaction introuvable" });
  }
  return res.json({
    status: tx.status,
    is_premium: tx.status === "completed",
  });
}

// ─────────────────────────────────────────────────────────────────
//  Routes de retour utilisateur
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
//  ⚠️ Route de TEST — À SUPPRIMER EN PRODUCTION
// ─────────────────────────────────────────────────────────────────
// Cette route activait Premium sans aucune vérification de paiement. Elle
// est dangereuse et n'a plus sa place dans le code TS : garde-la uniquement
// derrière un flag NODE_ENV !== "production" si tu en as vraiment besoin.
export async function webhookTest(req: Request, res: Response) {
  if (ENV.IS_PROD) {
    return res.status(404).json({ error: "Not found" });
  }
  const { transaction_id } = req.body ?? {};
  if (!transaction_id) {
    return res.status(400).json({ error: "transaction_id manquant" });
  }
  await activatePremium(transaction_id);
  return res.json({ success: true, simulated: true });
}
