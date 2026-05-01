import type { Request, Response, NextFunction } from "express";

export function botAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-bot-api-key"];
  const expected = process.env.BOT_API_KEY;

  if (!expected) {
    res.status(500).json({ error: "Bot API key not configured on server" });
    return;
  }

  if (!key || key !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
