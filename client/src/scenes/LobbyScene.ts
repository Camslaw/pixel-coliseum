import Phaser from "phaser";
import type { Room } from "colyseus.js";

type LobbySceneData = { room: Room };

export default class LobbyScene extends Phaser.Scene {
  private room!: Room;
  private uiRoot?: Phaser.GameObjects.DOMElement;

  constructor() {
    super("lobby");
  }

  preload() {
    this.load.html("lobby-ui", "/ui/lobby.html");
  }

  init(data: LobbySceneData) {
    this.room = data.room;
    console.log("[Lobby] roomId =", this.room.roomId, "sessionId =", this.room.sessionId);
  }

  create() {
    // debug: prove the scene is running
    // this.add.text(600, 360, "LOBBY SCENE LOADED", { fontFamily: "monospace", fontSize: "24px", color: "#fff" })
    //   .setOrigin(0.5).setDepth(99999);

    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1d1f27).setOrigin(0);

    this.uiRoot = this.add
      .dom(this.cameras.main.centerX, this.cameras.main.centerY)
      .createFromCache("lobby-ui");

    this.uiRoot.setOrigin(0.5, 0.5);
    this.uiRoot.setDepth(1000);

    const el = this.uiRoot.node as HTMLDivElement;

    const roomIdText = el.querySelector<HTMLSpanElement>("#roomIdText");
    const sessionIdText = el.querySelector<HTMLSpanElement>("#sessionIdText");
    const hint = el.querySelector<HTMLDivElement>("#hint");
    const playersBox = el.querySelector<HTMLDivElement>("#players");
    const startBtn = el.querySelector<HTMLButtonElement>("#start");
    const status = el.querySelector<HTMLDivElement>("#status");

    if (!roomIdText || !sessionIdText || !hint || !playersBox || !startBtn || !status) {
      console.error("[Lobby] Missing expected DOM nodes. Check lobby.html ids.");
      return;
    }

    roomIdText.innerText = this.room.roomId;
    sessionIdText.innerText = this.room.sessionId;

    const recenter = () => {
      this.uiRoot?.updateSize();
      this.uiRoot?.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);
    };

    this.time.delayedCall(0, recenter);
    this.scale.on("resize", recenter);

    const renderPlayers = () => {
      const players = (this.room.state as any).players;
      if (!players) {
        playersBox.innerText = "-";
        return;
      }

      const lines: string[] = [];
      players.forEach((p: any, sid: string) => {
        const me = sid === this.room.sessionId ? " (you)" : "";
        const host = sid === (this.room.state as any).hostId ? " [host]" : "";
        lines.push(`${p.name ?? "Player"} - ${p.class ?? "sword"}${host}${me}`);
      });

      playersBox.innerText = lines.length ? lines.join("\n") : "-";
    };

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

      status.innerText = `Host: ${hostId || "(none)"}   Phase: ${phase}`;
    };

    startBtn.onclick = () => this.room.send("start_game");

    renderLobbyUI();
    renderPlayers();
    recenter();

    this.room.onStateChange(() => {
      renderLobbyUI();
      renderPlayers();
      recenter();

      const phase = (this.room.state as any).phase as string;
      if (phase === "playing") {
        this.uiRoot?.destroy();
        this.uiRoot = undefined;
        this.scene.start("arena", { room: this.room });
      }
    });

    this.room.onLeave(() => {
      this.uiRoot?.destroy();
      this.uiRoot = undefined;
      this.scene.start("menu");
    });
  }

}
