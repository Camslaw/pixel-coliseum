import { Room, Client, ServerError } from "@colyseus/core";
import { ArenaState, Player } from "../state/ArenaState";
import { pool } from "../db/pool";
import { sessionMiddleware } from "../session";

type JoinOptions = { class?: string };

const MAP_W_TILES = 30;
const MAP_H_TILES = 20;

const GAP = 4;
const midX0 = MAP_W_TILES / 2 - 1;
const midX1 = MAP_W_TILES / 2;
const midY0 = MAP_H_TILES / 2 - 1;
const midY1 = MAP_H_TILES / 2;

type SpawnTile = { tx: number; ty: number };
type SpawnIndex = 0 | 1 | 2 | 3;

const SPAWNS_TILES: [SpawnTile, SpawnTile, SpawnTile, SpawnTile] = [
  { tx: midX0 - GAP / 2, ty: midY0 - GAP / 2 }, // TL
  { tx: midX1 + GAP / 2, ty: midY0 - GAP / 2 }, // TR
  { tx: midX0 - GAP / 2, ty: midY1 + GAP / 2 }, // BL
  { tx: midX1 + GAP / 2, ty: midY1 + GAP / 2 }, // BR
];

function hydrateSession(req: any): Promise<void> {
  return new Promise((resolve, reject) => {
    // express-session expects these to exist
    if (!req.url) req.url = "/";
    if (!req.originalUrl) req.originalUrl = req.url;

    // minimal mock response for express-session
    const res = {
      getHeader() {},
      setHeader() {},
      writeHead() {},
      end() {},
      headersSent: false,
    } as any;

    sessionMiddleware(req, res, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export class ArenaRoom extends Room<ArenaState> {
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

    this.onMessage("move", (client, msg: any) => {
      console.log("[ArenaRoom] move from", client.sessionId, msg);

      const p = this.state.players.get(client.sessionId);
      if (!p) {
        console.log("[ArenaRoom] move: no player for", client.sessionId);
        return;
      }

      const dx = Math.sign(msg?.dx ?? 0);
      const dy = Math.sign(msg?.dy ?? 0);

      const old = { tx: p.tx, ty: p.ty };

      p.tx = Math.max(0, Math.min(p.tx + dx, MAP_W_TILES - 1));
      p.ty = Math.max(0, Math.min(p.ty + dy, MAP_H_TILES - 1));

      console.log("[ArenaRoom] moved", client.sessionId, old, "->", { tx: p.tx, ty: p.ty });
    });
  }

  async onAuth(client: Client, _options: JoinOptions, reqFromOnAuth: any) {
    await hydrateSession(reqFromOnAuth);

    const userId = reqFromOnAuth?.session?.userId as string | undefined;

    if (!userId) {
      console.log("[ArenaRoom] onAuth UNAUTHENTICATED", {
        origin: reqFromOnAuth?.headers?.origin,
        cookie: reqFromOnAuth?.headers?.cookie,
        hasSession: !!reqFromOnAuth?.session,
        sessionUserId: reqFromOnAuth?.session?.userId,
      });
      throw new ServerError(4216, "UNAUTHENTICATED");
    }

    (client as any).userId = userId;
    return true;
  }

  async onJoin(client: Client, _options: JoinOptions) {
    const userId = (client as any).userId as string | undefined;
    if (!userId) throw new ServerError(4216, "UNAUTHENTICATED");

    const r = await pool.query(
      `SELECT display_name FROM users WHERE id = $1`,
      [userId]
    );

    const displayName = String(r.rows[0]?.display_name ?? "Player").slice(0, 16);

    const p = new Player();
    p.id = client.sessionId;
    p.name = displayName;
    p.class = "sword";

    const used = new Set<number>();
    this.state.players.forEach((pl) => {
      const idx = (pl as any).spawnIndex;
      if (typeof idx === "number") used.add(idx);
    });

    const indices: SpawnIndex[] = [0, 1, 2, 3];
    const spawnIndex: SpawnIndex = indices.find((i) => !used.has(i)) ?? 0;

    const spawn = SPAWNS_TILES[spawnIndex];
    (p as any).spawnIndex = spawnIndex;
    p.tx = spawn.tx;
    p.ty = spawn.ty;

    this.state.players.set(client.sessionId, p);
    if (!this.state.hostId) this.state.hostId = client.sessionId;
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
