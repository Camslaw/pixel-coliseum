import * as api from "./api/auth";

export type User = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
};

class Auth {
  user: User | null = null;

  // used only for email verification UI
  pendingVerifyEmail: string | null = localStorage.getItem("pc.pendingEmail");

  async restore() {
    try {
      this.user = await api.me();
      return this.user;
    } catch {
      this.user = null;
      return null;
    }
  }

  async login(email: string, password: string) {
    try {
      const { user } = await api.login(email, password);

      this.user = user;

      // clear verify flow if successful
      this.pendingVerifyEmail = null;
      localStorage.removeItem("pc.pendingEmail");

      return this.user;
    } catch (e: any) {
      // if server says not verified, remember email so UI can show verify screen
      if (String(e?.message) === "EMAIL_NOT_VERIFIED") {
        this.pendingVerifyEmail = email.trim().toLowerCase();
        localStorage.setItem("pc.pendingEmail", this.pendingVerifyEmail);
      }

      throw e;
    }
  }

  async signup(email: string, password: string, displayName: string) {
    const { user } = await api.signup(email, password, displayName);

    // not authenticated yet (must verify email)
    this.user = null;

    // force verify flow
    this.pendingVerifyEmail = user.email;
    localStorage.setItem("pc.pendingEmail", user.email);

    return null;
  }

  async verifyEmail(code: string) {
    if (!this.pendingVerifyEmail) throw new Error("MISSING_EMAIL");

    const { user } = await api.verifyEmail(this.pendingVerifyEmail, code);

    this.user = user;

    this.pendingVerifyEmail = null;
    localStorage.removeItem("pc.pendingEmail");

    return this.user;
  }

  async resendVerification() {
    if (!this.pendingVerifyEmail) throw new Error("MISSING_EMAIL");
    await api.resendVerification(this.pendingVerifyEmail);
  }

  async logout() {
    await api.logout();

    this.user = null;
    this.pendingVerifyEmail = null;

    localStorage.removeItem("pc.pendingEmail");
  }
}

export const auth = new Auth();
