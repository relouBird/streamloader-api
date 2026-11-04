// src/express.d.ts
declare global {
  namespace Express {
    interface Request {
      user?: any;
      apiAuth?: boolean;
      botAuth?: boolean;
      botTelegramId?: number;
      rawBody?: Buffer;
    }
  }
}

export {};
