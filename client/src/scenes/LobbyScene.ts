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
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1d1f27).setOrigin(0);

    this.uiRoot = this.add
      .dom(this.cameras.main.centerX, this.cameras.main.centerY)
      .createFromCache("lobby-ui");

    this.uiRoot.setOrigin(0.5, 0.5);
    this.uiRoot.setDepth(1000);

    const el = this.uiRoot.node as HTMLDivElement;

    const roomIdText = el.querySelector<HTMLSpanElement>("#roomIdText");
    const copyBtn = el.querySelector<HTMLButtonElement>("#copyRoomId");
    const copyMsg = el.querySelector<HTMLSpanElement>("#copyMsg");
    const hint = el.querySelector<HTMLDivElement>("#hint");
    const playersBox = el.querySelector<HTMLDivElement>("#players");
    const startBtn = el.querySelector<HTMLButtonElement>("#start");
    const leaveBtn = el.querySelector<HTMLButtonElement>("#leaveLobby");
    const classHint = el.querySelector<HTMLDivElement>("#classHint");
    const clsSword = el.querySelector<HTMLButtonElement>("#clsSword");
    const clsBow = el.querySelector<HTMLButtonElement>("#clsBow");
    const clsMagic = el.querySelector<HTMLButtonElement>("#clsMagic");

    if (!classHint || !clsSword || !clsBow || !clsMagic) {
      console.error("[Lobby] Missing class picker DOM nodes.");
      return;
    }

    const setClass = (cls: "sword" | "bow" | "magic") => {
      classHint.innerText = `Selected: ${cls}`;
      this.room.send("set_class", { class: cls });
    };

    clsSword.onclick = () => setClass("sword");
    clsBow.onclick = () => setClass("bow");
    clsMagic.onclick = () => setClass("magic");

    const me = (this.room.state as any).players?.get?.(this.room.sessionId);
    if (me?.class) classHint.innerText = `Selected: ${me.class}`;
    else setClass("sword");

    if (!roomIdText || !copyBtn || !hint || !playersBox || !startBtn || !leaveBtn) {
      console.error("[Lobby] Missing expected DOM nodes. Check lobby.html ids.");
      return;
    }

    roomIdText.innerText = this.room.roomId;

    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(this.room.roomId);

        if (copyMsg) {
          copyMsg.innerText = "Copied!";
          copyMsg.style.opacity = "1";

          this.time.delayedCall(1200, () => {
            copyMsg.style.opacity = "0";
          });
        }
      } catch (err) {
        console.error("Clipboard failed:", err);
      }
    };

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
    };

    startBtn.onclick = () => this.room.send("start_game");

    leaveBtn.onclick = () => {
      console.log("[Lobby] Leave clicked");
      this.room.leave();
    };

    this.room.onLeave(() => {
      this.uiRoot?.destroy();
      this.uiRoot = undefined;
      this.scene.start("match");
    });

    renderLobbyUI();
    renderPlayers();
    recenter();

    const tryInitMyClass = () => {
      const players = (this.room.state as any).players;
      const me = players?.get?.(this.room.sessionId);

      if (me?.class) {
        classHint.innerText = `Selected: ${me.class}`;
      } else {
        // default the first time we actually see ourselves
        setClass("sword");
      }
    };

    this.room.onStateChange(() => {
      renderLobbyUI();
      renderPlayers();
      tryInitMyClass();
      recenter();

      const phase = (this.room.state as any).phase as string;
      if (phase === "playing") {
        this.uiRoot?.destroy();
        this.uiRoot = undefined;
        this.scene.start("arena", { room: this.room });
      }
    });
  }
}
