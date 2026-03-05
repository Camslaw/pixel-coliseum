import Phaser from "phaser";
import { Client } from "colyseus.js";
import { auth } from "../auth";

function getWsUrl(): string {
  const ws = import.meta.env.VITE_WS_URL as string | undefined;
  if (ws && ws.trim()) return ws;

  const api = import.meta.env.VITE_API_URL as string | undefined;
  if (api && api.trim()) {
    const u = new URL(api);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString().replace(/\/$/, "");
  }

  return "ws://localhost:2567";
}

export default class AuthScene extends Phaser.Scene {
  private client!: Client;
  private uiRoot?: Phaser.GameObjects.DOMElement;

  constructor() {
    super("auth");
  }

  preload() {
    this.load.html("auth-ui", "/ui/auth.html");
  }

  async create() {
    this.client = new Client(getWsUrl());

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
        this.uiRoot?.destroy();
        this.scene.start("hub");
      }
    };

    const forceLoginMode = () => {
      signupMode = false;
      signupModeBtn.innerText = "Signup";
    };

    const renderAuth = () => {
      // verify mode
      if (auth.pendingVerifyEmail) {
        forceLoginMode();
        authBox.style.display = "none";
        verifyOnlyBox.style.display = "block";
        resetBox.style.display = "none";
        verifyStatus.innerText = `Code sent to ${auth.pendingVerifyEmail}`;
        emailInput.value = auth.pendingVerifyEmail ?? "";
        return;
      }

      // reset mode
      if (auth.pendingResetEmail !== null) {
        forceLoginMode();
        authBox.style.display = "none";
        verifyOnlyBox.style.display = "none";
        resetBox.style.display = "block";

        resetEmailInput.value = auth.pendingResetEmail ?? "";
        resetStatus.innerText = "";
        return;
      }

      // logged out mode
      if (!auth.user) {
        authBox.style.display = "block";
        verifyOnlyBox.style.display = "none";
        resetBox.style.display = "none";

        authStatus.innerText = "Not signed in";
        logoutBtn.style.display = "none";
        loginBtn.style.display = "inline-block";
        signupModeBtn.style.display = "inline-block";
        displayNameRow.style.display = signupMode ? "block" : "none";
        if (confirmPasswordRow) confirmPasswordRow.style.display = signupMode ? "block" : "none";

        verifyStatus.innerText = "";
        verifyCodeInput.value = "";
        return;
      }

      // logged in + verified
      if (auth.user.emailVerified) {
        authBox.style.display = "none";
        verifyOnlyBox.style.display = "none";
        resetBox.style.display = "none";
        return;
      }

      // logged in but unverified -> force verify
      forceLoginMode();
      auth.pendingVerifyEmail = auth.user.email;
      localStorage.setItem("pc.pendingEmail", auth.pendingVerifyEmail);
      authBox.style.display = "none";
      verifyOnlyBox.style.display = "block";
      resetBox.style.display = "none";
      verifyStatus.innerText = `Code sent to ${auth.pendingVerifyEmail}`;
    };

    // ---- SESSION RESTORE (IMPORTANT) ----
    status.innerText = "Checking session...";
    await auth.restore(); // reads cookie session via /auth/me
    status.innerText = "";

    passwordInput.value = "";
    if (confirmPasswordInput) confirmPasswordInput.value = "";

    renderAuth();
    goNextIfAuthed();

    signupModeBtn.onclick = () => {
      signupMode = !signupMode;
      signupModeBtn.innerText = signupMode ? "Back to Login" : "Signup";
      setAuthError(null);
      if (confirmPasswordInput) confirmPasswordInput.value = "";
      renderAuth();
    };

    loginBtn.onclick = async () => {
      setAuthError(null);
      status.innerText = "";

      try {
        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (signupMode) {
          const displayName = displayNameInput.value.trim();
          const confirm = confirmPasswordInput?.value ?? "";

          if (password !== confirm) {
            setAuthError("Passwords do not match.");
            return;
          }

          status.innerText = "Creating account...";
          await auth.signup(email, password, displayName);
        } else {
          status.innerText = "Signing in...";
          await auth.login(email, password);
        }

        status.innerText = "";
        renderAuth();
        goNextIfAuthed();

        if (auth.user?.emailVerified) passwordInput.value = "";
      } catch (e: any) {
        status.innerText = "";
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

        verifyStatus.innerText = "Verifying...";
        await auth.verifyEmail(code);

        verifyCodeInput.value = "";
        verifyStatus.innerText = "";
        renderAuth();
        goNextIfAuthed();
      } catch (e: any) {
        verifyStatus.innerText = e?.message ?? "VERIFY_FAILED";
      }
    };

    resendBtn.onclick = async () => {
      try {
        await auth.resendVerification();
        verifyStatus.innerText = "Code resent.";
      } catch (e: any) {
        verifyStatus.innerText = e?.message ?? "RESEND_FAILED";
      }
    };

    backToAuthBtn.onclick = () => {
      forceLoginMode();

      auth.pendingVerifyEmail = null;
      localStorage.removeItem("pc.pendingEmail");

      verifyCodeInput.value = "";
      verifyStatus.innerText = "";
      setAuthError(null);

      renderAuth();
      passwordInput.focus();
    };

    logoutBtn.onclick = async () => {
      setAuthError(null);
      status.innerText = "Logging out...";
      await auth.logout();
      status.innerText = "";

      if (confirmPasswordInput) confirmPasswordInput.value = "";
      passwordInput.value = "";
      renderAuth();
      status.innerText = "Logged out.";
    };

    forgotBtn.onclick = () => {
      const e = emailInput.value.trim().toLowerCase();

      auth.pendingResetEmail = e;
      localStorage.setItem("pc.pendingResetEmail", e);

      resetEmailInput.value = e;
      resetStatus.innerText = "";
      renderAuth();
    };

    sendResetCodeBtn.onclick = async () => {
      setAuthError(null);
      resetStatus.innerText = "";

      try {
        const e = resetEmailInput.value.trim().toLowerCase();
        resetStatus.innerText = "Sending code...";
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
        resetStatus.innerText = "Resetting password...";
        await auth.resetPassword(code, pw);

        resetCodeInput.value = "";
        resetNewPwInput.value = "";
        resetConfirmPwInput.value = "";
        passwordInput.value = "";

        resetStatus.innerText = "Password reset. Please log in.";

        // exit reset mode
        auth.pendingResetEmail = null;
        localStorage.removeItem("pc.pendingResetEmail");

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
