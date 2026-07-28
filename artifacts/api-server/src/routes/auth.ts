import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "../lib/supabase.js";
import { LoginBody } from "@workspace/api-zod";

const router = Router();
const SESSION_SECRET = process.env["SESSION_SECRET"] || "fallback-dev-secret";

router.post("/auth/login", async (req: any, res: any) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const { data: admins, error } = await supabase
      .from("qr_admins")
      .select("*")
      .eq("email", email)
      .limit(1);

    if (error) throw error;

    const admin = admins?.[0];
    if (!admin) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = jwt.sign({ adminId: admin.id, email: admin.email, role: "admin" }, SESSION_SECRET, {
      expiresIn: "24h",
    });

    res.json({
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name },
    });
  } catch (err: any) {
    console.error("[Login API] Fatal error:", err);
    req.log.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error: " + (err instanceof Error ? err.message : "Unknown error") });
  }
});

router.post("/auth/mentor-login", async (req: any, res: any) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { email, password } = parsed.data;
  try {
    const { data: mentors, error } = await supabase
      .from("qr_mentors")
      .select("*")
      .eq("email", email)
      .limit(1);

    if (error) throw error;

    const mentor = mentors?.[0];
    if (!mentor) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await bcrypt.compare(password, mentor.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ mentorId: mentor.id, email: mentor.email, role: "mentor" }, SESSION_SECRET, {
      expiresIn: "24h",
    });

    res.json({
      token,
      mentor: { id: mentor.id, email: mentor.email, name: mentor.name },
    });
  } catch (err: any) {
    req.log.error({ err }, "Mentor login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/auth/mentor-key-login", (_req: any, res: any) => {
  res.json({ status: "active", message: "Mentor key login endpoint is ready. Send a POST request with JSON body { \"key\": \"YOUR_KEY\" }." });
});

router.post("/auth/mentor-key-login", async (req: any, res: any) => {
  const { key } = req.body;
  if (!key) {
    res.status(400).json({ error: "Mentor key is required" });
    return;
  }
  try {
    const { data: mentors, error } = await supabase
      .from("qr_mentors")
      .select("*")
      .ilike("key", key.trim())
      .limit(1);

    if (error) throw error;

    const mentor = mentors?.[0];
    if (!mentor) {
      res.status(401).json({ error: "Invalid mentor key" });
      return;
    }

    const token = jwt.sign({ mentorId: mentor.id, email: mentor.email, role: "mentor" }, SESSION_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      mentor: { id: mentor.id, email: mentor.email, name: mentor.name, key: mentor.key },
    });
  } catch (err: any) {
    req.log.error({ err }, "Mentor key login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
