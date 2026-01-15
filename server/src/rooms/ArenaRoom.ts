import { Room, Client } from "@colyseus/core";
import { ArenaState, Player } from "../state/ArenaState";

type JoinOptions = {
  name?: string;
  class?: string;
};

export class ArenaRoom extends Room<ArenaState> {
  onCreate(_options: any) {
    this.setState(new ArenaState());

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

    if (client.sessionId === this.state.hostId) {
      const next = this.state.players.keys().next().value;
      this.state.hostId = next ?? "";
      if (!this.state.hostId) this.state.phase = "lobby";
    }
  }
}

function normalizeClass(v: unknown): string {
  if (v === "sword" || v === "bow" || v === "magic") return v;
  return "sword";
}
