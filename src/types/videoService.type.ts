// types/videoService.ts

/** Format vidéo/audio tel que renvoyé par le microservice Python (déjà normalisé). */
export interface AnalyzedFormat {
  id: string;
  ext: string;
  height: number | null;
  width: number | null;
  fps: number | null;
  filesize: number | null;
  vcodec: string | null;
  acodec: string | null;
  tbr: number | null;
}

export interface AnalyzePayload {
  title: string;
  duration: number | null;
  uploader: string;
  thumbnail: string | null;
  subtitles: string[];
  extractor: string;
  webpage: string;
  formats: AnalyzedFormat[];
}

export interface AnalyzeResponse {
  success: true;
  data: AnalyzePayload;
}

export interface DownloadStartResponse {
  success: true;
  jobId: string;
}

/** Erreur renvoyée par le microservice (400/401/404/500/502/503/504). */
export interface VideoServiceErrorResponse {
  error: string;
  code?: string;
}

/** Codes métier du microservice (facultatif, pour narrowing côté handler). */
export type VideoServiceErrorCode =
  | "SERVER_BUSY"
  | "INVALID_TRIM_TIME"
  | "INVALID_SUBLANG";

/** Payload SSE émis par `/progress/:jobId`. */
export type ProgressEvent =
  | {
      type: "progress";
      percent: number;
      stream: number;
      streams: number;
      total: string;
      speed: string;
      eta: string | null;
    }
  | {
      type: "processing";
      percent: number;
      message: string;
    }
  | {
      type: "done";
      jobId: string;
      title: string;
      ext: string;
      finalSize?: number;
      subtitles?: boolean;
      subtitleLang?: string | null;
    }
  | { type: "error"; message: string };