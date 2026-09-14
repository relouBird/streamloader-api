// index.ts
import ENV from "./config/env";
import Server from "./server";
import { initializeDatabase } from "./database/initORM";

// Routeurs
import AuthRouter from "./routes/auth.route";
import MediaRouter from "./routes/media.route";
import PaymentRouter from "./routes/payment.route";
import ReviewsRouter from "./routes/reviews.route";
import AdminReviewRouter from "./routes/admin-reviews.route";

async function bootstrap() {
  const server = new Server(
    ENV.PORT,
    ENV.APP_URL,
    ENV.JWT_SECRET,
    ENV.GENIUSPAY_WEBHOOK_SECRET,
    ENV.IS_PROD,
  );

  await initializeDatabase();

  // 1. Configure app + middlewares globaux + /api/health
  server.init();

  // 3. Ajoute le fallback SPA + error handler en dernier
  server.finalize();

  // 2. Monte les routers AVANT le fallback SPA (sinon "*" les intercepte)

  // ─── Auth (authentification) ─────────────────────────────────────────────────────
  server.use("/api/auth", AuthRouter);

  // ─── Media (video-service yt-dlp) ────────────────────────────────────────────────
  server.use("/api/media", MediaRouter);

  // ─── Payment (service de paiement) ───────────────────────────────────────────────
  server.use("/api/payment", PaymentRouter);

  // ─── Avis (reviews) ──────────────────────────────────────────────────────────────
  server.use("/api/reviews", ReviewsRouter);

  // ─── Modération des avis (admin) ─────────────────────────────────────────────────
  server.use("/api/admin/reviews", AdminReviewRouter);

  // 4. Démarre réellement l'écoute HTTP
  server.listen();

  server.getRedirect();
  server.getHealth();

  console.log("Server started");
  server.close();
}

bootstrap().catch((err) => {
  console.error("[BOOTSTRAP ERROR]", err);
  process.exit(1);
});
