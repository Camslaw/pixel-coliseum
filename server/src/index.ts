import "dotenv/config";
import cors from "cors";

import express from "express";
import { createServer } from "http";
import session from "express-session";

import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";

import { ArenaRoom } from "./rooms/ArenaRoom";
import { authRouter } from "./auth/auth.routes";

const port = Number(process.env.PORT ?? 2567);
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.set("trust proxy", 1);

const httpServer = createServer(app);

app.use(express.json());

const allowedOrigins = new Set([
  "http://localhost:5173",
  "https://pixelcoliseum.com",
  "https://www.pixelcoliseum.com",
  "https://pixel-coliseum.netlify.app",
]);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      return cb(null, allowedOrigins.has(origin));
    },
    credentials: true,
  })
);

const sessionMiddleware = session({
  name: "pc.sid",
  secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
});

app.use(sessionMiddleware);
app.use("/auth", authRouter);

const transport = new WebSocketTransport({
  server: httpServer,
  verifyClient: (info, done) => {
    const req = info.req as any;

    const res = { getHeader() {}, setHeader() {}, end() {} } as any;

    sessionMiddleware(req, res, () => done(true));
  },
});

const gameServer = new Server({ transport });
gameServer.define("arena", ArenaRoom).enableRealtimeListing();

app.get("/", (_req, res) => res.send("Pixel Coliseum server running."));

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Colyseus listening on ws://0.0.0.0:${port}`);
});
