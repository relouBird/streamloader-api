// src/express.d.ts
import type { UserPublic } from "./database/types";

declare global {
  namespace Express {
    interface Request {
      user?: UserPublic | null;
    }
  }
}

export {};