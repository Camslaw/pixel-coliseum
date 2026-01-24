import { Room, Client } from "@colyseus/core";
import { ArenaState, Player } from "../state/ArenaState";

type JoinOptions = {
  name?: string;
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
  onCreate(_options: any) {
    this.state = new ArenaState();

    this.maxClients = 4;

    this.onMessage("start_game", (client) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;

      this.state.phase = "playing";
    });
  }

  onJoin(client: Client, options: JoinOptions) {
    const p = new Player();
    p.id = client.sessionId;
    p.name = (options.name ?? "Player").slice(0, 16);
    p.class = normalizeClass(options.class);

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
