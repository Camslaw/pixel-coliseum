import * as api from "./api/auth";

export type User = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
};

class Auth {
  user: User | null = null;

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
      const { user } = await api.login(email, password);
      this.user = user;

      this.pendingVerifyEmail = null;
      localStorage.removeItem("pc.pendingEmail");
      return this.user;
    } catch (e: any) {
      if (String(e?.message) === "EMAIL_NOT_VERIFIED") {
        this.pendingVerifyEmail = email.trim().toLowerCase();
        localStorage.setItem("pc.pendingEmail", this.pendingVerifyEmail);
      }
      throw e;
    }
  }

  async signup(email: string, password: string, displayName: string) {
    const { user } = await api.signup(email, password, displayName);
    this.user = null;

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

  async logout() {
    await api.logout();
    this.user = null;
    this.pendingVerifyEmail = null;
    this.pendingResetEmail = null;
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

  async resendVerification() {
    if (!this.pendingVerifyEmail) throw new Error("MISSING_EMAIL");
    await api.resendVerification(this.pendingVerifyEmail);
  }
}

export const auth = new Auth();
