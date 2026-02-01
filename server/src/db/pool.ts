import pg from "pg";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon needs SSL in most cases; sslmode=require usually handles it,
  // but enabling ssl here avoids surprises in some environments.
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});
