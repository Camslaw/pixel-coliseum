import Phaser from "phaser";
import { Client, Room } from "colyseus.js";

type PlayerClass = "sword" | "bow" | "magic";

export default class MenuScene extends Phaser.Scene {
  private client!: Client;
  private selectedClass: PlayerClass = "sword";
  private uiRoot?: Phaser.GameObjects.DOMElement;

  constructor() {
    super("menu");
  }

  preload() {
    this.load.html("menu-ui", "/ui/menu.html");
  }
  
  create() {
    this.client = new Client("ws://localhost:2567");

    this.uiRoot = this.add
      .dom(this.cameras.main.centerX, this.cameras.main.centerY)
      .createFromCache("menu-ui");

    this.uiRoot.setOrigin(0.5, 0.5);
    this.uiRoot.setDepth(1000);

    const el = this.uiRoot.node as HTMLDivElement;
    const logo = el.querySelector<HTMLImageElement>(".logo");

    const recenter = () => {
      this.uiRoot?.updateSize();
      this.uiRoot?.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);
    };

    if (logo) {
      if (logo.complete) {
        recenter();
      } else {
        logo.addEventListener("load", recenter, { once: true });
      }
    }

    this.time.delayedCall(0, recenter);

    this.scale.on("resize", recenter);

    const nameInput = el.querySelector<HTMLInputElement>("#name")!;
    const roomIdInput = el.querySelector<HTMLInputElement>("#roomId")!;
    const status = el.querySelector<HTMLDivElement>("#status")!;
    const classHint = el.querySelector<HTMLDivElement>("#classHint")!;

    const setSelected = (cls: PlayerClass) => {
      this.selectedClass = cls;
      classHint.innerText = `Selected: ${cls}`;
    };

    el.querySelector<HTMLButtonElement>("#sword")!.onclick = () => setSelected("sword");
    el.querySelector<HTMLButtonElement>("#bow")!.onclick = () => setSelected("bow");
    el.querySelector<HTMLButtonElement>("#magic")!.onclick = () => setSelected("magic");

    el.querySelector<HTMLButtonElement>("#host")!.onclick = async () => {
      status.innerText = "Hosting...";
      try {
        const room = await this.client.create("arena", {
          name: nameInput.value.trim() || "Player",
          class: this.selectedClass,
        });

        status.innerText = `Hosted! Room ID: ${room.roomId} (copy this to join from another tab)`;

        this.startLobby(room);
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
          name: nameInput.value.trim() || "Player",
          class: this.selectedClass,
        });

        this.startLobby(room);
      } catch (err) {
        status.innerText = `Join failed: ${String(err)}`;
      }
    };

    this.scale.on("resize", () => {
      this.uiRoot?.setPosition(this.scale.width / 2, this.scale.height / 2);
    });
  }

  private startArena(room: Room) {
    this.uiRoot?.destroy();
    this.uiRoot = undefined;

    this.scene.start("arena", { room });
  }

  private startLobby(room: Room) {
    this.uiRoot?.destroy();
    this.uiRoot = undefined;

    this.scene.start("lobby", { room });
  }

}
