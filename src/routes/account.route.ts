// routes/account.route.ts
import express from "express";
import { authMiddleware } from "../utils/helper";
import * as authController from "../controllers/auth.controller";

const AccountRouter = express.Router();

AccountRouter.get("/api-key", authMiddleware, authController.getApiKeyInfo);

AccountRouter.post("/api-key", authMiddleware, authController.createApiKey);

AccountRouter.delete("/api-key", authMiddleware, authController.deleteApiKey);

export default AccountRouter;
