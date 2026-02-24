// auth/passwordReset.ts
import crypto from "crypto";
import bcrypt from "bcrypt";
import { pool } from "../db/pool";
import { sendPasswordResetCode } from "../email/mailer"; // you'll add this

function randomCode6(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(code: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

export async function createAndEmailPasswordReset(userId: string, email: string) {
  const code = randomCode6();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // invalidate older unused codes
  await pool.query(
    `UPDATE password_resets
     SET used_at = now()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );

  await pool.query(
    `INSERT INTO password_resets (user_id, code_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, codeHash, expiresAt]
  );

  await sendPasswordResetCode(email, code);
}

export async function consumePasswordResetCode(userId: string, code: string) {
  const codeHash = hashCode(code);

  const r = await pool.query(
    `SELECT id
     FROM password_resets
     WHERE user_id = $1
       AND code_hash = $2
       AND used_at IS NULL
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, codeHash]
  );

  const row = r.rows[0];
  if (!row) return { ok: false as const };

  await pool.query(
    `UPDATE password_resets
     SET used_at = now()
     WHERE id = $1`,
    [row.id]
  );

  return { ok: true as const };
}

export async function setUserPassword(userId: string, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query(
    `UPDATE users
     SET password_hash = $2
     WHERE id = $1`,
    [userId, passwordHash]
  );
}