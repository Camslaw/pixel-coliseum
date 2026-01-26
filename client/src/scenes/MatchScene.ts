import Phaser from "phaser";
import { Client } from "colyseus.js";
import { auth } from "../auth";
import type { Room } from "colyseus.js";

export default class MatchScene extends Phaser.Scene {
  private client!: Client;
  private uiRoot?: Phaser.GameObjects.DOMElement;

  constructor() {
    super("match");
  }

  preload() {
    this.load.html("match-ui", "/ui/match.html");
  }

  create() {
    // must be signed in
    if (!auth.user || !auth.token) {
      this.scene.start("menu");
      return;
    }

    this.client = new Client("ws://localhost:2567");
    this.client.auth.token = auth.token;

    this.uiRoot = this.add
      .dom(this.cameras.main.centerX, this.cameras.main.centerY)
      .createFromCache("match-ui");

    this.uiRoot.setOrigin(0.5, 0.5);
    this.uiRoot.setDepth(1000);

    const el = this.uiRoot.node as HTMLDivElement;

    const roomIdInput = el.querySelector<HTMLInputElement>("#roomId")!;
    const status = el.querySelector<HTMLDivElement>("#status")!;
    const logoutBtn = el.querySelector<HTMLButtonElement>("#logout")!;

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
      this.scene.start("menu");
    };

    el.querySelector<HTMLButtonElement>("#host")!.onclick = async () => {
      status.innerText = "Hosting...";
      try {
        const room = await this.client.create("arena", {
          // name comes from server auth displayName
        });

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
        const room = await this.client.joinById(roomId, {
          // name comes from server auth displayName
        });

        goLobby(room);
      } catch (err) {
        status.innerText = `Join failed: ${String(err)}`;
      }
    };
  }
}
