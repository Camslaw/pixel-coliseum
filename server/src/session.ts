import session from "express-session";
import pg from "pg";
import connectPgSimple from "connect-pg-simple";

const PgSession = connectPgSimple(session);

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

const isProd = process.env.NODE_ENV === "production";

export const sessionMiddleware = session({
  name: "pc.sid",
  secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  resave: false,
  saveUninitialized: false,

  store: new PgSession({
    pool: pgPool,
    tableName: "session",
    createTableIfMissing: true,
  }),

  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    domain: isProd ? ".pixelcoliseum.com" : undefined,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
});
