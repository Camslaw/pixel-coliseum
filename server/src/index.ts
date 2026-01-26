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

const app = express();
const httpServer = createServer(app);

app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

// 1) create the SAME session middleware for both HTTP + WS
const sessionMiddleware = session({
  name: "pc.sid",
  secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
});

// 2) apply it to HTTP routes
app.use(sessionMiddleware);

// auth routes (HTTP)
app.use("/auth", authRouter);

// 3) apply it to WS handshake via verifyClient
const transport = new WebSocketTransport({
  server: httpServer,
  verifyClient: (info, done) => {
    const req = info.req as any;

    // minimal fake res object, required by express middleware signature
    const res = {
      getHeader() {},
      setHeader() {},
      end() {},
    } as any;

    sessionMiddleware(req, res, () => {
      // optional debug:
      // console.log("[WS handshake] session userId =", req.session?.userId);
      done(true);
    });
  },
});

const gameServer = new Server({ transport });

gameServer.define("arena", ArenaRoom).enableRealtimeListing();

app.get("/", (_req, res) => res.send("Pixel Coliseum server running."));

httpServer.listen(port, () => {
  console.log(`Colyseus listening on ws://localhost:${port}`);
});
