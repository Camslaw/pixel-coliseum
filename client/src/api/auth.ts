const API = import.meta.env.VITE_API_URL;

if (!API) {
  throw new Error("Missing VITE_API_URL. Set it in Netlify (Production) and rebuild.");
}

function url(path: string) {
  // prevents accidental double slashes
  return `${API.replace(/\/$/, "")}${path}`;
}

export async function signup(email: string, password: string, displayName: string) {
  const r = await fetch(url("/auth/signup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, displayName }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any).error ?? "SIGNUP_FAILED");
  return data;
}

export async function login(email: string, password: string) {
  const r = await fetch(url("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any).error ?? "LOGIN_FAILED");
  return data;
}

export async function verifyEmail(email: string, code: string) {
  const r = await fetch(url("/auth/verify-email"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, code }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any).error ?? "VERIFY_FAILED");
  return data;
}

export async function resendVerification(email: string) {
  const r = await fetch(url("/auth/resend-verification"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any).error ?? "RESEND_FAILED");
  return data;
}

export async function me() {
  const r = await fetch(url("/auth/me"), { credentials: "include" });
  if (!r.ok) return null;
  const data = await r.json();
  return data.user;
}

export async function logout() {
  await fetch(url("/auth/logout"), { method: "POST", credentials: "include" });
}
