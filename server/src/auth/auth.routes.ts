import { Router } from "express";
import bcrypt from "bcrypt";
import { pool } from "../db/pool";
import jwt from "jsonwebtoken";
import { createAndEmailVerification, verifyEmailCode } from "./emailVerification";

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
      `INSERT INTO users (email, password_hash, display_name, email_verified)
       VALUES ($1, $2, $3, FALSE)
       RETURNING id, email, display_name, email_verified`,
      [email, passwordHash, displayName]
    );

    const row = result.rows[0];
    const user: SafeUser = { id: row.id, email: row.email, displayName: row.display_name };

    // DO NOT create a session here
    // req.session.userId = user.id;

    // send verification code
    await createAndEmailVerification(user.id, user.email);

    // DO NOT mint a token here
    // const token = signToken(user);

    return res.json({ user: { ...user, emailVerified: row.email_verified } });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "EMAIL_TAKEN" });
    console.error(err);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

authRouter.post("/verify-email", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code ?? "").trim();

    if (!isValidEmail(email)) return res.status(400).json({ error: "INVALID_EMAIL" });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "INVALID_CODE" });

    const u = await pool.query(
      `SELECT id, email, display_name, email_verified
       FROM users
       WHERE email = $1`,
      [email]
    );
    const userRow = u.rows[0];
    if (!userRow) return res.status(400).json({ error: "INVALID_CODE" }); // avoid enumeration

    // If already verified, just sign them in (nice UX)
    if (userRow.email_verified) {
      const safeUser: SafeUser = {
        id: userRow.id,
        email: userRow.email,
        displayName: userRow.display_name,
      };
      req.session.userId = safeUser.id;
      const token = signToken(safeUser);
      return res.json({ user: { ...safeUser, emailVerified: true }, token });
    }

    const result = await verifyEmailCode(userRow.id, code);
    if (!result.ok) return res.status(400).json({ error: "CODE_INVALID_OR_EXPIRED" });

    // Re-read to ensure verified flag is true
    const v = await pool.query(
      `SELECT id, email, display_name, email_verified
       FROM users
       WHERE id = $1`,
      [userRow.id]
    );
    const row = v.rows[0];

    const safeUser: SafeUser = { id: row.id, email: row.email, displayName: row.display_name };

    // SIGN IN HERE
    req.session.userId = safeUser.id;

    const token = signToken(safeUser);
    return res.json({ user: { ...safeUser, emailVerified: row.email_verified }, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

authRouter.post("/resend-verification", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: "INVALID_EMAIL" });

    const r = await pool.query(
      `SELECT id, email, email_verified FROM users WHERE email = $1`,
      [email]
    );
    const row = r.rows[0];

    // respond ok even if not found (avoid enumeration)
    if (!row) return res.json({ ok: true });
    if (row.email_verified) return res.json({ ok: true });

    await createAndEmailVerification(row.id, row.email);

    return res.json({ ok: true });
  } catch (err) {
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
      `SELECT id, email, password_hash, display_name, email_verified
      FROM users
      WHERE email = $1`,
      [email]
    );

    const row = result.rows[0];
    if (!row) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    if (!row.email_verified) {
      return res.status(403).json({ error: "EMAIL_NOT_VERIFIED" });
    }

    const user: SafeUser = { id: row.id, email: row.email, displayName: row.display_name };

    req.session.userId = user.id;

    const token = signToken(user);
    return res.json({ user: { ...user, emailVerified: row.email_verified }, token });
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
      `SELECT id, email, display_name, email_verified
       FROM users
       WHERE id = $1`,
      [userId]
    );

    const row = result.rows[0];
    if (!row) return res.status(401).json({ error: "UNAUTHENTICATED" });

    const user: SafeUser = { id: row.id, email: row.email, displayName: row.display_name };
    return res.json({ user: { ...user, emailVerified: row.email_verified } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});
