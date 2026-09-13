// services/video.service.ts
import axios from "axios";
import ENV from "../config/env";

const VIDEO_SERVICE_URL = ENV.VIDEO_SERVICE_URL;
const VIDEO_SERVICE_SECRET = ENV.VIDEO_SERVICE_SECRET;

if (!VIDEO_SERVICE_URL) throw new Error("VIDEO_SERVICE_URL manquant dans .env");
if (!VIDEO_SERVICE_SECRET)
  throw new Error("VIDEO_SERVICE_SECRET manquant dans .env");

// Client dédié au microservice vidéo (analyse, download, progress, file)
export const videoService = axios.create({
  baseURL: VIDEO_SERVICE_URL,
  headers: { "X-Service-Secret": VIDEO_SERVICE_SECRET },
  timeout: 60_000, // l'analyse peut être lente sur certains sites
});
