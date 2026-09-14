import express, { NextFunction, Router } from "express";
import cors from "cors";
import { Request, Response, Express } from "express";
import path from "path";
import rateLimit from "express-rate-limit";
import { db } from "./database/index";

// Importations des constantes
import { isWeakSecret } from "./utils/helper";
import { IncomingMessage } from "http";

// definition des types
export type GetterFunction = (req: Request, res: Response) => void;

export default class Server {
  readonly port: number = 3000;
  readonly url: string = "";
  readonly secret: string = "";
  readonly prod: boolean = false;
  protected app: Express | undefined;

  // Nouvelles données
  readonly GENIUSPAY_WEBHOOK_SECRET: string = "";
  readonly AD_REDIRECT_URL: string = "";
  readonly ADMIN_TOKEN: string = "";

  protected server: any;

  constructor(
    port: number,
    url: string,
    secret: string,
    geniusPaySecret: string,
    prod: boolean,
  ) {
    this.port = Number(port);
    if (!secret || isWeakSecret(secret)) {
      throw new Error("JWT_SECRET manquant dans .env");
    }
    this.secret = secret;

    if (!geniusPaySecret || isWeakSecret(geniusPaySecret)) {
      throw new Error(
        "GENIUSPAY_WEBHOOK_SECRET trop faible en production. Configurez un secret de webhook robuste.",
      );
    }
    this.url = url;
    this.prod = prod;
  }

  // ─────────────────────────────────────────────────────────────────
  //  INIT — configure app + middlewares globaux.
  //  Ne fait AUCUN app.listen ici : on veut pouvoir monter les routers
  //  (server.use(...)) AVANT le fallback SPA et le error handler.
  // ─────────────────────────────────────────────────────────────────
  init() {
    const allowedOrigins = this.prod ? [this.url.replace(/\/$/, "")] : ["*"];

    const corsOptions = {
      origin: (
        origin: string | undefined,
        callback: (error: Error | null, allow?: boolean) => void,
      ) => {
        // Requêtes sans Origin :
        // Postman, curl, appels serveur-à-serveur, etc.
        if (!origin) {
          return callback(null, true);
        }

        // Développement
        if (!this.prod) {
          return callback(null, true);
        }

        // Production
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        console.warn(`[CORS] Origin refusée: ${origin}`);

        return callback(new Error("Origin not allowed by CORS"));
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
      optionsSuccessStatus: 204,
    };

    this.app = express();
    this.app.set("trust proxy", 1);
    this.app.use(cors(corsOptions));
    this.app.options("*", cors(corsOptions)); // Pre-flight

    // ─────────────────────────────────────────────────────────────────
    //  MIDDLEWARES GLOBAUX
    // ─────────────────────────────────────────────────────────────────

    this.app.use(
      express.json({
        limit: "10kb",
        verify: (req, _res, buf) => {
          (req as IncomingMessage & { rawBody?: Buffer }).rawBody =
            Buffer.from(buf);
        },
      }),
    );
    this.app.use(express.urlencoded({ extended: true, limit: "10kb" }));
    this.app.use(express.static(path.join(__dirname, "public")));

    // Headers de securite minimalistes et Logger global
    this.app.use((req, res, next) => {
      const start = Date.now();
      const { method, originalUrl, body, query, params } = req;

      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
        ].join("; "),
      );

      // 3. Capturer la réponse pour le log de fin
      const originalSend = res.send;
      res.send = function (data) {
        const duration = Date.now() - start;
        console.log(
          `[GLOBAL] ${method} ${originalUrl.toLocaleUpperCase()} - ${res.statusCode} (${duration}ms)`,
        );
        if (query && Object.keys(query).length) console.log(`   Query:`, query);
        if (params && Object.keys(params).length)
          console.log(`   Params:`, params);
        if (body && Object.keys(body).length) console.log(`   Body:`, body);

        // On appelle la fonction originale avec le bon contexte 'this'
        return originalSend.call(this, data);
      };

      next();
    });

    // ─────────────────────────────────────────────────────────────────
    //  RATE LIMITERS
    // ─────────────────────────────────────────────────────────────────

    // Limiteur global — protection DoS de base
    const globalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 min
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Trop de requêtes. Réessaie dans 15 minutes." },
    });

    this.app.use("/api/", globalLimiter);

    this.app.get("/", (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  FINALIZE — appelé APRÈS que tous les routers (server.use) soient
  //  montés. Ajoute le fallback SPA + error handler EN DERNIER.
  // ─────────────────────────────────────────────────────────────────
  finalize() {
    // ────────────────────────────────────────────────────────────────
    // GLOBAL ERROR HANDLER
    // ────────────────────────────────────────────────────────────────
    this.app?.use(
      (err: any, req: Request, res: Response, next: NextFunction) => {
        console.error("[ERROR]", {
          message: err.message,
          stack: err.stack,
          path: req.originalUrl,
          method: req.method,
        });

        if (res.headersSent) {
          return next(err);
        }

        const status = err.statusCode ?? 500;

        return res.status(status).json({
          success: false,
          message: err.message ?? "Internal server error",
        });
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────
  //  LISTEN — démarre réellement le serveur HTTP
  // ─────────────────────────────────────────────────────────────────
  listen() {
    // Ecoutons...
    this.server = this.app?.listen(this.port, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║  StreamLoader v1.0 — ${this.prod ? "PRODUCTION" : "DÉVELOPPEMENT"}                           ║
║  http://localhost:${this.port}                                       ║
╠══════════════════════════════════════════════════════════════╣
║  ✅ Rate limiting      (global + analyze + download + auth)  ║
║  ✅ SSE progression    (/api/progress/:jobId)                ║
║  ✅ Tokens de fichier  (/api/file/:jobId — usage unique)     ║
║  ✅ CORS               (${this.prod ? "strict : " + this.url : "dev : *"})                             ║
║  ✅ yt-dlp auto-update (24h)                                 ║
║  ✅ Graceful shutdown  (SIGINT / SIGTERM)                    ║
╚══════════════════════════════════════════════════════════════╝
  `);
    });
  }

  // fonction qui gere le get sur un endpoint
  get(endpoint: string, getter: GetterFunction) {
    this.app?.get(`${endpoint}`, getter);
  }

  getRedirect() {
    this.app?.get("/api/ad-click", (_, res) => {
      if (this.AD_REDIRECT_URL && this.AD_REDIRECT_URL != "")
        return res.redirect(302, this.AD_REDIRECT_URL);
      res.redirect(302, "/#pricing");
    });
  }

  // Etat de santé de la page
  getHealth() {
    this.app?.get("/api/health", (_, res) => {
      console.log("[Health] App State...");
      res.json({
        status: "ok",
        version: "2.1.0",
      });
    });
  }

  // endpoint qui permet de gerer un router
  use(endpoint: string, router: Router) {
    this.app?.use(endpoint, router);
  }

  // ─────────────────────────────────────────────────────────────────
  //  ARRÊT PROPRE — SIGINT / SIGTERM
  // ─────────────────────────────────────────────────────────────────

  async gracefulShutdown(signal: string) {
    console.log(`\n[${signal}] Arrêt propre en cours...`);

    try {
      await db.end();
      console.log("MySQL pool closed.");
    } catch (err) {
      console.error("Failed to close MySQL pool:", err);
    }

    // 5. Fermer le serveur HTTP
    this.server?.close(() => {
      console.log("[SERVER] Arrêt propre terminé.");
      process.exit(0);
    });

    // Forcer l'exit après 8s si quelque chose est bloqué
    setTimeout(() => {
      console.error("[SERVER] Timeout — arrêt forcé.");
      process.exit(1);
    }, 8_000).unref();
  }

  close() {
    process.on("SIGINT", () => this.gracefulShutdown("SIGINT"));
    process.on("SIGTERM", () => this.gracefulShutdown("SIGTERM"));

    process.on("uncaughtException", (err) => {
      console.error("[UNCAUGHT EXCEPTION]", err.stack);
      // Ne pas crasher en prod pour une erreur non fatale
    });

    process.on("unhandledRejection", (reason) => {
      console.error("[UNHANDLED REJECTION]", reason);
    });
  }
}
