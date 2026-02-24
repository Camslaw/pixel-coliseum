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
  const r = await fetch(url("/auth/me"), {
    credentials: "include",
  });

  // 401 = not logged in (normal case)
  if (r.status === 401) {
    return null;
  }

  // Other errors should NOT silently pass
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error((data as any).error ?? "ME_FAILED");
  }

  const data = await r.json();
  return data.user;
}

export async function logout() {
  await fetch(url("/auth/logout"), { method: "POST", credentials: "include" });
}

export async function requestPasswordReset(email: string) {
  const r = await fetch(url("/auth/request-password-reset"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email }),
  });

  const data = await r.json().catch(() => ({}));

  // server should usually return { ok: true } even if email not found
  if (!r.ok) throw new Error((data as any).error ?? "RESET_REQUEST_FAILED");
  return data as { ok: true };
}

export async function resetPassword(email: string, code: string, newPassword: string) {
  const r = await fetch(url("/auth/reset-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, code, newPassword }),
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as any).error ?? "RESET_FAILED");
  return data as { ok: true };
}
