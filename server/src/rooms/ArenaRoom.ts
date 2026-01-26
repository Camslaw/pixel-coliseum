import { Room, Client } from "@colyseus/core";
import { ArenaState, Player } from "../state/ArenaState";
import jwt from "jsonwebtoken";
import { ServerError } from "@colyseus/core";

type JoinOptions = {
  class?: string;
};

const MAP_W_TILES = 30;
const MAP_H_TILES = 20;

const GAP = 4; // centers 4 tiles apart => at least 3 tiles between

const midX0 = MAP_W_TILES / 2 - 1; // 14
const midX1 = MAP_W_TILES / 2;     // 15
const midY0 = MAP_H_TILES / 2 - 1; // 9
const midY1 = MAP_H_TILES / 2;     // 10

type SpawnTile = { tx: number; ty: number };
type SpawnIndex = 0 | 1 | 2 | 3;

const SPAWNS_TILES: [SpawnTile, SpawnTile, SpawnTile, SpawnTile] = [
  { tx: midX0 - GAP / 2, ty: midY0 - GAP / 2 }, // TL
  { tx: midX1 + GAP / 2, ty: midY0 - GAP / 2 }, // TR
  { tx: midX0 - GAP / 2, ty: midY1 + GAP / 2 }, // BL
  { tx: midX1 + GAP / 2, ty: midY1 + GAP / 2 }, // BR
];

export class ArenaRoom extends Room<ArenaState> {
  static async onAuth(token: string, _options: any, _context: any) {
    console.log("[ArenaRoom.onAuth] token?", !!token);

    if (!token) {
      // 4216 is just an example code; you can pick any number
      throw new ServerError(4216, "UNAUTHENTICATED");
    }

    const secret = process.env.SESSION_SECRET ?? "dev-secret-change-me";

    try {
      const payload = jwt.verify(token, secret) as any;
      // return becomes client.auth
      return {
        userId: payload.userId,
        email: payload.email,
        displayName: payload.displayName,
      };
    } catch {
      throw new ServerError(4216, "UNAUTHENTICATED");
    }
  }

  onCreate(_options: any) {
    this.state = new ArenaState();

    this.maxClients = 4;

    this.onMessage("start_game", (client) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;

      this.state.phase = "playing";
    });

    this.onMessage("set_class", (client, msg: any) => {
      const cls = normalizeClass(msg?.class);
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.class = cls;
    });
  }

  onJoin(client: Client, options: JoinOptions) {
    const auth = client.auth as any;

    const p = new Player();
    p.id = client.sessionId;
    p.name = (auth?.displayName ?? "Player").slice(0, 16);
    p.class = "sword";

    const used = new Set<number>();
    this.state.players.forEach((pl) => {
      const idx = (pl as any).spawnIndex;
      if (typeof idx === "number") used.add(idx);
    });

    const indices: SpawnIndex[] = [0, 1, 2, 3];
    const spawnIndex: SpawnIndex = indices.find(i => !used.has(i)) ?? 0;

    const spawn = SPAWNS_TILES[spawnIndex];

    (p as any).spawnIndex = spawnIndex;
    p.tx = spawn.tx;
    p.ty = spawn.ty;

    this.state.players.set(client.sessionId, p);

    if (!this.state.hostId) {
      this.state.hostId = client.sessionId;
    }
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);

    if (this.state.players.size === 0) {
      this.disconnect();
      return;
    }

    if (client.sessionId === this.state.hostId) {
      const nextHost = this.state.players.keys().next().value as string | undefined;
      this.state.hostId = nextHost ?? "";
    }
  }
}

function normalizeClass(v: unknown): string {
  if (v === "sword" || v === "bow" || v === "magic") return v;
  return "sword";
}
