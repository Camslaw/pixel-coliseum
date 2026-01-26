import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import { auth } from "../auth";

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

    if (auth.token) {
      this.client.auth.token = auth.token;
    }

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

    const authStatus = el.querySelector<HTMLDivElement>("#authStatus")!;
    const authError = el.querySelector<HTMLDivElement>("#authError")!;

    const emailInput = el.querySelector<HTMLInputElement>("#email")!;
    const passwordInput = el.querySelector<HTMLInputElement>("#password")!;
    const displayNameRow = el.querySelector<HTMLDivElement>("#displayNameRow")!;
    const displayNameInput = el.querySelector<HTMLInputElement>("#displayName")!;

    const loginBtn = el.querySelector<HTMLButtonElement>("#loginBtn")!;
    const signupModeBtn = el.querySelector<HTMLButtonElement>("#signupModeBtn")!;
    const logoutBtn = el.querySelector<HTMLButtonElement>("#logoutBtn")!;

    const setSelected = (cls: PlayerClass) => {
      this.selectedClass = cls;
      classHint.innerText = `Selected: ${cls}`;
    };

    el.querySelector<HTMLButtonElement>("#sword")!.onclick = () => setSelected("sword");
    el.querySelector<HTMLButtonElement>("#bow")!.onclick = () => setSelected("bow");
    el.querySelector<HTMLButtonElement>("#magic")!.onclick = () => setSelected("magic");

    // --- AUTH UI LOGIC ---
    const requireAuth = (): boolean => {
      if (!auth.user) {
        status.innerText = "Please sign in to play.";
        return false;
      }
      return true;
    };

    let signupMode = false;

    const setAuthError = (msg: string | null) => {
      authError.innerText = msg ?? "";
    };

    const renderAuth = () => {
      if (auth.user) {
        authStatus.innerText = `Signed in as ${auth.user.displayName} (${auth.user.email})`;
        logoutBtn.style.display = "inline-block";
        loginBtn.style.display = "none";
        signupModeBtn.style.display = "none";
        displayNameRow.style.display = "none";

        nameInput.value = auth.user.displayName;
        nameInput.disabled = true;
      } else {
        authStatus.innerText = "Not signed in";
        logoutBtn.style.display = "none";
        loginBtn.style.display = "inline-block";
        signupModeBtn.style.display = "inline-block";
        displayNameRow.style.display = signupMode ? "block" : "none";

        nameInput.disabled = false;
      }
    };

    // initial paint
    renderAuth();

    signupModeBtn.onclick = () => {
      signupMode = !signupMode;
      signupModeBtn.innerText = signupMode ? "Back to Login" : "Signup";
      setAuthError(null);
      renderAuth();
    };

    loginBtn.onclick = async () => {
      setAuthError(null);

      try {
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (signupMode) {
          const displayName = displayNameInput.value.trim();
          await auth.signup(email, password, displayName);
        } else {
          await auth.login(email, password);
        }

        if (auth.token) {
          this.client.auth.token = auth.token;
        }

        passwordInput.value = "";
        renderAuth();
        status.innerText = "Signed in.";
      } catch (e: any) {
        setAuthError(e?.message ?? "AUTH_FAILED");
      }
    };

    logoutBtn.onclick = async () => {
      setAuthError(null);
      await auth.logout();
      renderAuth();
      status.innerText = "Logged out.";
    };
    // --- /AUTH UI LOGIC ---

    el.querySelector<HTMLButtonElement>("#host")!.onclick = async () => {
      console.log("[Menu] Host clicked. user=", auth.user, "token?", !!auth.token);

      if (!requireAuth()) return;

      if (auth.token) this.client.auth.token = auth.token;
      
      const playerName = auth.user?.displayName ?? (nameInput.value.trim() || "Player");

      status.innerText = "Hosting...";
      try {
        const room = await this.client.create("arena", {
          name: playerName,
          class: this.selectedClass,
        });

        status.innerText = `Hosted! Room ID: ${room.roomId} (copy this to join from another tab)`;

        this.startLobby(room);
      } catch (err) {
        status.innerText = `Host failed: ${String(err)}`;
      }
    };

    el.querySelector<HTMLButtonElement>("#join")!.onclick = async () => {
      if (!requireAuth()) return;

      const roomId = roomIdInput.value.trim();
      if (!roomId) {
        status.innerText = "Paste a Room ID first.";
        return;
      }

      const playerName = auth.user?.displayName ?? (nameInput.value.trim() || "Player");

      status.innerText = "Joining...";
      try {
        const room = await this.client.joinById(roomId, {
          name: playerName,
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
