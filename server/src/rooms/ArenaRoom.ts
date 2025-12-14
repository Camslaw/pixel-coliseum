import { Room, Client } from "@colyseus/core";
import { ArenaState, Player } from "../state/ArenaState";

type JoinOptions = {
  name?: string;
  class?: string;
};

export class ArenaRoom extends Room<ArenaState> {
  onCreate(_options: any) {
    this.setState(new ArenaState());

    // optional: cap players for now
    this.maxClients = 8;
  }

  onJoin(client: Client, options: JoinOptions) {
    const p = new Player();
    p.id = client.sessionId;
    p.name = (options.name ?? "Player").slice(0, 16);
    p.class = normalizeClass(options.class);

    // placeholder spawn
    p.x = 200 + Math.random() * 600;
    p.y = 200 + Math.random() * 300;

    this.state.players.set(client.sessionId, p);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }
}

function normalizeClass(v: unknown): string {
  if (v === "sword" || v === "bow" || v === "magic") return v;
  return "sword";
}
