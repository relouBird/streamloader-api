export const CONSTANTS = {
  PRICE_FCFA: 1200,
  FREE_DAILY_DOWNLOAD_LIMIT: 30,
  FREE_SUBTITLE_DAILY_LIMIT: 5,

  // Durée max d'une vidéo pour un compte gratuit (secondes) — Free tier
  FREE_MAX_DURATION_SEC: 3 * 60 * 60, // 3h

  // Nombre de téléchargements yt-dlp/ffmpeg pouvant tourner en même temps,
  MAX_CONCURRENT_JOBS: 12,
  FREE_TRIM_TRIAL_LIMIT: 3,

  // Accepte MM:SS ou H:MM:SS (ex: "00:10", "1:32:07")
  TRIM_TIME_RE: /^\d{1,2}(:\d{2}){1,2}$/,

  // Langues de sous-titres supportées (FR, EN, ES, IT, DE + AR)
  SUBTITLE_LANGS: ["fr", "en", "es", "it", "de", "ar"],
  SUBSCRIPTION_PLANS: {
    monthly: { months: 1, usd: 1.5 },
    halfyearly: { months: 6, usd: 6 },
    yearly: { months: 12, usd: 10 },
  },

  CURRENCY_RATES: {
    USD: 1,
    EUR: 0.92,
    XAF: 600,
    XOF: 600,
    NGN: 1600,
    GHS: 15,
    GBP: 0.79,
    CAD: 1.36,
    CHF: 0.9,
    MAD: 10,
    DZD: 135,
    TND: 3.1,
    GNF: 8600,
    CDF: 2800,
    ZAR: 18,
    BRL: 5,
    INR: 83,
  },
};
