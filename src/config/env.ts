// config/env.ts
import dotenv from "dotenv";
dotenv.config(); // ⚠️ DOIT être appelé avant toute lecture de process.env plus bas

const ENV = {
  // ── Serveur ─────────────────────────────────────────────────────
  PORT: Number(process.env.PORT) || 3000,
  APP_URL: process.env.APP_URL || `http://localhost:3000`,
  API_URL: process.env.API_URL || `http://localhost:5101`,
  IS_PROD: process.env.NODE_ENV === "production",

  // ── Service Video ───────────────────────────────────────────────
  VIDEO_SERVICE_URL: process.env.VIDEO_SERVICE_URL || "",
  VIDEO_SERVICE_SECRET: process.env.VIDEO_SERVICE_SECRET || "",

  // ── Service BOT ───────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",

  // ── Auth / JWT ───────────────────────────────────────────────
  JWT_SECRET: process.env.API_SECRET || "",
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || "",

  // ── Base de données MySQL ───────────────────────────────────────
  DB: {
    HOST: process.env.DB_HOST || "localhost",
    PORT: Number(process.env.DB_PORT) || 3306,
    USER: process.env.DB_USER || "root",
    PASSWORD: process.env.DB_PASSWORD || "",
    NAME: process.env.DB_NAME || "streamloader",
  },

  // ── Paiement GeniusPay ────────────────────────────────────────────
  GENIUSPAY_API_URL:
    process.env.GENIUSPAY_API_URL ?? "https://api.geniuspay.com/v1/payments",
  GENIUSPAY_API_KEY: process.env.GENIUSPAY_API_KEY ?? "",
  GENIUSPAY_API_SECRET: process.env.GENIUSPAY_API_SECRET ?? "",
  GENIUSPAY_WEBHOOK_SECRET: process.env.GENIUSPAY_WEBHOOK_SECRET ?? "",
};

export default ENV;
