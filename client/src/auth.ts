import * as api from "./api/auth";

export type User = {
  id: string;
  email: string;
  displayName: string;
};

class Auth {
  user: User | null = null;
  token: string | null = localStorage.getItem("pc.token");

  async restore() {
    this.user = await api.me();
    return this.user;
  }

  async login(email: string, password: string) {
    const { user, token } = await api.login(email, password);
    this.user = user;
    this.token = token;
    localStorage.setItem("pc.token", token);
    return this.user;
  }

  async signup(email: string, password: string, displayName: string) {
    const { user, token } = await api.signup(email, password, displayName);
    this.user = user;
    this.token = token;
    localStorage.setItem("pc.token", token);
    return this.user;
  }

  async logout() {
    await api.logout();
    this.user = null;
    this.token = null;
    localStorage.removeItem("pc.token");
  }
}

export const auth = new Auth();
