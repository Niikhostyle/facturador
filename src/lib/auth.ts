import crypto from "node:crypto";
import {
  findUserByEmail,
  findUserById,
  getPlatform,
  getTenantMeta,
  publicUser,
  type PlatformUser,
} from "./platform";
// getPlatform se usa al normalizar tokens legacy
import { verifyPassword } from "./password";

export { hashPassword, verifyPassword } from "./password";

/**
 * Auth multi-usuario.
 * - Usuarios en platform.users (scrypt).
 * - Bootstrap: ADMIN_EMAIL + ADMIN_PASSWORD_HASH migran al primer platform admin.
 * - AUTH_SECRET firma tokens HMAC.
 */

const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 horas

export type SessionPayload = {
  sub: number;
  email: string;
  tenantId: number | null;
  role: PlatformUser["role"];
  exp: number;
};

function secret(): Buffer {
  const s = process.env.AUTH_SECRET || "";
  if (s.length < 32) throw new Error("AUTH_SECRET no configurado");
  return Buffer.from(s);
}

/** @deprecated usar authenticateUser */
export function checkCredentials(email: string, password: string): boolean {
  return Boolean(authenticateUser(email, password));
}

export function authenticateUser(email: string, password: string): PlatformUser | null {
  const user = findUserByEmail(email);
  if (!user || !user.activo) {
    // Compat: si aún no hay usuarios, validar contra env (antes de migrate).
    const expected = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const stored = process.env.ADMIN_PASSWORD_HASH || "";
    if (!stored || !expected || email.trim().toLowerCase() !== expected) return null;
    if (!verifyPassword(password, stored)) return null;
    // Asegurar usuario platform en memoria
    const p = getPlatform();
    let u = findUserByEmail(expected);
    if (!u) {
      u = {
        id: p.nextUserId++,
        name: "Admin",
        email: expected,
        password_hash: stored,
        tenant_id: p.tenantsMeta[0]?.id ?? null,
        role: "platform",
        activo: true,
        created_at: new Date().toISOString(),
      };
      p.users.push(u);
    }
    return u;
  }
  if (!verifyPassword(password, user.password_hash)) return null;
  return user;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export function issueToken(emailOrUser: string | PlatformUser, tenantId?: number | null): string {
  const user = typeof emailOrUser === "string" ? findUserByEmail(emailOrUser) : emailOrUser;
  if (!user) {
    // Legacy: token solo por email (env admin)
    const payload = Buffer.from(
      JSON.stringify({
        sub: 0,
        email: String(emailOrUser).toLowerCase(),
        tenantId: tenantId ?? null,
        role: "platform",
        exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
      } satisfies SessionPayload),
    ).toString("base64url");
    return `${payload}.${sign(payload)}`;
  }
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      tenantId: tenantId === undefined ? user.tenant_id : tenantId,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    } satisfies SessionPayload),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseToken(header: string | null): SessionPayload | null {
  if (!header?.startsWith("Bearer ")) return null;
  const [payload, sig] = header.slice(7).split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
    if (typeof raw.exp !== "number" || raw.exp <= Date.now() / 1000) return null;

    // Tokens nuevos: { sub: userId, email, tenantId, role, exp }
    // Tokens legacy: { sub: emailString, exp }
    let email = typeof raw.email === "string" ? raw.email : "";
    let sub = typeof raw.sub === "number" ? raw.sub : 0;
    let tenantId = typeof raw.tenantId === "number" ? raw.tenantId : null;
    let role = (raw.role as SessionPayload["role"]) || "owner";

    if (typeof raw.sub === "string" && raw.sub.includes("@")) {
      email = raw.sub.toLowerCase();
      const u = findUserByEmail(email);
      if (u) {
        sub = u.id;
        tenantId = u.tenant_id;
        role = u.role;
      } else {
        // Admin env legacy sin usuario aún
        role = "platform";
        const p = getPlatform();
        tenantId = p.tenantsMeta[0]?.id ?? null;
      }
    } else if (!email && sub) {
      const u = findUserById(sub);
      if (u) email = u.email;
    }

    if (!email) {
      // Último recurso: no tumbar la API; sesión incompleta se rechaza abajo si hace falta.
      email = "";
    }

    return { sub, email, tenantId, role, exp: raw.exp };
  } catch {
    return null;
  }
}

export function verifyToken(header: string | null): boolean {
  return Boolean(parseToken(header));
}

export function requireSession(header: string | null): SessionPayload {
  const s = parseToken(header);
  if (!s) throw new Error("Sesión no válida o expirada.");
  return s;
}

export function sessionUser(session: SessionPayload): ReturnType<typeof publicUser> | null {
  if (session?.sub) {
    const u = findUserById(Number(session.sub));
    if (u) return publicUser(u);
  }
  if (session?.email) {
    const u = findUserByEmail(session.email);
    if (u) return publicUser(u);
  }
  return null;
}

/** Alias estable para la API. */
export function publicUserSafe(session: SessionPayload) {
  return sessionUser(session);
}

export function isPlatformAdmin(session: SessionPayload | null | undefined): boolean {
  if (!session) return false;
  if (session.role === "platform") return true;
  const u =
    (session.sub ? findUserById(Number(session.sub)) : undefined) ||
    (session.email ? findUserByEmail(session.email) : undefined);
  return u?.role === "platform";
}

export function resolveTenantId(session: SessionPayload, headerTenant?: string | null): number | null {
  if (headerTenant) {
    const id = Number(headerTenant);
    if (Number.isFinite(id) && getTenantMeta(id)) {
      // Platform puede apuntar a cualquier tenant; usuarios solo al suyo.
      if (session.role === "platform" || session.tenantId === id) return id;
    }
  }
  if (session.tenantId && getTenantMeta(session.tenantId)) return session.tenantId;
  // Legacy / platform: primera empresa
  if (session.role === "platform") return getPlatform().tenantsMeta[0]?.id ?? null;
  return session.tenantId;
}
