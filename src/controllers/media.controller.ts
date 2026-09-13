// controllers/media.controller.ts
import type { Request, Response } from "express";
import type { Readable } from "stream";
import { videoService } from "../services/video.service";
import { queries } from "../database/queries";
import { assertPublicHttpUrl, firstString, normalizeError, parseTimeToSeconds, sanitizeTitle } from "../utils/helper";
import type {
  AnalyzeResponse,
  DownloadStartResponse,
  ProgressEvent,
} from "../types/videoService.type";

// ─────────────────────────────────────────────────────────────────
//  CONFIG (à extraire dans config.ts si tu veux)
// ─────────────────────────────────────────────────────────────────

const FREE_DAILY_DOWNLOAD_LIMIT = 30;
const FREE_SUBTITLE_DAILY_LIMIT = 5;
const FREE_MAX_DURATION_SEC = 3 * 60 * 60; // 3h
const FREE_TRIM_TRIAL_LIMIT = 3;

const TRIM_TIME_RE = /^\d{1,2}(:\d{2}){1,2}$/; // MM:SS ou H:MM:SS
const SUBTITLE_LANGS = ["fr", "en", "es", "it", "de", "ar"] as const;

// ─────────────────────────────────────────────────────────────────
//  STORE EN MÉMOIRE : jobId → downloadLogId
//  Permet de mettre à jour le statut en DB quand le job Python se termine.
//  Volontairement non persistant (perdu au redémarrage — OK).
// ─────────────────────────────────────────────────────────────────
const jobLogMap = new Map<string, number>();

// ─────────────────────────────────────────────────────────────────
//  GET /api/analyze
// ─────────────────────────────────────────────────────────────────

export async function analyze(req: Request, res: Response) {
  const url = firstString(req.query.url) ?? firstString(req.body?.url);
  if (!url) return res.status(400).json({ error: "URL manquante" });

  // Défense en profondeur : on refait le contrôle SSRF côté Node, même si
  // Python le refait de son côté. Ça évite d'envoyer du trafic inutile vers
  // le microservice si l'URL est manifestement interne.
  try {
    await assertPublicHttpUrl(url);
  } catch {
    return res.status(400).json({ error: "URL invalide" });
  }

  try {
    // Le microservice renvoie déjà { success, data: { ... } } — on passe
    // directement ce body au frontend (il n'y a plus rien à normaliser ici,
    // c'est le Python qui s'en charge : formats filtrés/triés, sous-titres
    // dédupliqués, storyboards exclus, etc.).
    const response = await videoService.post<AnalyzeResponse>("/analyze", {
      url,
    });
    return res.json(response.data);
  } catch (e) {
    const { status, message } = normalizeError(e);
    return res.status(status).json({ error: message });
  }
}

// ─────────────────────────────────────────────────────────────────
//  POST /api/download/start
// ─────────────────────────────────────────────────────────────────

export async function downloadStart(req: Request, res: Response) {
  const {
    url: rawUrl,
    quality = "1080p",
    format,
    title = "video",
    sublang,
    trim,
    startTime,
    endTime,
  } = req.body ?? {};

  // 1. Validation URL
  const url = firstString(rawUrl);
  if (!url) return res.status(400).json({ error: "URL manquante" });

  try {
    await assertPublicHttpUrl(url);
  } catch {
    return res.status(400).json({ error: "URL invalide" });
  }

  const isPremiumUser = req.user?.plan === "premium";
  const isAudio =
    quality === "mp3" ||
    quality === "audio" ||
    (typeof format === "string" &&
      format.includes("bestaudio") &&
      !format.includes("bestvideo"));

  // ⚠️ `req.user` (optionalAuth) est typé `UserPublic | null | undefined`.
  // On préfère un clientKey basé sur l'IP de confiance d'Express.
  const clientKey = req.user?.id ?? `ip:${req.ip ?? "unknown"}`;

  // 2. Contrôle de durée pour les comptes gratuits.
  //    On doit redemander l'analyse au microservice : le frontend nous
  //    envoie la qualité, pas la durée. Coût : 1 appel /analyze en plus
  //    pour les non-premium uniquement.
  if (!isPremiumUser) {
    try {
      const analysisRes = await videoService.post<AnalyzeResponse>("/analyze", {
        url,
      });
      const duration = analysisRes.data.data.duration;
      if (duration && duration > FREE_MAX_DURATION_SEC) {
        const hours = (FREE_MAX_DURATION_SEC / 3600).toFixed(0);
        return res.status(403).json({
          error: `Vidéo trop longue pour un compte gratuit (max ${hours}h). Passe au plan Premium pour les vidéos illimitées.`,
          code: "DURATION_LIMIT_REACHED",
        });
      }
    } catch (e) {
      const { status, message } = normalizeError(e);
      return res.status(status).json({ error: message });
    }
  }

  // 3. Découpage vidéo sur mesure : validation + quota
  let trimSections: string | null = null;
  if (trim === true || trim === "true") {
    if (
      typeof startTime !== "string" ||
      typeof endTime !== "string" ||
      !TRIM_TIME_RE.test(startTime) ||
      !TRIM_TIME_RE.test(endTime)
    ) {
      return res.status(400).json({
        error: "Format de temps invalide. Utilise MM:SS (ex : 00:10).",
        code: "INVALID_TRIM_TIME",
      });
    }
    const startSec = parseTimeToSeconds(startTime);
    const endSec = parseTimeToSeconds(endTime);
    if (startSec === null || endSec === null || endSec <= startSec) {
      return res.status(400).json({
        error: "L'heure de fin doit être supérieure à l'heure de début.",
        code: "INVALID_TRIM_TIME",
      });
    }
    if (!req.user) {
      return res.status(403).json({
        error:
          "Crée un compte gratuit pour utiliser le découpage vidéo sur mesure.",
        code: "LOGIN_REQUIRED",
      });
    }
    if (!isPremiumUser) {
      if ((req.user.trim_trials_used ?? 0) >= FREE_TRIM_TRIAL_LIMIT) {
        return res.status(403).json({
          error: `Tu as utilisé tes ${FREE_TRIM_TRIAL_LIMIT} essais gratuits de découpage vidéo. Passe au plan Premium pour un découpage illimité.`,
          code: "TRIM_LIMIT_REACHED",
        });
      }
      await queries.incrementTrimTrial(req.user.id);
    }
    trimSections = `*${startTime}-${endTime}`;
  }

  // 4. Quota journalier de téléchargements (Free uniquement)
  if (!isPremiumUser) {
    const dailyCount = await queries.countDailyDownloads(clientKey);
    if (dailyCount >= FREE_DAILY_DOWNLOAD_LIMIT) {
      return res.status(429).json({
        error: `Limite gratuite atteinte : ${FREE_DAILY_DOWNLOAD_LIMIT} téléchargements par jour. Passe au plan Premium pour continuer.`,
        code: "DAILY_LIMIT_REACHED",
      });
    }
  }

  // 5. Sous-titres : validation langue + quota journalier
  let normalizedSublang: string | null = null;
  if (typeof sublang === "string" && sublang.length > 0) {
    normalizedSublang = sublang.toLowerCase();
    if (!(SUBTITLE_LANGS as readonly string[]).includes(normalizedSublang)) {
      return res.status(400).json({
        error:
          "Langue de sous-titres non supportée. Choisis parmi : " +
          SUBTITLE_LANGS.join(", ") +
          ".",
        code: "INVALID_SUBLANG",
      });
    }
    if (!isPremiumUser) {
      const subCount = await queries.countDailySubtitleDownloads(clientKey);
      if (subCount >= FREE_SUBTITLE_DAILY_LIMIT) {
        return res.status(429).json({
          error: `Limite gratuite de sous-titres atteinte : ${FREE_SUBTITLE_DAILY_LIMIT} téléchargements avec sous-titres par jour. Passe au plan Premium pour des sous-titres illimités.`,
          code: "SUBTITLE_LIMIT_REACHED",
        });
      }
    }
  }

  // 6. Qualité 4K / 1440p réservée aux Premium
  const isReq4k =
    quality === "4k" ||
    quality === "2160p" ||
    quality === "1440p" ||
    (typeof format === "string" &&
      (format.includes("2160") || format.includes("1440")));

  if (isReq4k && !isPremiumUser) {
    return res.status(403).json({
      error:
        "⚡ La qualité 4K Ultra HD est réservée aux abonnés Premium. Passe au plan Premium pour débloquer les téléchargements 4K et sans limite !",
      code: "PREMIUM_REQUIRED",
    });
  }

  // 7. Format brut réservé aux Premium + validation anti-abus
  if (!isPremiumUser && format) {
    return res.status(403).json({
      error: "Les formats personnalisés sont réservés aux abonnés Premium.",
      code: "PREMIUM_REQUIRED",
    });
  }
  if (
    typeof format === "string" &&
    (format.length > 150 || !/^[\w+,\-\[\]<>=./: ]+$/.test(format))
  ) {
    return res.status(400).json({
      error: "Format de téléchargement invalide.",
    });
  }

  // 8. Log DB avant l'appel au microservice (pour avoir un id de suivi)
  const safeTitle = sanitizeTitle(title);
  let downloadLogId: number | null = null;
  try {
    const result = await queries.logDownload(
      req.user?.id ?? null,
      clientKey,
      url,
      typeof format === "string" ? format : quality,
      safeTitle,
      Boolean(normalizedSublang),
    );
    downloadLogId = result.insertId ?? result.lastInsertRowid ?? null;
  } catch (e) {
    // Non bloquant : on continue même si le log échoue.
    console.error("[downloadStart] échec log DB (non bloquant)", e);
  }

  // 9. Appel au microservice Python
  try {
    const response = await videoService.post<DownloadStartResponse>(
      "/download/start",
      {
        url,
        quality,
        format: typeof format === "string" ? format : null,
        title: safeTitle,
        sublang: normalizedSublang,
        trim: trimSections !== null,
        startTime: trimSections ? startTime : null,
        endTime: trimSections ? endTime : null,
      },
    );

    const jobId = response.data.jobId;

    // Mémorise l'association jobId → downloadLogId pour mettre à jour le
    // statut en DB quand le job se terminera (via le proxy SSE ci-dessous).
    if (downloadLogId != null) jobLogMap.set(jobId, downloadLogId);

    return res.json({ success: true, jobId });
  } catch (e) {
    const { status, message, code } = normalizeError(e);
    // Si Python refuse le job, on marque le log en erreur tout de suite.
    if (downloadLogId != null) {
      try {
        await queries.updateDownloadStatus(downloadLogId, "error");
      } catch (dbErr) {
        console.error("[downloadStart] échec update status DB", dbErr);
      }
    }
    return res
      .status(status)
      .json(code ? { error: message, code } : { error: message });
  }
}

// ─────────────────────────────────────────────────────────────────
//  GET /api/progress/:jobId — proxy SSE
// ─────────────────────────────────────────────────────────────────

export async function progress(req: Request, res: Response) {
  const { jobId } = req.params;
  if (!jobId) return res.status(400).json({ error: "jobId manquant" });

  let upstream;
  try {
    upstream = await videoService.get<Readable>(`/progress/${jobId}`, {
      responseType: "stream",
      headers: { Accept: "text/event-stream" },
      // SSE = connexion longue, on annule le timeout par défaut du client.
      timeout: 0,
    });
  } catch (e) {
    const { status, message } = normalizeError(e);
    return res.status(status).json({ error: message });
  }

  // Headers SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // désactive le buffering Nginx
  res.flushHeaders();

  const downloadLogId = jobLogMap.get(jobId);

  // On forward chaque chunk immédiatement (latence minimale), et en
  // parallèle on parse les événements pour détecter `done` / `error` et
  // mettre à jour le statut en DB.
  let buffer = "";

  upstream.data.on("data", (chunk: Buffer) => {
    // 1. Forward immédiat
    res.write(chunk);

    // 2. Détection best-effort de fin de job
    if (downloadLogId == null) return;
    buffer += chunk.toString();
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      if (!ev.startsWith("data: ")) continue;
      try {
        const payload = JSON.parse(ev.slice(6)) as ProgressEvent;
        if (payload.type === "done" || payload.type === "error") {
          const newStatus = payload.type === "done" ? "done" : "error";
          queries
            .updateDownloadStatus(downloadLogId, newStatus)
            .catch((err) => console.error("[progress] update DB failed", err));
          jobLogMap.delete(jobId);
        }
      } catch {
        // Heartbeat (`: heartbeat`) ou JSON partiel — on ignore.
      }
    }
  });

  upstream.data.on("end", () => {
    try {
      res.end();
    } catch {
      /* déjà fermé */
    }
  });

  upstream.data.on("error", (err: Error) => {
    console.error("[progress] upstream error:", err.message);
    try {
      res.end();
    } catch {
      /* déjà fermé */
    }
  });

  // Client qui ferme l'onglet : on coupe la connexion vers Python.
  req.on("close", () => {
    upstream.data.destroy();
  });
}

// ─────────────────────────────────────────────────────────────────
//  GET /api/file/:jobId — proxy téléchargement
// ─────────────────────────────────────────────────────────────────

export async function file(req: Request, res: Response) {
  const { jobId } = req.params;
  if (!jobId) return res.status(400).json({ error: "jobId manquant" });

  let upstream;
  try {
    upstream = await videoService.get<Readable>(`/file/${jobId}`, {
      responseType: "stream",
      // Téléchargement = long, on annule le timeout par défaut.
      timeout: 0,
    });
  } catch (e) {
    const { status, message } = normalizeError(e);
    return res.status(status).json({ error: message });
  }

  // On relaie les headers pertinents (nom du fichier, type MIME, taille).
  const passthrough = [
    "content-disposition",
    "content-type",
    "content-length",
  ] as const;
  for (const h of passthrough) {
    const value = upstream.headers[h];
    if (value) res.setHeader(h, value);
  }

  upstream.data.pipe(res);

  // Nettoyage si le client se déconnecte en cours de route.
  req.on("close", () => {
    upstream.data.destroy();
  });
}
