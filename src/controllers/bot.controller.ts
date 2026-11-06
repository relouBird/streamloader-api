import { Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import ENV from "../config/env";
import { queries } from "../database/queries";

const BOT_SESSION_TTL = "1d"; // 1 jour
const SITE_OFFER_TTL_SECONDS = 30 * 60;
const SITE_OFFER_INTERVAL_HOURS = 6;

function readTelegramId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function issueSession(telegramId: number) {
  return jwt.sign({ typ: "bot", telegramId }, ENV.JWT_SECRET, {
    expiresIn: BOT_SESSION_TTL,
    algorithm: "HS256",
  });
}

export async function exchangeSession(req: Request, res: Response) {
  const telegramId = readTelegramId(req.body?.telegramId);
  if (!telegramId) {
    return res.status(400).json({ error: "telegramId invalide" });
  }

  try {
    await queries.ensureTelegramUser(telegramId);
    const user = await queries.getUserByTelegramId(telegramId);
    return res.json({
      success: true,
      token: issueSession(telegramId),
      expiresIn: BOT_SESSION_TTL,
      user,
    });
  } catch (error) {
    console.error("[bot/session]", error);
    return res.status(500).json({ error: "Session bot indisponible" });
  }
}

export async function siteOffer(req: Request, res: Response) {
  const telegramId = req.botTelegramId;
  if (!telegramId)
    return res.status(401).json({ error: "Session bot invalide" });
  try {
    const user = await queries.getUserByTelegramId(telegramId);
    if (user?.plan === "premium") {
      return res.json({ showSupportButton: false, reason: "premium" });
    }
    const offer = await queries.claimSiteOffer(
      telegramId,
      SITE_OFFER_INTERVAL_HOURS,
    );
    if (!offer.offered) {
      return res.json({
        showSupportButton: false,
        nextEligibleAt: offer.lastOfferAt
          ? new Date(
              offer.lastOfferAt.getTime() + SITE_OFFER_INTERVAL_HOURS * 3600000,
            ).toISOString()
          : null,
      });
    }
    const now = Math.floor(Date.now() / 1000);
    const jti = uuid();
    const token = jwt.sign(
      {
        sub: "telegram-site-offer",
        src: "telegram_bot",
        campaign: "site_visit",
        iat: now,
        exp: now + SITE_OFFER_TTL_SECONDS,
        jti,
      },
      ENV.JWT_SECRET,
      { algorithm: "HS256" },
    );
    const expiresAt = new Date((now + SITE_OFFER_TTL_SECONDS) * 1000);
    await queries.createSiteOfferEvent({
      telegramId,
      jti,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      offeredAt: new Date(now * 1000),
      expiresAt,
    });
    return res.json({
      showSupportButton: true,
      redirectToken: token,
      expiresAt: expiresAt.toISOString(),
      nextEligibleAt: new Date(
        now * 1000 + SITE_OFFER_INTERVAL_HOURS * 3600000,
      ).toISOString(),
    });
  } catch (error) {
    console.error("[bot/site-offer]", error);
    return res.status(500).json({ error: "Offre site indisponible" });
  }
}

export async function verifyOffer(req: Request, res: Response) {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!token || token.length > 4096) {
    return res.status(400).json({ valid: false, reason: "invalid_token" });
  }
  try {
    const payload = jwt.verify(token, ENV.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload & { src?: string; campaign?: string; jti?: string };
    if (
      payload.src !== "telegram_bot" ||
      payload.campaign !== "site_visit" ||
      typeof payload.jti !== "string"
    ) {
      return res.status(401).json({ valid: false, reason: "invalid_claims" });
    }
    const event = await queries.verifySiteOffer(payload.jti);
    if (!event || event.campaign !== "site_visit") {
      return res.status(401).json({ valid: false, reason: "unknown_token" });
    }
    return res.json({
      valid: true,
      campaign: event.campaign,
      source: "telegram_bot",
      expiresAt: event.expires_at.toISOString(),
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ valid: false, reason: "expired" });
    }
    console.error("[bot/verify-offer]", error);
    return res.status(401).json({ valid: false, reason: "invalid_token" });
  }
}

export async function linkAccount(req: Request, res: Response) {
  const telegramId = readTelegramId(req.body?.telegramId);
  const apiKey =
    typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";

  if (!telegramId || apiKey.length < 16 || apiKey.length > 255) {
    return res.status(400).json({ error: "telegramId ou clé API invalide" });
  }

  try {
    const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
    const user = await queries.linkTelegramAccount(apiKeyHash, telegramId);
    if (!user) {
      return res.status(401).json({
        error: "Clé API invalide ou compte déjà lié à un autre Telegram",
        code: "BOT_LINK_FAILED",
      });
    }

    return res.json({
      success: true,
      token: issueSession(telegramId),
      expiresIn: BOT_SESSION_TTL,
      user,
    });
  } catch (error) {
    console.error("[bot/link]", error);
    return res.status(500).json({ error: "Liaison du compte indisponible" });
  }
}

export function me(req: Request, res: Response) {
  return res.json({
    user: req.user,
    telegramId: req.botTelegramId,
  });
}
