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

  create() {
    // Colyseus server default: ws://localhost:2567
    this.client = new Client("ws://localhost:2567");

    const html = `
      <div style="
        width: 520px;
        padding: 18px;
        border-radius: 14px;
        background: rgba(0,0,0,0.55);
        color: #fff;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      ">
        <div style="font-size: 24px; font-weight: 700; margin-bottom: 12px;">
          Pixel Coliseum
        </div>

        <div style="margin-bottom: 10px;">
          <label style="display:block; font-size: 13px; opacity: 0.9;">Name</label>
          <input id="name" type="text" placeholder="Player" value="Player"
            style="width: 100%; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff;" />
        </div>

        <div style="margin-bottom: 10px;">
          <div style="font-size: 13px; opacity: 0.9; margin-bottom: 6px;">Class</div>
          <div style="display:flex; gap: 10px;">
            <button id="sword" style="flex:1; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor:pointer;">Sword</button>
            <button id="bow"   style="flex:1; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor:pointer;">Bow</button>
            <button id="magic" style="flex:1; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; cursor:pointer;">Magic</button>
          </div>
          <div id="classHint" style="margin-top: 6px; font-size: 12px; opacity: 0.85;">Selected: sword</div>
        </div>

        <div style="margin-bottom: 10px;">
          <label style="display:block; font-size: 13px; opacity: 0.9;">Room ID (for Join)</label>
          <input id="roomId" type="text" placeholder="Paste room id here"
            style="width: 100%; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff;" />
        </div>

        <div style="display:flex; gap: 10px; margin-top: 12px;">
          <button id="host" style="flex:1; padding: 12px; border-radius: 12px; border: none; background: #2f6fed; color: #fff; cursor:pointer; font-weight: 700;">Host Game</button>
          <button id="join" style="flex:1; padding: 12px; border-radius: 12px; border: none; background: #1ea97c; color: #fff; cursor:pointer; font-weight: 700;">Join Game</button>
        </div>

        <div id="status" style="margin-top: 10px; font-size: 12px; opacity: 0.9;"></div>
      </div>
    `;

    // Center UI
    this.uiRoot = this.add.dom(this.scale.width / 2, this.scale.height / 2).createFromHTML(html);

    const el = this.uiRoot.node as HTMLDivElement;

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

        // Go to lobby before game
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

    // keep UI centered on resize
    this.scale.on("resize", () => {
      this.uiRoot?.setPosition(this.scale.width / 2, this.scale.height / 2);
    });
  }

  private startArena(room: Room) {
    // Remove menu UI
    this.uiRoot?.destroy();
    this.uiRoot = undefined;

    // Pass room to ArenaScene
    this.scene.start("arena", { room });
  }

  private startLobby(room: Room) {
    this.uiRoot?.destroy();
    this.uiRoot = undefined;

    this.scene.start("lobby", { room });
  }

}
