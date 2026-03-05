import Phaser from "phaser";
import { Client } from "colyseus.js";
import { auth } from "../auth";
import type { Room } from "colyseus.js";

function getWsUrl(): string {
  const ws = import.meta.env.VITE_WS_URL as string | undefined;
  if (ws && ws.trim()) return ws;

  const api = import.meta.env.VITE_API_URL as string | undefined;
  if (api && api.trim()) {
    const u = new URL(api);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    // trim trailing slash
    return u.toString().replace(/\/$/, "");
  }

  // last-resort dev fallback
  return "ws://localhost:2567";
}

export default class HubScene extends Phaser.Scene {
  private client!: Client;
  private uiRoot?: Phaser.GameObjects.DOMElement;

  constructor() {
    super("hub");
  }

  preload() {
    this.load.html("hub-ui", "/ui/hub.html");
  }

  create() {
    if (!auth.user) {
      this.scene.start("auth");
      return;
    }

    // colyseus auth will happen via cookie during websocket upgrade
    this.client = new Client(getWsUrl());

    this.uiRoot = this.add
      .dom(this.cameras.main.centerX, this.cameras.main.centerY)
      .createFromCache("hub-ui");

    this.uiRoot.setOrigin(0.5, 0.5);
    this.uiRoot.setDepth(1000);

    const el = this.uiRoot.node as HTMLDivElement;

    const signedInAs = el.querySelector<HTMLDivElement>("#signedInAs")!;
    const roomIdInput = el.querySelector<HTMLInputElement>("#roomId")!;
    const status = el.querySelector<HTMLDivElement>("#status")!;
    const logoutBtn = el.querySelector<HTMLButtonElement>("#logout")!;

    const displayName = auth.user.displayName ?? auth.user.email ?? "Unknown";
    signedInAs.innerText = `Signed in as: ${displayName}`;

    const goLobby = (room: Room) => {
      this.uiRoot?.destroy();
      this.uiRoot = undefined;
      this.scene.start("lobby", { room });
    };

    logoutBtn.onclick = async () => {
      status.innerText = "Logging out...";
      await auth.logout();

      this.uiRoot?.destroy();
      this.uiRoot = undefined;
      this.scene.start("auth");
    };

    el.querySelector<HTMLButtonElement>("#host")!.onclick = async () => {
      status.innerText = "Hosting...";
      try {
        const room = await this.client.create("arena", {});
        status.innerText = `Hosted! Room ID: ${room.roomId}`;
        goLobby(room);
      } catch (err) {
        status.innerText = `Host failed: ${String(err)}`;
      }
    };

    el.querySelector<HTMLButtonElement>("#join")!.onclick = async () => {
      const roomId = roomIdInput.value.trim();
      if (!roomId) {
        status.innerText = "Paste a Room ID first.";
        return;
      }

      status.innerText = "Joining...";
      try {
        const room = await this.client.joinById(roomId, {});
        goLobby(room);
      } catch (err) {
        status.innerText = `Join failed: ${String(err)}`;
      }
    };
  }
}
