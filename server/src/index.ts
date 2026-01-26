import "dotenv/config";

import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ArenaRoom } from "./rooms/ArenaRoom";
import "reflect-metadata";

import session from "express-session";
import { authRouter } from "./auth/auth.routes";

const port = Number(process.env.PORT ?? 2567);

const app = express();
const httpServer = createServer(app);

// 1) parse JSON
app.use(express.json());

// 2) cookie session middleware
app.use(
  session({
    name: "pc.sid",
    secret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax", // good default for same-site dev
      secure: false,  // set true behind HTTPS in prod
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// 3) mount auth endpoints
app.use("/auth", authRouter);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("arena", ArenaRoom);

app.get("/", (_req, res) => res.send("Pixel Coliseum server running."));

httpServer.listen(port, () => {
  console.log(`Colyseus listening on ws://localhost:${port}`);
});
