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

    const authBox = el.querySelector<HTMLDivElement>("#authBox")!;
    const verifyOnlyBox = el.querySelector<HTMLDivElement>("#verifyOnlyBox")!;
    const verifyCodeInput = el.querySelector<HTMLInputElement>("#verifyCode")!;
    const verifyBtn = el.querySelector<HTMLButtonElement>("#verifyBtn")!;
    const resendBtn = el.querySelector<HTMLButtonElement>("#resendBtn")!;
    const verifyStatus = el.querySelector<HTMLDivElement>("#verifyStatus")!;
    const backToAuthBtn = el.querySelector<HTMLButtonElement>("#backToAuthBtn")!;

    const loginBtn = el.querySelector<HTMLButtonElement>("#loginBtn")!;
    const signupModeBtn = el.querySelector<HTMLButtonElement>("#signupModeBtn")!;
    const logoutBtn = el.querySelector<HTMLButtonElement>("#logoutBtn")!;

    let signupMode = false;

    const setAuthError = (msg: string | null) => {
      authError.innerText = msg ?? "";
    };

    const goNextIfAuthed = () => {
      if (auth.user && auth.user.emailVerified) {
        if (auth.token) this.client.auth.token = auth.token;
        this.uiRoot?.destroy();
        this.scene.start("match");
      }
    };

    const forceLoginMode = () => {
      signupMode = false;
      signupModeBtn.innerText = "Signup";
    };

    const renderAuth = () => {
      // VERIFY MODE (highest priority)
      if (auth.pendingVerifyEmail) {
        forceLoginMode();
        authBox.style.display = "none";
        verifyOnlyBox.style.display = "block";
        verifyStatus.innerText = `Code sent to ${auth.pendingVerifyEmail}`;
        emailInput.value = auth.pendingVerifyEmail ?? "";
        return;
      }

      // LOGGED OUT MODE
      if (!auth.user) {
        authBox.style.display = "block";
        verifyOnlyBox.style.display = "none";

        authStatus.innerText = "Not signed in";
        logoutBtn.style.display = "none";
        loginBtn.style.display = "inline-block";
        signupModeBtn.style.display = "inline-block";
        displayNameRow.style.display = signupMode ? "block" : "none";
        confirmPasswordRow && (confirmPasswordRow.style.display = signupMode ? "block" : "none");

        verifyStatus.innerText = "";
        verifyCodeInput.value = "";
        return;
      }

      // LOGGED IN (but this should basically only happen for verified users)
      if (auth.user.emailVerified) {
        authBox.style.display = "none";
        verifyOnlyBox.style.display = "none";
        return;
      }

      // SAFETY: if user exists but unverified, force verify mode
      forceLoginMode();
      auth.pendingVerifyEmail = auth.user.email;
      localStorage.setItem("pc.pendingEmail", auth.pendingVerifyEmail);
      authBox.style.display = "none";
      verifyOnlyBox.style.display = "block";
      verifyStatus.innerText = `Code sent to ${auth.pendingVerifyEmail}`;
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

        // only clear password if we actually entered the game
        renderAuth();
        goNextIfAuthed();

        // clear password only if authed+verified
        if (auth.user?.emailVerified) {
          passwordInput.value = "";
        }
      } catch (e: any) {
        setAuthError(e?.message ?? "AUTH_FAILED");
        renderAuth();
      }
    };

    verifyBtn.onclick = async () => {
      setAuthError(null);
      verifyStatus.innerText = "";

      try {
        const code = verifyCodeInput.value.trim();
        if (!/^\d{6}$/.test(code)) {
          verifyStatus.innerText = "Enter the 6-digit code.";
          return;
        }

        await auth.verifyEmail(code);

        verifyCodeInput.value = "";
        renderAuth();
        goNextIfAuthed();
      } catch (e: any) {
        verifyStatus.innerText = e?.message ?? "VERIFY_FAILED";
      }
    };

    resendBtn.onclick = async () => {
      await auth.resendVerification();
      verifyStatus.innerText = "Code resent.";
    };

    backToAuthBtn.onclick = () => {
      // Always return to LOGIN screen (never signup)
      forceLoginMode();

      // Clear verify flow
      auth.pendingVerifyEmail = null;
      localStorage.removeItem("pc.pendingEmail");

      // Clear verify UI
      verifyCodeInput.value = "";
      verifyStatus.innerText = "";

      // Optional: clear any auth error too
      setAuthError(null);

      // Show login UI
      renderAuth();

      // Optional: focus password for quick retry
      passwordInput.focus();
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
