import { AsyncLocalStorage } from "node:async_hooks";
import { hashPassword } from "./password";
import { MODULOS, PLANES, TENANT, USER } from "./seed";
import { formatRutPuntos } from "./sii/rut";
import type { Db } from "./store";
import { defaultTenantDb, ensureCafAmbientes } from "./store";
import type { Tenant } from "./types";

export type PlanDef = {
  slug: string;
  nombre: string;
  precio: number;
  /** 0 = ilimitado */
  dte_mes: number;
  descripcion: string;
  features: string[];
};

export type ModuleDef = {
  key: string;
  nombre: string;
  descripcion: string;
  default_on: boolean;
};

export type PlatformUser = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  /** null = super-admin de plataforma */
  tenant_id: number | null;
  role: "platform" | "owner" | "admin" | "user";
  activo: boolean;
  created_at: string;
  /** Recuperar contraseña: sha256 del token enviado por correo, vencimiento y último envío (ISO). */
  reset_hash?: string;
  reset_exp?: string;
  reset_enviado?: string;
  /** Aceptación de términos, privacidad y encargo al registrarse. */
  consentimientos?: { version: string; at: string };
};

export type TenantRecord = Tenant & {
  estado: "activa" | "suspendida";
  created_at: string;
  email_contacto?: string;
  /** Override por módulo: true fuerza on, false fuerza off */
  feature_overrides?: Record<string, boolean>;
};

export type PlatformRoot = {
  version: 3;
  plans: PlanDef[];
  modules: ModuleDef[];
  users: PlatformUser[];
  tenantsMeta: TenantRecord[];
  tenantData: Record<string, Db>;
  nextUserId: number;
  nextTenantId: number;
};

const PLATFORM_KEY = "__gdtPlatform_v3";
const g = globalThis as typeof globalThis & { [PLATFORM_KEY]?: PlatformRoot };
const tenantAls = new AsyncLocalStorage<number>();

function clonePlans(): PlanDef[] {
  return PLANES.map((p) => ({
    slug: p.slug,
    nombre: p.nombre,
    precio: p.precio,
    dte_mes: p.dte_mes,
    descripcion: p.descripcion,
    features: [...(p.features || ["dte"])],
  }));
}

function cloneModules(): ModuleDef[] {
  return MODULOS.map((m) => ({
    key: m.key,
    nombre: m.nombre,
    descripcion: m.descripcion,
    default_on: Boolean(m.activo),
  }));
}

function bootstrapOwnerHash(): string {
  const envHash = process.env.ADMIN_PASSWORD_HASH || "";
  if (envHash.startsWith("scrypt:")) return envHash;
  // Fallback solo para entornos sin hash: password de desarrollo (se recomienda setear ADMIN_PASSWORD_HASH).
  return hashPassword(process.env.ADMIN_PASSWORD || "changeme");
}

export function createEmptyTenantDb(empresa: Tenant): Db {
  const db = defaultTenantDb();
  db.empresa = { ...empresa };
  return ensureCafAmbientes(db);
}

function defaultPlatform(): PlatformRoot {
  const now = new Date().toISOString();
  const plan = clonePlans().find((p) => p.slug === "empresa") || clonePlans()[0];
  const tenant: TenantRecord = {
    ...TENANT,
    plan: plan.slug,
    max_dte_mes: plan.dte_mes, // 0 = ilimitado
    features: [...plan.features],
    estado: "activa",
    created_at: now,
    email_contacto: TENANT.email,
  };
  const email = (process.env.ADMIN_EMAIL || USER.email).trim().toLowerCase();
  const owner: PlatformUser = {
    id: 1,
    name: USER.name,
    email,
    password_hash: bootstrapOwnerHash(),
    tenant_id: tenant.id,
    role: "owner",
    activo: true,
    created_at: now,
  };
  const platformAdmin: PlatformUser = {
    id: 2,
    name: USER.name,
    email,
    password_hash: owner.password_hash,
    tenant_id: null,
    role: "platform",
    activo: true,
    created_at: now,
  };
  // Un solo registro de usuario platform+owner con mismo email: preferimos un user con role platform
  // y tenant_id del tenant principal para poder operar ambas consolas.
  const unified: PlatformUser = {
    id: 1,
    name: USER.name,
    email,
    password_hash: bootstrapOwnerHash(),
    tenant_id: tenant.id,
    role: "platform",
    activo: true,
    created_at: now,
  };
  void owner;
  void platformAdmin;
  return {
    version: 3,
    plans: clonePlans(),
    modules: cloneModules(),
    users: [unified],
    tenantsMeta: [tenant],
    tenantData: { [String(tenant.id)]: createEmptyTenantDb(tenant) },
    nextUserId: 2,
    nextTenantId: tenant.id + 1,
  };
}

/** Migra Db v2 (single-tenant) o PlatformRoot v3. */
export function migrateToPlatform(raw: unknown): PlatformRoot {
  if (raw && typeof raw === "object" && (raw as PlatformRoot).version === 3 && (raw as PlatformRoot).tenantData) {
    const p = raw as PlatformRoot;
    p.plans = p.plans?.length ? p.plans : clonePlans();
    p.modules = p.modules?.length ? p.modules : cloneModules();
    p.users = p.users || [];
    p.tenantsMeta = p.tenantsMeta || [];
    p.tenantData = p.tenantData || {};
    for (const [k, db] of Object.entries(p.tenantData)) {
      p.tenantData[k] = ensureCafAmbientes({ ...defaultTenantDb(), ...db });
    }
    return p;
  }

  // Legacy single Db
  const legacy = raw as Db;
  const base = defaultPlatform();
  if (legacy && typeof legacy === "object" && "empresa" in legacy) {
    const tid = legacy.empresa?.id || TENANT.id;
    const planSlug = legacy.empresa?.plan || "empresa";
    const plan = base.plans.find((p) => p.slug === planSlug) || base.plans[0];
    const legacyFeats = legacy.empresa?.features?.length ? legacy.empresa.features : [...plan.features];
    const overrides: Record<string, boolean> = {};
    for (const f of legacyFeats) {
      if (!plan.features.includes(f)) overrides[f] = true;
    }
    const meta: TenantRecord = {
      ...TENANT,
      ...legacy.empresa,
      id: tid,
      plan: plan.slug,
      max_dte_mes: legacy.empresa?.max_dte_mes ?? plan.dte_mes,
      features: legacyFeats,
      feature_overrides: Object.keys(overrides).length ? overrides : undefined,
      estado: "activa",
      created_at: new Date().toISOString(),
      email_contacto: legacy.empresa?.email || TENANT.email,
    };
    base.tenantsMeta = [meta];
    base.tenantData = { [String(tid)]: ensureCafAmbientes({ ...defaultTenantDb(), ...legacy, empresa: meta }) };
    base.nextTenantId = tid + 1;
    if (base.users[0]) base.users[0].tenant_id = tid;
  }
  return base;
}

/** Sincroniza el super-admin desde ADMIN_EMAIL / ADMIN_PASSWORD_HASH. */
export function ensureAdminBootstrap(root?: PlatformRoot) {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const hash = process.env.ADMIN_PASSWORD_HASH || "";
  if (!email || !hash.startsWith("scrypt:")) return;
  const p = root || g[PLATFORM_KEY] || defaultPlatform();
  if (!g[PLATFORM_KEY]) g[PLATFORM_KEY] = p;
  const u = p.users.find((x) => x.email === email);
  if (!u) {
    p.users.push({
      id: p.nextUserId++,
      name: USER.name,
      email,
      password_hash: hash,
      tenant_id: p.tenantsMeta[0]?.id ?? null,
      role: "platform",
      activo: true,
      created_at: new Date().toISOString(),
    });
  } else {
    u.password_hash = hash;
    u.role = "platform";
    if (!u.tenant_id && p.tenantsMeta[0]) u.tenant_id = p.tenantsMeta[0].id;
  }
}

export function getPlatform(): PlatformRoot {
  if (!g[PLATFORM_KEY]) {
    g[PLATFORM_KEY] = defaultPlatform();
    ensureAdminBootstrap(g[PLATFORM_KEY]);
  }
  return g[PLATFORM_KEY]!;
}

export function replacePlatform(data: PlatformRoot | Db | unknown) {
  g[PLATFORM_KEY] = migrateToPlatform(data);
}

export function serializePlatform(): PlatformRoot {
  return getPlatform();
}

export function runWithTenant<T>(tenantId: number, fn: () => T): T {
  return tenantAls.run(tenantId, fn);
}

export function getActiveTenantId(): number {
  const fromAls = tenantAls.getStore();
  if (fromAls) return fromAls;
  const p = getPlatform();
  return p.tenantsMeta[0]?.id ?? TENANT.id;
}

export function getTenantDb(tenantId = getActiveTenantId()): Db {
  const p = getPlatform();
  const key = String(tenantId);
  if (!p.tenantData[key]) {
    const meta = p.tenantsMeta.find((t) => t.id === tenantId);
    p.tenantData[key] = createEmptyTenantDb(meta || { ...TENANT, id: tenantId });
  }
  return ensureCafAmbientes(p.tenantData[key]);
}

export function getTenantMeta(tenantId = getActiveTenantId()): TenantRecord | null {
  return getPlatform().tenantsMeta.find((t) => t.id === tenantId) || null;
}

export function planBySlug(slug: string): PlanDef {
  const p = getPlatform();
  return p.plans.find((x) => x.slug === slug) || p.plans[0];
}

export function effectiveFeatures(tenant: TenantRecord): string[] {
  const plan = planBySlug(tenant.plan);
  const set = new Set(plan.features);
  for (const [k, v] of Object.entries(tenant.feature_overrides || {})) {
    if (v) set.add(k);
    else set.delete(k);
  }
  // También respetar features explícitas del tenant si vienen de overrides sync
  return [...set];
}

export function tenantHasFeature(feature: string, tenantId = getActiveTenantId()): boolean {
  const meta = getTenantMeta(tenantId);
  if (!meta || meta.estado === "suspendida") return false;
  return effectiveFeatures(meta).includes(feature);
}

export function syncTenantEmpresaFromMeta(tenantId: number) {
  const meta = getTenantMeta(tenantId);
  const db = getTenantDb(tenantId);
  if (!meta) return;
  db.empresa = {
    ...db.empresa,
    ...meta,
    features: effectiveFeatures(meta),
    max_dte_mes: meta.max_dte_mes ?? planBySlug(meta.plan).dte_mes ?? 50,
  };
}

export function findUserByEmail(email: string | null | undefined): PlatformUser | undefined {
  if (!email || typeof email !== "string") return undefined;
  const e = email.trim().toLowerCase();
  if (!e) return undefined;
  return getPlatform().users.find((u) => u.email === e && u.activo);
}

export function findUserById(id: number): PlatformUser | undefined {
  return getPlatform().users.find((u) => u.id === id);
}

export function publicUser(u: PlatformUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role === "platform" ? "admin" : u.role,
    tenant_id: u.tenant_id ?? 0,
    organization_id: null as null,
    cartera_completa: false,
    is_platform: u.role === "platform",
  };
}

export function registerTenant(input: {
  rut: string;
  dv: string;
  razon_social: string;
  name: string;
  email: string;
  password: string;
  email_contacto?: string;
  plan?: string;
  version_legal?: string;
}): { tenant: TenantRecord; user: PlatformUser } {
  const p = getPlatform();
  const email = input.email.trim().toLowerCase();
  if (findUserByEmail(email)) throw new Error("Ya existe una cuenta con ese correo.");
  const plan = planBySlug(input.plan || "free");
  const tid = p.nextTenantId++;
  const uid = p.nextUserId++;
  const now = new Date().toISOString();
  const rutCuerpo = String(input.rut).replace(/\D/g, "");
  const dv = input.dv.toUpperCase();
  const tenant: TenantRecord = {
    id: tid,
    rut: rutCuerpo,
    dv,
    razon_social: input.razon_social.trim(),
    rut_formateado: formatRutPuntos(`${rutCuerpo}-${dv}`),
    ambiente: "certificacion",
    plan: plan.slug,
    max_dte_mes: plan.dte_mes, // 0 = ilimitado
    features: [...plan.features],
    email: input.email_contacto?.trim() || email,
    email_contacto: input.email_contacto?.trim() || email,
    estado: "activa",
    created_at: now,
    telefono: "",
    direccion: "",
    comuna: "",
    ciudad: "",
    giro: "",
    acteco: "",
    giros: [],
    documentos_emitir: [],
  };
  const user: PlatformUser = {
    id: uid,
    name: input.name.trim(),
    email,
    password_hash: hashPassword(input.password),
    tenant_id: tid,
    role: "owner",
    activo: true,
    created_at: now,
    ...(input.version_legal ? { consentimientos: { version: input.version_legal, at: now } } : {}),
  };
  p.tenantsMeta.push(tenant);
  p.tenantData[String(tid)] = createEmptyTenantDb(tenant);
  p.users.push(user);
  return { tenant, user };
}

export function updateTenantPlan(tenantId: number, planSlug: string) {
  const p = getPlatform();
  const meta = p.tenantsMeta.find((t) => t.id === tenantId);
  if (!meta) throw new Error("Empresa no encontrada");
  const plan = planBySlug(planSlug);
  meta.plan = plan.slug;
  meta.max_dte_mes = plan.dte_mes; // 0 = ilimitado
  meta.features = effectiveFeatures(meta);
  syncTenantEmpresaFromMeta(tenantId);
  return meta;
}

export function setTenantFeature(tenantId: number, feature: string, enabled: boolean) {
  const meta = getTenantMeta(tenantId);
  if (!meta) throw new Error("Empresa no encontrada");
  meta.feature_overrides = { ...(meta.feature_overrides || {}), [feature]: enabled };
  meta.features = effectiveFeatures(meta);
  syncTenantEmpresaFromMeta(tenantId);
  return meta;
}

export function setTenantEstado(tenantId: number, estado: "activa" | "suspendida") {
  const meta = getTenantMeta(tenantId);
  if (!meta) throw new Error("Empresa no encontrada");
  meta.estado = estado;
  return meta;
}

export function adminStats() {
  const p = getPlatform();
  const month = new Date().toISOString().slice(0, 7);
  let dtesMes = 0;
  for (const db of Object.values(p.tenantData)) {
    dtesMes += (db.dtes || []).filter((d) => d.fecha_emision.startsWith(month)).length;
  }
  const since = Date.now() - 30 * 86400_000;
  const nuevas = p.tenantsMeta.filter((t) => new Date(t.created_at).getTime() >= since).length;
  return {
    empresas: p.tenantsMeta.length,
    usuarios: p.users.filter((u) => u.role !== "platform" || u.tenant_id).length,
    dtes_mes: dtesMes,
    cuentas_nuevas_30d: nuevas,
    suspendidas: p.tenantsMeta.filter((t) => t.estado === "suspendida").length,
  };
}
