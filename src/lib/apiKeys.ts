import crypto from "crypto";
import type { ApiKey } from "./types";

export const MAX_CLAVES_ACTIVAS = 10;
export const PERMISOS = ["dte:create", "dte:read"] as const;
export type Permiso = (typeof PERMISOS)[number];

export const hashClave = (plain: string) => crypto.createHash("sha256").update(plain).digest("hex");

/** Genera la clave en claro (solo se muestra una vez) y lo que se guarda. */
export function generarClave(ambiente: "certificacion" | "produccion") {
  const plain = `sk_${ambiente === "produccion" ? "live" : "test"}_${crypto.randomBytes(24).toString("base64url")}`;
  return { plain, key_hash: hashClave(plain), key_hint: `${plain.slice(0, 12)}…${plain.slice(-4)}` };
}

/** Rutas que una clave API puede usar: solo emitir y consultar DTE. */
export function permisoRequerido(path: string, method: string): Permiso | null {
  if (method === "POST" && path === "dte") return "dte:create";
  if (method === "GET" && (path === "dte" || /^dte\/\d+(\/documento)?$/.test(path))) return "dte:read";
  return null;
}

export function claveUsable(k: ApiKey, now = Date.now()) {
  return Boolean(k.key_hash) && k.activo && (!k.expires_at || Date.parse(k.expires_at) > now);
}

/** Lo que el listado puede mostrar: nunca el hash ni la clave antigua en claro. */
export function claveSegura(k: ApiKey) {
  const rest: Partial<ApiKey> = { ...k };
  delete rest.key_hash;
  delete rest.key;
  return { ...rest, key_hint: k.key_hint ?? "Clave antigua (inválida)", activo: claveUsable(k) };
}

/** Busca por hash en todas las empresas; la empresa sale de la clave, no de un header. */
export function buscarClave(plain: string, tenants: Record<string, { apiKeys?: ApiKey[] }>) {
  const h = hashClave(plain);
  for (const [tid, db] of Object.entries(tenants)) {
    const k = db.apiKeys?.find((x) => x.key_hash && crypto.timingSafeEqual(Buffer.from(x.key_hash), Buffer.from(h)));
    if (k) return { tenantId: Number(tid), key: k };
  }
  return null;
}
