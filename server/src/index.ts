import express from "express";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ArenaRoom } from "./rooms/ArenaRoom";
import "reflect-metadata";

const port = Number(process.env.PORT ?? 2567);

const app = express();
const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("arena", ArenaRoom);

app.get("/", (_req, res) => res.send("Pixel Coliseum server running."));

httpServer.listen(port, () => {
  console.log(`Colyseus listening on ws://localhost:${port}`);
});
