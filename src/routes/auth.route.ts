// routes/auth.route.ts
import express from "express";
import { authLimiter } from "../utils/limiters";
import { authMiddleware } from "../utils/helper";
import * as authController from "../controllers/auth.controller";

const AuthRouter = express.Router();

AuthRouter.post("/register", authLimiter, authController.register);

AuthRouter.post("/login", authLimiter, authController.login);

// GET, pas POST : /me est une lecture de profil via le token
AuthRouter.get("/me", authMiddleware, authController.me);

export default AuthRouter;
