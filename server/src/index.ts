import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "http";

import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";

import { ArenaRoom } from "./rooms/ArenaRoom";
import { authRouter } from "./auth/auth.routes";
import { sessionMiddleware } from "./session";

const port = Number(process.env.PORT ?? 2567);

const app = express();
app.set("trust proxy", 1);

const httpServer = createServer(app);

app.use(express.json());

// ---------------- CORS ----------------

const allowedOrigins = new Set(
  [
    process.env.CLIENT_ORIGIN,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ].filter(Boolean) as string[]
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`CORS_BLOCKED: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options(/.*/, cors());

// ---------------- Sessions (HTTP) ----------------

app.use(sessionMiddleware);

// ---------------- Routes ----------------

app.use("/auth", authRouter);

// ---------------- Colyseus / WS ----------------

const transport = new WebSocketTransport({
  server: httpServer,

  verifyClient: (info, done) => {
    const req = info.req as any;

    // express-session expects req.url to exist
    if (!req.url) req.url = "/";

    const res = {
      getHeader() {},
      setHeader() {},
      writeHead() {},
      end() {},
    } as any;

    console.log("[WS upgrade] origin:", info.origin);
    console.log("[WS upgrade] cookie:", req.headers.cookie);

    sessionMiddleware(req, res, () => {
      console.log("[WS upgrade] session exists:", !!req.session);
      console.log("[WS upgrade] session userId:", req.session?.userId);

      // keep a copy where Colyseus can always reach it later
      req._pcSessionUserId = req.session?.userId;

      done(true);
    });
  },
});

const gameServer = new Server({ transport });
gameServer.define("arena", ArenaRoom).enableRealtimeListing();

// ---------------- Root ----------------

app.get("/", (_req, res) => res.send("Pixel Coliseum server running."));

// ---------------- Start ----------------

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Colyseus listening on ws://0.0.0.0:${port}`);
});
