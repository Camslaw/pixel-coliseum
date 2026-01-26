import Phaser from "phaser";
import { Client } from "colyseus.js";
import { auth } from "../auth";

export default class MenuScene extends Phaser.Scene {
  private client!: Client;
  private uiRoot?: Phaser.GameObjects.DOMElement;

  constructor() {
    super("menu");
  }

  preload() {
    this.load.html("auth-ui", "/ui/auth.html");
  }

  async create() {
    this.client = new Client("ws://localhost:2567");

    if (auth.token) {
      this.client.auth.token = auth.token;
    }

    // Optional: try to restore a session
    try {
      if (auth.token) {
        await auth.restore();
      }
    } catch {
      // ignore
    }

    this.uiRoot = this.add
      .dom(this.cameras.main.centerX, this.cameras.main.centerY)
      .createFromCache("auth-ui");

    this.uiRoot.setOrigin(0.5, 0.5);
    this.uiRoot.setDepth(1000);

    const recenter = () => {
      this.uiRoot?.updateSize();
      this.uiRoot?.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);
    };

    // run a few times to catch late layout (fonts/logo)
    this.time.delayedCall(0, recenter);
    this.time.delayedCall(50, recenter);
    this.time.delayedCall(150, recenter);

    this.scale.on("resize", recenter);

    // if logo affects height, recenter after it loads
    const logo = (this.uiRoot.node as HTMLDivElement).querySelector<HTMLImageElement>(".logo");
    if (logo) {
      if (logo.complete) recenter();
      else logo.addEventListener("load", recenter, { once: true });
    }

    const el = this.uiRoot.node as HTMLDivElement;

    const status = el.querySelector<HTMLDivElement>("#status")!;
    const authStatus = el.querySelector<HTMLDivElement>("#authStatus")!;
    const authError = el.querySelector<HTMLDivElement>("#authError")!;

    const emailInput = el.querySelector<HTMLInputElement>("#email")!;
    
    const passwordInput = el.querySelector<HTMLInputElement>("#password")!;
    const confirmPasswordRow = el.querySelector<HTMLDivElement>("#confirmPasswordRow");
    const confirmPasswordInput = el.querySelector<HTMLInputElement>("#confirmPassword");
    if (confirmPasswordRow) confirmPasswordRow.style.display = "none";

    const displayNameRow = el.querySelector<HTMLDivElement>("#displayNameRow")!;
    const displayNameInput = el.querySelector<HTMLInputElement>("#displayName")!;

    const loginBtn = el.querySelector<HTMLButtonElement>("#loginBtn")!;
    const signupModeBtn = el.querySelector<HTMLButtonElement>("#signupModeBtn")!;
    const logoutBtn = el.querySelector<HTMLButtonElement>("#logoutBtn")!;


    let signupMode = false;

    const setAuthError = (msg: string | null) => {
      authError.innerText = msg ?? "";
    };

    const goNextIfAuthed = () => {
      if (auth.user) {
        if (auth.token) this.client.auth.token = auth.token;
        this.uiRoot?.destroy();
        this.uiRoot = undefined;
        this.scene.start("match"); // <-- next screen
      }
    };

    const renderAuth = () => {
      if (auth.user) {
        authStatus.innerText = `Signed in as ${auth.user.displayName} (${auth.user.email})`;
        logoutBtn.style.display = "inline-block";
        loginBtn.style.display = "none";
        signupModeBtn.style.display = "none";
        displayNameRow.style.display = "none";
        status.innerText = "Signed in.";
      } else {
        authStatus.innerText = "Not signed in";
        logoutBtn.style.display = "none";
        loginBtn.style.display = "inline-block";
        signupModeBtn.style.display = "inline-block";
        displayNameRow.style.display = signupMode ? "block" : "none";
        confirmPasswordRow && (confirmPasswordRow.style.display = signupMode ? "block" : "none");
        status.innerText = "";
      }
    };

    passwordInput.value = "";
    confirmPasswordInput && (confirmPasswordInput.value = "");
    renderAuth();
    goNextIfAuthed();

    signupModeBtn.onclick = () => {
      signupMode = !signupMode;
      signupModeBtn.innerText = signupMode ? "Back to Login" : "Signup";
      setAuthError(null);
      confirmPasswordInput && (confirmPasswordInput.value = "");
      renderAuth();
    };

    loginBtn.onclick = async () => {
      setAuthError(null);
      try {
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (signupMode) {
          const displayName = displayNameInput.value.trim();
          const confirm = confirmPasswordInput?.value ?? "";

          if (password !== confirm) {
            setAuthError("Passwords do not match.");
            return;
          }

          await auth.signup(email, password, displayName);
        } else {
          await auth.login(email, password);
        }

        if (auth.token) this.client.auth.token = auth.token;

        passwordInput.value = "";
        renderAuth();
        goNextIfAuthed();
      } catch (e: any) {
        setAuthError(e?.message ?? "AUTH_FAILED");
      }
    };

    logoutBtn.onclick = async () => {
      setAuthError(null);
      await auth.logout();
      confirmPasswordInput && (confirmPasswordInput.value = "");
      passwordInput.value = "";
      renderAuth();
      status.innerText = "Logged out.";
    };
  }
}
