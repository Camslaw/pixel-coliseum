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
    this.client = new Client(import.meta.env.VITE_WS_URL);

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

    const resetBox = el.querySelector<HTMLDivElement>("#resetBox")!;
    const forgotBtn = el.querySelector<HTMLButtonElement>("#forgotBtn")!;
    const resetEmailInput = el.querySelector<HTMLInputElement>("#resetEmail")!;
    const resetCodeInput = el.querySelector<HTMLInputElement>("#resetCode")!;
    const resetNewPwInput = el.querySelector<HTMLInputElement>("#resetNewPassword")!;
    const resetConfirmPwInput = el.querySelector<HTMLInputElement>("#resetConfirmPassword")!;
    const sendResetCodeBtn = el.querySelector<HTMLButtonElement>("#sendResetCodeBtn")!;
    const doResetBtn = el.querySelector<HTMLButtonElement>("#doResetBtn")!;
    const resetBackBtn = el.querySelector<HTMLButtonElement>("#resetBackBtn")!;
    const resetStatus = el.querySelector<HTMLDivElement>("#resetStatus")!;

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
      // 1) VERIFY MODE (highest priority)
      if (auth.pendingVerifyEmail) {
        forceLoginMode();
        authBox.style.display = "none";
        verifyOnlyBox.style.display = "block";
        resetBox.style.display = "none";
        verifyStatus.innerText = `Code sent to ${auth.pendingVerifyEmail}`;
        emailInput.value = auth.pendingVerifyEmail ?? "";
        return;
      }

      // 2) RESET MODE (next priority)
      // RESET MODE (next priority)
      if (auth.pendingResetEmail !== null) {
        forceLoginMode();
        authBox.style.display = "none";
        verifyOnlyBox.style.display = "none";
        resetBox.style.display = "block";

        resetEmailInput.value = auth.pendingResetEmail ?? "";
        resetStatus.innerText = "";
        return;
      }

      // 3) LOGGED OUT MODE
      if (!auth.user) {
        authBox.style.display = "block";
        verifyOnlyBox.style.display = "none";
        resetBox.style.display = "none";

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

      // 4) LOGGED IN
      if (auth.user.emailVerified) {
        authBox.style.display = "none";
        verifyOnlyBox.style.display = "none";
        resetBox.style.display = "none";
        return;
      }

      // 5) SAFETY: logged in but unverified -> force verify
      forceLoginMode();
      auth.pendingVerifyEmail = auth.user.email;
      localStorage.setItem("pc.pendingEmail", auth.pendingVerifyEmail);
      authBox.style.display = "none";
      verifyOnlyBox.style.display = "block";
      resetBox.style.display = "none";
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

    forgotBtn.onclick = () => {
      const e = emailInput.value.trim().toLowerCase();

      // Enter reset mode even if e is ""
      auth.pendingResetEmail = e;
      localStorage.setItem("pc.pendingResetEmail", e);

      // seed reset screen
      resetEmailInput.value = e;
      resetStatus.innerText = "";

      renderAuth();
    };

    sendResetCodeBtn.onclick = async () => {
      setAuthError(null);
      resetStatus.innerText = "";

      try {
        const e = resetEmailInput.value.trim().toLowerCase();
        await auth.requestPasswordReset(e);
        resetStatus.innerText = `Code sent to ${e}`;
      } catch (err: any) {
        resetStatus.innerText = err?.message ?? "RESET_REQUEST_FAILED";
      }
    };

    doResetBtn.onclick = async () => {
      setAuthError(null);
      resetStatus.innerText = "";

      const code = resetCodeInput.value.trim();
      const pw = resetNewPwInput.value;
      const confirm = resetConfirmPwInput.value;

      if (!/^\d{6}$/.test(code)) {
        resetStatus.innerText = "Enter the 6-digit code.";
        return;
      }
      if (pw !== confirm) {
        resetStatus.innerText = "Passwords do not match.";
        return;
      }

      try {
        await auth.resetPassword(code, pw);

        // return to login
        resetCodeInput.value = "";
        resetNewPwInput.value = "";
        resetConfirmPwInput.value = "";
        passwordInput.value = "";

        resetStatus.innerText = "Password reset. Please log in.";
        renderAuth();
      } catch (err: any) {
        resetStatus.innerText = err?.message ?? "RESET_FAILED";
      }
    };

    resetBackBtn.onclick = () => {
      auth.pendingResetEmail = null;
      localStorage.removeItem("pc.pendingResetEmail");

      resetEmailInput.value = "";
      resetCodeInput.value = "";
      resetNewPwInput.value = "";
      resetConfirmPwInput.value = "";
      resetStatus.innerText = "";

      renderAuth();
    };
  }
}
