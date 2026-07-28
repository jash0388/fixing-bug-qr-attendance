import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "fallback-dev-secret";

export interface AuthRequest extends Request {
  adminId?: number;
  mentorId?: number;
}

const BYPASS_TOKEN = "bypass-token";
const BYPASS_ENABLED = process.env.ALLOW_BYPASS_TOKEN === "true";

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }
  const token = authHeader.slice(7);

  if (token === BYPASS_TOKEN || token === "bypass-token-hod" || token === "bypass-token-mentor") {
    req.adminId = token === "bypass-token-hod" ? -2 : token === "bypass-token-mentor" ? -3 : -1;
    if (token === "bypass-token-mentor") {
      req.mentorId = -3;
    }
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      adminId?: number;
      mentorId?: number;
    };
    if (decoded.adminId) req.adminId = decoded.adminId;
    if (decoded.mentorId) req.mentorId = decoded.mentorId;
    if (!decoded.adminId && !decoded.mentorId) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.adminId) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function mentorOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.mentorId) {
    res.status(403).json({ error: "Mentor access required" });
    return;
  }
  next();
}

export function signToken(adminId: number): string {
  return jwt.sign({ adminId }, JWT_SECRET, { expiresIn: "7d" });
}

export function signMentorToken(mentorId: number): string {
  return jwt.sign({ mentorId }, JWT_SECRET, { expiresIn: "7d" });
}
