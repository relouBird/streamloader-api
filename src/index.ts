// index.ts
import dotenv from "dotenv";
dotenv.config(); // ⚠️ DOIT être appelé avant toute lecture de process.env plus bas

import Server from "./server";
import { initializeDatabase } from "./database/initORM";

import AuthRouter from "./routes/auth.route";
import MediaRouter from "./routes/media.route";
import PaymentRouter from "./routes/payment.route";
import PaymentTestRouter from "./routes/payment-test.route";

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "";
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const IS_PROD = process.env.NODE_ENV === "production";

async function bootstrap() {
  const server = new Server(PORT, APP_URL, JWT_SECRET, IS_PROD);

  await initializeDatabase();

  // 1. Configure app + middlewares globaux + /api/health
  server.init();

  // 3. Ajoute le fallback SPA + error handler en dernier
  server.finalize();

  // 2. Monte les routers AVANT le fallback SPA (sinon "*" les intercepte)
  server.use("/api/auth", AuthRouter);
  server.use("/api/media", MediaRouter);
  server.use("/api/payment", PaymentRouter);
  server.use("/payment-test", PaymentTestRouter); // routes de test webhooks locales

  // 4. Démarre réellement l'écoute HTTP
  server.listen();
  server.getHealth();

  console.log("Server started");
  server.close();
}

bootstrap().catch((err) => {
  console.error("[BOOTSTRAP ERROR]", err);
  process.exit(1);
});
