"use client";

import type { AuthState } from "./types";

const AUTH_KEY = "facturador_gdt_auth";

export function getAuth(): AuthState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

export function setAuth(auth: AuthState) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const auth = getAuth();
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (auth?.token) headers.set("Authorization", `Bearer ${auth.token}`);
  if (auth?.tenantId) headers.set("X-Tenant-Id", String(auth.tenantId));

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { ...init, headers });
  } catch {
    throw new Error(
      "No se pudo conectar con el servidor (fetch failed). Revisa tu conexión o recarga e intenta de nuevo.",
    );
  }
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (res.status === 401) {
    clearAuth();
    window.location.replace("/login");
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "message" in body
        ? String((body as { message: string }).message)
        : `Error ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}
