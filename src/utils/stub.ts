// utils/stub.ts
import { Request, Response } from "express";
 
/**
 * Handler temporaire pour une route pas encore implémentée.
 * Permet de vérifier que le routing + middlewares (limiter, auth) marchent
 * sans avoir écrit la logique métier.
 */
export function notImplemented(name: string) {
  return (req: Request, res: Response) => {
    console.log(`[STUB] ${name} appelée — ${req.method} ${req.originalUrl}`);
    res.status(400).json({
      success: false,
      stub: name,
      message: `Route "${name}" pas encore implémentée.`,
    });
  };
}
 