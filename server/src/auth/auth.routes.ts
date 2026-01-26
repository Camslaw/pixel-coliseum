import { Router } from "express";
import bcrypt from "bcrypt";
import { pool } from "../db/pool";
import jwt from "jsonwebtoken";

export const authRouter = Router();

type SafeUser = {
  id: string;
  email: string;
  displayName: string;
};

function signToken(user: SafeUser) {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
  return jwt.sign(
    { userId: user.id, email: user.email, displayName: user.displayName },
    secret,
    { expiresIn: "7d" }
  );
}

function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  // minimal validation (good enough for now)
  return email.includes("@") && email.includes(".");
}

function isValidPassword(pw: unknown): pw is string {
  return typeof pw === "string" && pw.length >= 8;
}

authRouter.post("/signup", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const displayName = String(req.body?.displayName ?? "").trim();
    const password = req.body?.password;

    if (!isValidEmail(email)) return res.status(400).json({ error: "INVALID_EMAIL" });
    if (!isValidPassword(password)) return res.status(400).json({ error: "INVALID_PASSWORD" });
    if (!displayName) return res.status(400).json({ error: "INVALID_DISPLAY_NAME" });

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name`,
      [email, passwordHash, displayName]
    );

    const row = result.rows[0];
    const user: SafeUser = { id: row.id, email: row.email, displayName: row.display_name };

    req.session.userId = user.id;

    const token = signToken(user);
    return res.json({ user, token });
  } catch (err: any) {
    // unique violation (email already exists)
    if (err?.code === "23505") return res.status(409).json({ error: "EMAIL_TAKEN" });
    console.error(err);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!isValidEmail(email)) return res.status(400).json({ error: "INVALID_EMAIL" });
    if (!isValidPassword(password)) return res.status(400).json({ error: "INVALID_PASSWORD" });

    const result = await pool.query(
      `SELECT id, email, password_hash, display_name
       FROM users
       WHERE email = $1`,
      [email]
    );

    const row = result.rows[0];
    if (!row) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const user: SafeUser = { id: row.id, email: row.email, displayName: row.display_name };

    req.session.userId = user.id;

    const token = signToken(user);
    return res.json({ user, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("pc.sid");
    res.json({ ok: true });
  });
});

authRouter.get("/me", async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "UNAUTHENTICATED" });

    const result = await pool.query(
      `SELECT id, email, display_name
       FROM users
       WHERE id = $1`,
      [userId]
    );

    const row = result.rows[0];
    if (!row) return res.status(401).json({ error: "UNAUTHENTICATED" });

    const user: SafeUser = { id: row.id, email: row.email, displayName: row.display_name };
    return res.json({ user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});
