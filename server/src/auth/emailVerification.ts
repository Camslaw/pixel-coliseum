import crypto from "crypto";
import { pool } from "../db/pool";
import { sendVerificationCode } from "../email/mailer";

function randomCode6(): string {
  // 000000 - 999999
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(code: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
  // HMAC is fine here
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

export async function createAndEmailVerification(userId: string, email: string) {
  const code = randomCode6();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Optional: invalidate old unused codes
  await pool.query(
    `UPDATE email_verifications
     SET used_at = now()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );

  await pool.query(
    `INSERT INTO email_verifications (user_id, code_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, codeHash, expiresAt]
  );

  await sendVerificationCode(email, code);
}

export async function verifyEmailCode(userId: string, code: string) {
  const codeHash = hashCode(code);

  const r = await pool.query(
    `SELECT id
     FROM email_verifications
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
    `UPDATE email_verifications
     SET used_at = now()
     WHERE id = $1`,
    [row.id]
  );

  await pool.query(
    `UPDATE users
     SET email_verified = TRUE, email_verified_at = now()
     WHERE id = $1`,
    [userId]
  );

  return { ok: true as const };
}
