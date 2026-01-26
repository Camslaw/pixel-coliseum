const API = "http://localhost:2567";

export async function signup(email: string, password: string, displayName: string) {
  const r = await fetch(`${API}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, displayName }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "SIGNUP_FAILED");
  return data;
}

export async function login(email: string, password: string) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "LOGIN_FAILED");
  return data;
}

export async function me() {
  const r = await fetch(`${API}/auth/me`, { credentials: "include" });
  if (!r.ok) return null;
  const data = await r.json();
  return data.user; // <-- fix
}

export async function logout() {
  await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
}
