import { Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import ENV from "../config/env";
import { queries } from "../database/queries";

const BOT_SESSION_TTL = "1d"; // 1 jour

function readTelegramId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function issueSession(telegramId: number) {
  return jwt.sign(
    { typ: "bot", telegramId },
    ENV.JWT_SECRET,
    { expiresIn: BOT_SESSION_TTL, algorithm: "HS256" },
  );
}

export async function exchangeSession(req: Request, res: Response) {
  const telegramId = readTelegramId(req.body?.telegramId);
  if (!telegramId) {
    return res.status(400).json({ error: "telegramId invalide" });
  }

  try {
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

export async function linkAccount(req: Request, res: Response) {
  const telegramId = readTelegramId(req.body?.telegramId);
  const apiKey =
    typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";

  if (!telegramId || apiKey.length < 16 || apiKey.length > 255) {
    return res.status(400).json({ error: "telegramId ou clé API invalide" });
  }

  try {
    const apiKeyHash = crypto
      .createHash("sha256")
      .update(apiKey)
      .digest("hex");
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
