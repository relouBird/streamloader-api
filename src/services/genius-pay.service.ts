// services/genius-pay.service.ts
import crypto from "crypto";
import axios from "axios";
import type { Request } from "express";
import ENV from "../config/env";
import type { UserPublic } from "../types/database.type";
import { queries } from "../database/queries";
import { CONSTANTS } from "../constants";

const API_URL = ENV.API_URL;
const PAYMENT_API_URL = ENV.GENIUSPAY_API_URL;
const API_KEY = ENV.GENIUSPAY_API_KEY;
const API_SECRET = ENV.GENIUSPAY_API_SECRET;
const WEBHOOK_SECRET = ENV.GENIUSPAY_WEBHOOK_SECRET;

const MAX_WEBHOOK_AGE_SECONDS = 300; // 5 min (doc GeniusPay)

// ─────────────────────────────────────────────────────────────────
//  Initiation d'un paiement
// ─────────────────────────────────────────────────────────────────

export async function initGeniusPay(
  txId: string,
  user: UserPublic,
  amount: number = CONSTANTS.PRICE_FCFA,
  currency = "XAF",
): Promise<string> {
  if (!API_KEY) {
    throw new Error(
      "Paiement indisponible : les clés GeniusPay ne sont pas configurées.",
    );
  }

  try {
    const response = await axios.post(
      PAYMENT_API_URL,
      {
        amount: Number(amount),
        currency: String(currency).toUpperCase(),
        description: "StreamLoader Premium — Abonnement sélectionné",
        reference: txId,
        customer_email: user.email,
        customer_name: user.email.split("@")[0],
        callback_url: `${API_URL}/api/payment/webhook/geniuspay`,
        return_url: `${API_URL}/payment/success?tx=${txId}`,
        cancel_url: `${API_URL}/payment/cancel?tx=${txId}`,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "X-Secret-Key": API_SECRET,
          "Content-Type": "application/json",
        },
        timeout: 10_000,
      },
    );

    // Selon la doc, la réponse peut être wrappée dans `data` ou à plat.
    const body = response.data ?? {};
    const payload = body.data ?? body;
    const url =
      payload.checkout_url ?? payload.payment_url ?? payload.url ?? null;

    if (!url) {
      console.error("[GeniusPay] Réponse inattendue :", body);
      throw new Error(
        "Paiement momentanément indisponible, réessaie plus tard.",
      );
    }
    return url as string;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.warn("[GeniusPay API Call]", err.response?.data ?? err.message);
    } else {
      console.warn("[GeniusPay API Call]", err);
    }
    throw new Error("Paiement momentanément indisponible, réessaie plus tard.");
  }
}

// ─────────────────────────────────────────────────────────────────
//  Vérification de signature webhook
// ─────────────────────────────────────────────────────────────────

/**
 * Doc GeniusPay :
 *   signature = HMAC-SHA256(timestamp + "." + raw_payload, WEBHOOK_SECRET)
 *   header    = X-Webhook-Signature (hex)
 *   timestamp = header X-Webhook-Timestamp (secondes Unix)
 *
 * Le body doit être lu BRUT (req.rawBody), pas ré-sérialisé via JSON.stringify.
 */
export function verifyGeniusPaySignature(req: Request): boolean {
  const signature = (req.get("X-Webhook-Signature") ?? "").trim();
  const timestamp = (req.get("X-Webhook-Timestamp") ?? "").trim();

  if (!WEBHOOK_SECRET || !signature || !timestamp || !req.rawBody) {
    return false;
  }

  const data = `${timestamp}.${req.rawBody.toString("utf8")}`;
  const expectedHex = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(data)
    .digest("hex");

  const received = Buffer.from(signature, "hex");
  const expected = Buffer.from(expectedHex, "hex");

  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(received, expected);
}

/**
 * Anti-replay : le timestamp doit être dans la fenêtre ±5 min.
 */
export function isWebhookTimestampFresh(req: Request): boolean {
  const raw = req.get("X-Webhook-Timestamp");
  if (!raw) return false;
  const ts = parseInt(raw, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= MAX_WEBHOOK_AGE_SECONDS;
}

// ─────────────────────────────────────────────────────────────────
//  Activation Premium (idempotente)
// ─────────────────────────────────────────────────────────────────

export async function activatePremium(
  txId: string,
  reportedAmount?: number | null,
): Promise<void> {
  const tx = await queries.getTransaction(txId);
  if (!tx) {
    console.warn(`[PREMIUM] Transaction introuvable : ${txId}`);
    return;
  }
  // Idempotence : si déjà complétée, on ne refait rien.
  if (tx.status === "completed") return;

  // Défense en profondeur : le montant du webhook doit correspondre à celui
  // enregistré côté serveur lors de l'initiation.
  if (reportedAmount != null && Number(reportedAmount) !== Number(tx.amount)) {
    console.error(
      `[PREMIUM] Montant webhook (${reportedAmount}) ≠ attendu (${tx.amount}) pour tx:${txId} — refusé.`,
    );
    return;
  }

  await queries.completeTransaction(txId);

  const plan = tx.plan as keyof typeof CONSTANTS.SUBSCRIPTION_PLANS;
  const months = CONSTANTS.SUBSCRIPTION_PLANS[plan]?.months ?? 1;
  await queries.upgradeToPremium(tx.user_id, months);

  console.log(
    `[PREMIUM] Activé — user:${tx.user_id} tx:${txId} (${months} mois)`,
  );
}
