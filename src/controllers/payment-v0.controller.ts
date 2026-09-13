// controllers/payment.controller.ts
import { Request, Response } from "express";
import axios from "axios";
import { v4 as uuid } from "uuid";
import { queries } from "../database/queries";
import { activatePremium } from "../utils/premium";

const APP_URL = process.env.APP_URL || "";
const IS_PROD = process.env.NODE_ENV === "production";
const PRICE_FCFA = Number(process.env.PRICE_FCFA || 1200);

// ── Prestataires de paiement (portés depuis server.js) ─────────────

async function initCinetPay(txId: string, user: any, phone?: string) {
  const apikey = process.env.CINETPAY_API_KEY;
  const site_id = process.env.CINETPAY_SITE_ID;
  if (!apikey || !site_id)
    throw new Error(
      "CinetPay non configuré. Ajoute CINETPAY_API_KEY + CINETPAY_SITE_ID dans .env",
    );

  const body: any = {
    apikey,
    site_id,
    transaction_id: txId,
    amount: PRICE_FCFA,
    currency: "XAF",
    description: "StreamLoader Premium — Accès à vie",
    notify_url: `${APP_URL}/api/payment/webhook/cinetpay`,
    return_url: `${APP_URL}/payment/success?tx=${txId}`,
    cancel_url: `${APP_URL}/payment/cancel?tx=${txId}`,
    customer_email: user.email,
    customer_name: user.email.split("@")[0],
    channels: "ALL",
  };
  if (phone)
    Object.assign(body, {
      customer_phone_number: phone,
      customer_country: "CM",
    });

  const r = await axios.post(
    "https://api-checkout.cinetpay.com/v2/payment",
    body,
    { timeout: 10_000 },
  );
  if (r.data.code !== "201") throw new Error("CinetPay : " + r.data.message);
  return r.data.data.payment_url;
}

async function initCampay(txId: string, user: any, phone?: string) {
  const { CAMPAY_USERNAME: username, CAMPAY_PASSWORD: password } = process.env;
  if (!username || !password)
    throw new Error(
      "Campay non configuré. Ajoute CAMPAY_USERNAME + CAMPAY_PASSWORD dans .env",
    );

  const host = IS_PROD ? "https://campay.net" : "https://demo.campay.net";
  const auth = await axios.post(
    `${host}/api/token/`,
    { username, password },
    { timeout: 8_000 },
  );
  const tok = auth.data.token;
  const col = await axios.post(
    `${host}/api/collect/`,
    {
      amount: String(PRICE_FCFA),
      currency: "XAF",
      from: phone || "",
      description: "StreamLoader Premium",
      external_reference: txId,
      redirect_url: `${APP_URL}/payment/success?tx=${txId}`,
    },
    { headers: { Authorization: "Token " + tok }, timeout: 8_000 },
  );
  return (
    col.data.payment_url ||
    col.data.link ||
    `${APP_URL}/payment/campay?tx=${txId}`
  );
}

async function initWave(txId: string) {
  const apiKey = process.env.WAVE_API_KEY;
  if (!apiKey)
    throw new Error("Wave non configuré. Ajoute WAVE_API_KEY dans .env");
  const r = await axios.post(
    "https://api.wave.com/v1/checkout/sessions",
    {
      amount: String(PRICE_FCFA),
      currency: "XOF",
      error_url: `${APP_URL}/payment/cancel?tx=${txId}`,
      success_url: `${APP_URL}/payment/success?tx=${txId}`,
      client_reference: txId,
    },
    { headers: { Authorization: "Bearer " + apiKey }, timeout: 8_000 },
  );
  return r.data.wave_launch_url;
}

// ── Handlers ────────────────────────────────────────────────────

export async function initiate(req: Request, res: Response) {
  const { provider = "cinetpay", phone } = req.body;
  const user = (req as any).user;
  const txId = "SL-" + uuid().replace(/-/g, "").slice(0, 16).toUpperCase();

  try {
    await queries.createTransaction(
      txId,
      user.id,
      provider,
      PRICE_FCFA,
      "monthly",
    );

    let payment_url: string;
    if (provider === "cinetpay")
      payment_url = await initCinetPay(txId, user, phone);
    else if (provider === "campay")
      payment_url = await initCampay(txId, user, phone);
    else if (provider === "wave") payment_url = await initWave(txId);
    else return res.status(400).json({ error: "Fournisseur invalide" });

    res.json({ success: true, payment_url, transaction_id: txId });
  } catch (e: any) {
    console.error("[PAYMENT]", e.message);
    res.status(500).json({ error: e.message });
  }
}

export async function webhookCinetpay(req: Request, res: Response) {
  const { cpm_trans_id, cpm_result, cpm_trans_status } = req.body;
  try {
    if (cpm_result === "00" || cpm_trans_status === "ACCEPTED") {
      const check = await axios.post(
        "https://api-checkout.cinetpay.com/v2/payment/check",
        {
          apikey: process.env.CINETPAY_API_KEY,
          site_id: process.env.CINETPAY_SITE_ID,
          transaction_id: cpm_trans_id,
        },
        { timeout: 8_000 },
      );
      if (check.data.data?.status === "ACCEPTED")
        await activatePremium(cpm_trans_id);
    }
  } catch (e: any) {
    console.error("[CinetPay Webhook]", e.message);
  }
  res.json({ code: 0 });
}

export async function webhookCampay(req: Request, res: Response) {
  if (req.body.status === "SUCCESSFUL")
    await activatePremium(req.body.reference);
  res.json({ status: "OK" });
}

export async function webhookWave(req: Request, res: Response) {
  if (req.body.checkout_status === "complete")
    await activatePremium(req.body.client_reference);
  res.json({ status: "OK" });
}

export async function status(req: Request, res: Response) {
  const user = (req as any).user;
  const tx = await queries.getTransaction(req.params.txId);
  if (!tx || tx.user_id !== user.id)
    return res.status(404).json({ error: "Transaction introuvable" });
  res.json({ status: tx.status, is_premium: tx.status === "completed" });
}
