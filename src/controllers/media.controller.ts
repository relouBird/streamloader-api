// controllers/media.controller.ts
import { Request, Response } from "express";
import { videoService } from "../utils/videoService";
import { queries } from "../database/queries";

export async function analyze(req: Request, res: Response) {
  const url = (req.query.url as string) || req.body?.url;
  if (!url) return res.status(400).json({ error: "URL manquante" });

  try {
    const { data, status } = await videoService.post("/analyze", { url });
    return res.status(status).json(data);
  } catch (e: any) {
    const status = e.response?.status || 502;
    const message = e.response?.data?.error || "Service vidéo indisponible.";
    return res.status(status).json({ error: message });
  }
}

export async function downloadStart(req: Request, res: Response) {
  const { url, format, title, sublang } = req.body;
  if (!url) return res.status(400).json({ error: "URL manquante" });

  try {
    const { data, status } = await videoService.post("/download/start", {
      url,
      format,
      title,
      sublang,
    });

    // Log optionnel en DB, associé à l'utilisateur si connecté (optionalAuth)
    const userId = (req as any).user?.id || null;
    if (data?.jobId) {
      try {
        await queries.logDownload(
          userId,
          url,
          format || "default",
          title || "video",
        );
      } catch (e) {
        console.error("[downloadStart] échec log DB (non bloquant)", e);
      }
    }

    return res.status(status).json(data);
  } catch (e: any) {
    const status = e.response?.status || 502;
    const message = e.response?.data?.error || "Service vidéo indisponible.";
    return res.status(status).json({ error: message });
  }
}

// GET /progress/:jobId — proxy du flux SSE du video-service vers le client
export async function progress(req: Request, res: Response) {
  const { jobId } = req.params;

  try {
    const upstream = await videoService.get(`/progress/${jobId}`, {
      responseType: "stream",
      headers: { Accept: "text/event-stream" },
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    upstream.data.pipe(res);

    req.on("close", () => {
      upstream.data.destroy();
    });
  } catch (e: any) {
    const status = e.response?.status || 502;
    const message = e.response?.data?.error || "Service vidéo indisponible.";
    return res.status(status).json({ error: message });
  }
}

// GET /file/:jobId — proxy du téléchargement de fichier (stream)
export async function file(req: Request, res: Response) {
  const { jobId } = req.params;

  try {
    const upstream = await videoService.get(`/file/${jobId}`, {
      responseType: "stream",
    });

    // On relaie les headers pertinents envoyés par le video-service
    const passthroughHeaders = [
      "content-disposition",
      "content-type",
      "content-length",
    ];
    for (const h of passthroughHeaders) {
      const value = upstream.headers[h];
      if (value) res.setHeader(h, value);
    }

    upstream.data.pipe(res);
  } catch (e: any) {
    const status = e.response?.status || 502;
    const message =
      e.response?.data?.error || "Fichier non disponible ou expiré.";
    return res.status(status).json({ error: message });
  }
}
