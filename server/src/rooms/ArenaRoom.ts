import { Room, Client } from "@colyseus/core";
import { ArenaState, Player } from "../state/ArenaState";

type JoinOptions = {
  name?: string;
  class?: string;
};

export class ArenaRoom extends Room<ArenaState> {
  onCreate(_options: any) {
    this.state = new ArenaState();

    this.maxClients = 8;

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

    p.x = 200 + Math.random() * 600;
    p.y = 200 + Math.random() * 300;

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
