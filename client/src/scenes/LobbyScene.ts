import Phaser from "phaser";
import type { Room } from "colyseus.js";

type LobbySceneData = {
  room: Room;
};

export default class LobbyScene extends Phaser.Scene {
  private room!: Room;
  private uiRoot?: Phaser.GameObjects.DOMElement;

  private playerListText?: Phaser.GameObjects.Text;
  private statusText?: Phaser.GameObjects.Text;

  constructor() {
    super("lobby");
  }

  init(data: LobbySceneData) {
    this.room = data.room;
    console.log("[Lobby] roomId =", this.room.roomId, "sessionId =", this.room.sessionId);
  }

  create() {
    // Basic background
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1d1f27).setOrigin(0);

    // HUD (always visible)
    const hud = this.add.text(
      16,
      16,
      `Room: ${this.room.roomId}\nYou: ${this.room.sessionId}`,
      {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.5)",
        padding: { left: 8, right: 8, top: 6, bottom: 6 },
      }
    );
    hud.setScrollFactor(0);
    hud.setDepth(9999);

    this.statusText = this.add.text(16, 70, "", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "14px",
      color: "#ffffff",
    });

    this.playerListText = this.add.text(16, 105, "", {
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: "14px",
      color: "#ffffff",
      lineSpacing: 4,
    });

    // DOM button container
    const html = `
      <div style="
        width: 360px;
        padding: 14px;
        border-radius: 14px;
        background: rgba(0,0,0,0.55);
        color: #fff;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        text-align: center;
        pointer-events: auto;  /* ✅ important */
      ">
        <div style="font-size: 20px; font-weight: 700; margin-bottom: 10px;">Lobby</div>
        <div id="hint" style="font-size: 13px; opacity: 0.9; margin-bottom: 12px;">Waiting...</div>
        <button id="start" style="
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: none;
          background: #2f6fed;
          color: #fff;
          cursor: pointer;
          font-weight: 700;
          display: none;
        ">Start Game</button>
      </div>
    `;

    this.uiRoot = this.add.dom(this.scale.width / 2, this.scale.height / 2).createFromHTML(html);
    const el = this.uiRoot.node as HTMLDivElement;
    const hint = el.querySelector<HTMLDivElement>("#hint")!;
    const startBtn = el.querySelector<HTMLButtonElement>("#start")!;

    const renderLobbyUI = () => {
      const state = this.room.state as any;
      const phase = state.phase as string;
      const hostId = state.hostId as string;

      const isHost = this.room.sessionId === hostId;

      if (phase === "lobby") {
        if (isHost) {
          hint.innerText = "You are the host. Start when ready.";
          startBtn.style.display = "block";
        } else {
          hint.innerText = "Waiting for host to start...";
          startBtn.style.display = "none";
        }
      } else if (phase === "playing") {
        hint.innerText = "Starting...";
        startBtn.style.display = "none";
      } else {
        hint.innerText = `Phase: ${phase}`;
        startBtn.style.display = "none";
      }

      this.statusText?.setText(`Host: ${hostId || "(none)"}   Phase: ${phase}`);
    };

    startBtn.onclick = () => {
      this.room.send("start_game");
    };

    // Player list rendering
    const renderPlayers = () => {
      const players = (this.room.state as any).players;
      if (!players || !this.playerListText) return;

      const lines: string[] = [];
      players.forEach((p: any, sid: string) => {
        const me = sid === this.room.sessionId ? " (you)" : "";
        const host = sid === (this.room.state as any).hostId ? " [host]" : "";
        lines.push(`${p.name ?? "Player"} - ${p.class ?? "melee"}${host}${me}`);
      });

      this.playerListText.setText(["Players:", ...lines].join("\n"));
    };

    // Initial render
    renderLobbyUI();
    renderPlayers();

    // React to state changes
    // Phase changes: move everyone to arena
    this.room.onStateChange(() => {
      renderLobbyUI();

      const phase = (this.room.state as any).phase as string;
      if (phase === "playing") {
        this.uiRoot?.destroy();
        this.uiRoot = undefined;

        this.scene.start("arena", { room: this.room });
      }
    });


    // Players add/remove: update list
    const players = (this.room.state as any).players;
    if (players) {
      players.onAdd = () => {
        renderPlayers();
        renderLobbyUI();
      };
      players.onRemove = () => {
        renderPlayers();
        renderLobbyUI();
      };
    }

    // Keep centered on resize
    this.scale.on("resize", () => {
      this.uiRoot?.setPosition(this.scale.width / 2, this.scale.height / 2);
    });

    // Nice-to-have: handle disconnects
    this.room.onLeave(() => {
      this.uiRoot?.destroy();
      this.uiRoot = undefined;
      this.scene.start("menu");
    });
  }
}
