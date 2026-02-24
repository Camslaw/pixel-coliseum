import * as api from "./api/auth";

export type User = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
};

class Auth {
  user: User | null = null;
  token: string | null = localStorage.getItem("pc.token");
  pendingVerifyEmail: string | null = localStorage.getItem("pc.pendingEmail");
  pendingResetEmail: string | null = localStorage.getItem("pc.pendingResetEmail");

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
      const { user, token } = await api.login(email, password);
      this.user = user;
      this.token = token;
      localStorage.setItem("pc.token", token);

      // clear pending if successful
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

    // ensure we are not authenticated
    this.user = null;
    this.token = null;
    localStorage.removeItem("pc.token");

    // force verify flow
    this.pendingVerifyEmail = user.email;
    localStorage.setItem("pc.pendingEmail", user.email);

    return null;
  }

  async verifyEmail(code: string) {
    if (!this.pendingVerifyEmail) throw new Error("MISSING_EMAIL");

    const { user, token } = await api.verifyEmail(this.pendingVerifyEmail, code);

    this.user = user;
    this.token = token;
    localStorage.setItem("pc.token", token);

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
    this.token = null;
    this.pendingVerifyEmail = null;
    this.pendingResetEmail = null;
    localStorage.removeItem("pc.token");
    localStorage.removeItem("pc.pendingEmail");
    localStorage.removeItem("pc.pendingResetEmail");
  }

  async requestPasswordReset(email: string) {
    const e = email.trim().toLowerCase();
    await api.requestPasswordReset(e);
    this.pendingResetEmail = e;
    localStorage.setItem("pc.pendingResetEmail", e);
  }

  async resetPassword(code: string, newPassword: string) {
    if (!this.pendingResetEmail) throw new Error("MISSING_EMAIL");
    await api.resetPassword(this.pendingResetEmail, code, newPassword);
    this.pendingResetEmail = null;
    localStorage.removeItem("pc.pendingResetEmail");
  }
}

export const auth = new Auth();
