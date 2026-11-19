import fs from "fs";
import { buscarNomina } from "@/lib/sii/nomina";
import nodePath from "path";
import { NextRequest, NextResponse } from "next/server";
import { parseCaf } from "@/lib/sii/caf";
import { loadP12 } from "@/lib/sii/cert";
import { calcularDv, formatRutPuntos, partesRut, rutLimpio, rutSii, rutValido } from "@/lib/sii/rut";
import {
  authPayload,
  cafEstado,
  certificadoEstado,
  guardarCertificado,
  eliminarCertificado,
  actualizarSiiConfig,
  getSiiSettings,
  actualizarCotizacion,
  crearCotizacion,
  CICLO,
  empresaPayload,
  getCotizacion,
  getDb,
  getDte,
  listCotizaciones,
  listDtes,
  listRecibidos,
  mePayload,
  onboardingEstado,
  reclamarRecibido,
  registrarCaf,
  setProgressFlag,
  statsPayload,
  syncRecibidos,
  SUSCRIPCION,
  updateEmpresa,
  crearCarga,
  getCarga,
  huellasEmitidas,
  listCargas,
  registrarResultadoCarga,
  actualizarProgramada,
  crearProgramada,
  eliminarProgramada,
  listProgramadas,
  omitirTurno,
  registrarTurno,
  turnoEmitido,
} from "@/lib/store";
import { guardarDocumentoCotizacion, pdfCotizacion } from "@/lib/cotizacionDoc";
import { cargarDteDoc, htmlDte, pdfDte, rutaXmlDte } from "@/lib/dteDoc";
import { libroVentas, periodoActualCl, resumenCompras } from "@/lib/contable";
import { buscarClave, claveSegura, claveUsable, generarClave, MAX_CLAVES_ACTIVAS, PERMISOS, permisoRequerido } from "@/lib/apiKeys";
import { cafDirAmbiente, ensureCafDirs, getSiiConfig, siiReadiness, type SiiAmbiente } from "@/lib/sii/config";
import { emitirDteConSii } from "@/lib/sii/emitirStore";
import { cifrarClave } from "@/lib/sii/certSecret";
import {
  authenticateUser,
  isPlatformAdmin,
  issueToken,
  parseToken,
  publicUserSafe,
  resolveTenantId,
  sessionUser,
  verifyToken,
} from "@/lib/auth";
import { ensureLoaded, save } from "@/lib/persist";
import { listPendingFromUser, probeSii } from "@/lib/sii/client";
import { consultarStc } from "@/lib/sii/stc";
import type { GiroCliente } from "@/lib/types";
import {
  eliminarLogo,
  findLogoPath,
  guardarLogoBase64,
  mimeDeLogo,
  logoExiste,
} from "@/lib/logo";
import {
  adminStats,
  effectiveFeatures,
  getPlatform,
  getTenantMeta,
  registerTenant,
  runWithTenant,
  setTenantEstado,
  setTenantFeature,
  syncTenantEmpresaFromMeta,
  tenantHasFeature,
  updateTenantPlan,
} from "@/lib/platform";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function notFound() {
  return json(
    {
      codigo: "no_encontrado",
      message: "No se encontró el recurso solicitado. Revise la URL y el identificador.",
    },
    404,
  );
}

function paginate<T>(rows: T[], page = 1, perPage = 50) {
  const total = rows.length;
  const start = (page - 1) * perPage;
  return {
    current_page: page,
    data: rows.slice(start, start + perPage),
    first_page_url: null,
    from: total ? start + 1 : null,
    last_page: Math.max(1, Math.ceil(total / perPage)),
    last_page_url: null,
    links: [],
    next_page_url: null,
    path: "",
    per_page: perPage,
    prev_page_url: null,
    to: total ? Math.min(start + perPage, total) : null,
    total,
  };
}

async function handle(req: NextRequest, segments: string[]) {
  const path = segments.join("/");
  const { searchParams } = req.nextUrl;
  const method = req.method;

  if (path === "auth/register" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const rut = String(body.rut || "").replace(/\D/g, "");
      const dv = String(body.dv || "").toUpperCase();
      const razon = String(body.razon_social || "").trim();
      const name = String(body.name || body.nombre || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const plan = String(body.plan || "free");
      if (!rut || !dv || !razon || !name || !email || password.length < 8) {
        return json(
          { message: "Completa empresa, nombre, correo y una contraseña de al menos 8 caracteres.", codigo: "validacion" },
          422,
        );
      }
      const rutFmt = rutSii(`${rut}-${dv}`);
      if (!rutValido(rutFmt)) {
        return json({ message: `RUT inválido: ${formatRutPuntos(rutFmt)}.`, codigo: "rut" }, 422);
      }
      const { tenant, user } = registerTenant({
        rut,
        dv,
        razon_social: razon,
        name,
        email,
        password,
        email_contacto: String(body.email_contacto || ""),
        plan,
      });
      const token = issueToken(user, tenant.id);
      const feats = effectiveFeatures(tenant);
      return runWithTenant(tenant.id, () =>
        json(
          {
            ...authPayload(
              {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                tenant_id: tenant.id,
                organization_id: null,
                cartera_completa: false,
              },
              tenant.id,
            ),
            token,
            features: feats,
          },
          201,
        ),
      );
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : "No se pudo registrar", codigo: "registro" }, 422);
    }
  }

  if (path === "auth/login" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) {
      return json({ message: "Correo y contraseña requeridos.", codigo: "validacion" }, 422);
    }
    const user = authenticateUser(email, password);
    if (!user) {
      await new Promise((r) => setTimeout(r, 800));
      return json({ message: "Credenciales inválidas.", codigo: "auth" }, 401);
    }
    const tenantId = user.tenant_id;
    if (tenantId) {
      const meta = getTenantMeta(tenantId);
      if (meta?.estado === "suspendida") {
        return json({ message: "Esta cuenta está suspendida. Contacta a soporte.", codigo: "suspendida" }, 403);
      }
      syncTenantEmpresaFromMeta(tenantId);
      const token = issueToken(user, tenantId);
      const feats = effectiveFeatures(getTenantMeta(tenantId)!);
      return runWithTenant(tenantId, () =>
        json({
          ...authPayload(
            {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role === "platform" ? "admin" : user.role,
              tenant_id: tenantId,
              organization_id: null,
              cartera_completa: false,
            },
            tenantId,
          ),
          token,
          is_platform: user.role === "platform",
          features: feats,
        }),
      );
    }
    // Platform admin sin tenant: token platform, entra al panel admin
    const token = issueToken(user, null);
    return json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: "admin",
        tenant_id: 0,
        organization_id: null,
        cartera_completa: false,
      },
      token,
      tenantId: null,
      tenant: null,
      scope: "platform",
      organizacion: null,
      empresas: getPlatform().tenantsMeta,
      is_platform: true,
    });
  }

  if (path === "planes" && method === "GET") {
    return json({ data: getPlatform().plans });
  }

  const authz = req.headers.get("authorization") || "";
  if (authz.startsWith("Bearer sk_")) return handleClaveApi(req, path, method, searchParams, authz.slice(7));

  const session = parseToken(req.headers.get("authorization"));
  if (!session || !verifyToken(req.headers.get("authorization"))) {
    return json({ message: "Sesión no válida o expirada.", codigo: "no_autenticado" }, 401);
  }

  // —— Panel plataforma ——
  if (path.startsWith("admin/") || path === "admin") {
    if (!isPlatformAdmin(session)) {
      return json({ message: "Solo administradores de plataforma.", codigo: "forbidden" }, 403);
    }
    const p = getPlatform();
    if ((path === "admin" || path === "admin/stats") && method === "GET") {
      return json({ data: adminStats() });
    }
    if (path === "admin/empresas" && method === "GET") {
      const q = (searchParams.get("q") || "").toLowerCase();
      let rows = p.tenantsMeta.map((t) => ({
        ...t,
        features: effectiveFeatures(t),
        usuarios: p.users.filter((u) => u.tenant_id === t.id).length,
      }));
      if (q) {
        rows = rows.filter(
          (t) =>
            t.razon_social.toLowerCase().includes(q) ||
            t.rut.includes(q) ||
            t.rut_formateado.includes(q),
        );
      }
      return json({ data: rows });
    }
    const empMatch = path.match(/^admin\/empresas\/(\d+)$/);
    if (empMatch && method === "GET") {
      const id = Number(empMatch[1]);
      const t = getTenantMeta(id);
      if (!t) return notFound();
      return json({
        data: {
          ...t,
          features: effectiveFeatures(t),
          users: p.users
            .filter((u) => u.tenant_id === id)
            .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, activo: u.activo })),
        },
      });
    }
    if (empMatch && (method === "PUT" || method === "PATCH")) {
      const id = Number(empMatch[1]);
      const body = await req.json().catch(() => ({}));
      if (typeof body.plan === "string") updateTenantPlan(id, body.plan);
      if (body.estado === "activa" || body.estado === "suspendida") setTenantEstado(id, body.estado);
      if (body.features && typeof body.features === "object") {
        for (const [k, v] of Object.entries(body.features as Record<string, boolean>)) {
          setTenantFeature(id, k, Boolean(v));
        }
      }
      if (typeof body.max_dte_mes === "number") {
        const meta = getTenantMeta(id);
        if (meta) {
          meta.max_dte_mes = body.max_dte_mes;
          syncTenantEmpresaFromMeta(id);
        }
      }
      const t = getTenantMeta(id);
      if (!t) return notFound();
      return json({ data: { ...t, features: effectiveFeatures(t) } });
    }
    if (path === "admin/planes" && method === "GET") return json({ data: p.plans });
    if (path === "admin/planes" && (method === "PUT" || method === "PATCH")) {
      const body = await req.json().catch(() => ({}));
      const slug = String(body.slug || "");
      const plan = p.plans.find((x) => x.slug === slug);
      if (!plan) return json({ message: "Plan no encontrado", codigo: "plan" }, 404);
      if (typeof body.nombre === "string") plan.nombre = body.nombre;
      if (typeof body.precio === "number") plan.precio = body.precio;
      if (typeof body.dte_mes === "number") plan.dte_mes = body.dte_mes;
      if (typeof body.descripcion === "string") plan.descripcion = body.descripcion;
      if (Array.isArray(body.features)) plan.features = body.features.map(String);
      return json({ data: plan });
    }
    if (path === "admin/modulos" && method === "GET") return json({ data: p.modules });
    if (path === "admin/modulos" && (method === "PUT" || method === "PATCH")) {
      const body = await req.json().catch(() => ({}));
      const key = String(body.key || "");
      const mod = p.modules.find((m) => m.key === key);
      if (!mod) return json({ message: "Módulo no encontrado", codigo: "modulo" }, 404);
      if (typeof body.default_on === "boolean") mod.default_on = body.default_on;
      if (typeof body.nombre === "string") mod.nombre = body.nombre;
      if (typeof body.descripcion === "string") mod.descripcion = body.descripcion;
      return json({ data: mod });
    }
    return notFound();
  }

  const tenantId = resolveTenantId(session, req.headers.get("x-tenant-id") || req.headers.get("X-Tenant-Id"));
  if (!tenantId) {
    return json(
      { message: "Selecciona una empresa o entra al panel admin.", codigo: "sin_tenant", is_platform: isPlatformAdmin(session) },
      403,
    );
  }
  const meta = getTenantMeta(tenantId);
  if (!meta) return json({ message: "Empresa no encontrada.", codigo: "tenant" }, 404);
  if (meta.estado === "suspendida" && !isPlatformAdmin(session)) {
    return json({ message: "Cuenta suspendida.", codigo: "suspendida" }, 403);
  }

  return runWithTenant(tenantId, () => handleTenant(req, path, method, searchParams, session, tenantId));
}

/** Integraciones (ERP) con clave API: solo emitir y consultar DTE, en la empresa dueña de la clave. */
async function handleClaveApi(req: NextRequest, path: string, method: string, searchParams: URLSearchParams, plain: string) {
  const found = buscarClave(plain, getPlatform().tenantData);
  if (!found || !claveUsable(found.key)) {
    return json({ message: "Clave API no válida, revocada o vencida.", codigo: "no_autenticado" }, 401);
  }
  const permiso = permisoRequerido(path, method);
  if (!permiso) return json({ message: "Las claves API solo pueden emitir (POST /dte) y consultar DTE (GET /dte).", codigo: "forbidden" }, 403);
  if (!found.key.permissions.includes(permiso)) {
    return json({ message: `Esta clave no tiene el permiso ${permiso}.`, codigo: "forbidden" }, 403);
  }
  const { tenantId, key } = found;
  const meta = getTenantMeta(tenantId);
  if (!meta || meta.estado === "suspendida") return json({ message: "Cuenta suspendida o inexistente.", codigo: "suspendida" }, 403);
  if (!tenantHasFeature("api", tenantId)) return json({ message: "El módulo API no está incluido en el plan de esta empresa.", codigo: "modulo" }, 403);

  return runWithTenant(tenantId, () => {
    const amb = getSiiConfig().ambiente;
    if (permiso === "dte:create" && key.ambiente !== amb) {
      return json({ message: `Esta clave es de ${key.ambiente === "produccion" ? "producción" : "certificación"} y la empresa está emitiendo en ${amb === "produccion" ? "producción" : "certificación"}.`, codigo: "ambiente" }, 409);
    }
    key.last_used_at = new Date().toISOString();
    // Sesión mínima sin usuario: handleTenant solo la usa para rutas de perfil, que la clave no alcanza.
    const session = { sub: 0, email: "", tenantId, role: "user" as const, exp: Math.floor(Date.now() / 1000) + 60 };
    return handleTenant(req, path, method, searchParams, session, tenantId);
  });
}

// handleTenant continúa abajo con las rutas del tenant activo.

async function handleTenant(
  req: NextRequest,
  path: string,
  method: string,
  searchParams: URLSearchParams,
  session: NonNullable<ReturnType<typeof parseToken>>,
  tenantId: number,
) {
  const db = getDb();
  const user = sessionUser(session) || publicUserSafe(session);

  if (path === "auth/me" && method === "GET") {
    return json(mePayload(user || undefined));
  }
  if (path === "perfil" && method === "GET") {
    return json({
      id: user?.id,
      name: user?.name,
      email: user?.email,
      role: user?.role,
    });
  }
  if (path === "features" && method === "GET") {
    const m = getTenantMeta(tenantId)!;
    return json({ data: effectiveFeatures(m), plan: m.plan });
  }

  if (path === "certificado/estado" && method === "GET") return json(certificadoEstado());
  // Subida REAL del certificado .p12: valida con la clave, lo guarda en SII_CERT_PATH
  // y registra titular/emisor/vencimiento reales.
  if (path === "certificado/upload" && method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      const b64 = String(body.p12_base64 || "").replace(/^data:[^,]*,/, "");
      if (!b64) return json({ message: "Envía el archivo .p12 (base64).", codigo: "cert" }, 422);

      const password = String(body.password || "");
      if (!password) return json({ message: "Escribe la clave del certificado.", codigo: "cert" }, 422);

      const buf = Buffer.from(b64, "base64");
      if (buf.length > 1_000_000) return json({ message: "El archivo pesa más de 1 MB; un .p12/.pfx suele pesar menos de 20 KB.", codigo: "cert" }, 422);
      let mat: ReturnType<typeof loadP12>;
      try {
        mat = loadP12(buf, password);
      } catch (e) {
        const m = e instanceof Error ? e.message : "";
        return json(
          { message: /contraseña|password|mac|integrity/i.test(m) ? "La clave no abre este certificado. Revísala e intenta de nuevo." : "El archivo no es un certificado .p12/.pfx válido.", codigo: "cert" },
          422,
        );
      }
      // El RUT del firmante se compara con el configurado por esta empresa, no con el del entorno (sería el de otra empresa).
      const rutPropio = getSiiSettings().rutCertificado;
      if (rutPropio && mat.rutTitular && rutSii(mat.rutTitular) !== rutSii(rutPropio)) {
        return json(
          { message: `El certificado es del RUT ${mat.rutTitular}, pero en Conexión SII el RUT del firmante es ${rutPropio}. Corrige uno de los dos.`, codigo: "cert" },
          422,
        );
      }

      const notAfter = mat.cert.validity.notAfter;
      const dias = Math.ceil((notAfter.getTime() - Date.now()) / 86_400_000);
      if (dias <= 0) {
        return json({ message: `Este certificado venció el ${notAfter.toISOString().slice(0, 10).split("-").reverse().join("-")}. Pide uno nuevo a tu entidad certificadora.`, codigo: "cert" }, 422);
      }

      // Un archivo y una clave por empresa: la emisión, la semilla y el RCV los leen vía getSiiConfig.
      const certFile = `./data/certs/tenant-${tenantId}.p12`;
      const destino = nodePath.join(process.cwd(), certFile);
      fs.mkdirSync(nodePath.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, buf, { mode: 0o600 });
      actualizarSiiConfig({
        certFile,
        certPasswordEnc: cifrarClave(password),
        ...(!rutPropio && mat.rutTitular ? { rutCertificado: mat.rutTitular } : {}),
      });
      const sujeto = String(mat.cert.subject.getField("CN")?.value || mat.rutTitular || "—");
      const emisor = String(mat.cert.issuer.getField("CN")?.value || "—");

      return json(
        guardarCertificado({
          vigente: dias > 0,
          sujeto,
          emisor,
          vence_el: notAfter.toISOString().slice(0, 10),
          dias_restantes: dias,
          rut_titular: mat.rutTitular || rutPropio || "",
        }),
        201,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Certificado inválido";
      return json({ message: /clave|password|mac|integrity/i.test(msg) ? "Clave incorrecta o .p12 inválido." : msg, codigo: "cert" }, 422);
    }
  }
  // Eliminar el certificado (borra el archivo y limpia el estado para resubir).
  if (path === "certificado/eliminar" && method === "POST") {
    const propio = getSiiSettings().certFile;
    // Solo se borra el archivo propio de la empresa; el del entorno puede ser compartido.
    if (propio) {
      try {
        const f = nodePath.join(process.cwd(), propio);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* si no se puede borrar el archivo, igual limpiamos el estado */
      }
      actualizarSiiConfig({ certFile: undefined, certPasswordEnc: undefined });
    }
    return json(eliminarCertificado());
  }
  // El alta simulada queda bloqueada.
  if (path === "certificado" && method === "POST") {
    return json({ message: "Sube el certificado real en /certificado/upload.", codigo: "cert" }, 410);
  }
  if (path === "onboarding/estado" && method === "GET") return json(onboardingEstado());
  if (path === "onboarding/paso" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const key = body.key as "renuncia_portal_gratuito" | "inscripcion_sii" | "produccion_habilitada" | "folios_palena";
    const allowed = ["renuncia_portal_gratuito", "inscripcion_sii", "produccion_habilitada", "folios_palena"] as const;
    if (!allowed.includes(key)) {
      return json({ message: "Paso no válido.", codigo: "validacion" }, 422);
    }
    return json(setProgressFlag(key, true));
  }
  if (path === "sii/estado" && method === "GET") return json(siiReadiness());
  // Config SII editable: valores efectivos (BD sobre entorno).
  if (path === "sii/config" && method === "GET") {
    const c = getSiiConfig();
    return json({
      data: {
        ambiente: c.ambiente,
        rut_empresa: c.rutEmpresa,
        rut_certificado: c.rutCertificado,
        nro_resolucion: c.nroResolucion,
        fecha_resolucion: c.fechaResolucion,
        enabled: c.enabled,
      },
    });
  }
  if (path === "sii/config" && (method === "PUT" || method === "POST" || method === "PATCH")) {
    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if (body.ambiente === "certificacion" || body.ambiente === "produccion") patch.ambiente = body.ambiente;
    if (typeof body.rut_empresa === "string") patch.rutEmpresa = body.rut_empresa.trim();
    if (typeof body.rut_certificado === "string") patch.rutCertificado = body.rut_certificado.trim();
    if (typeof body.nro_resolucion === "string" || typeof body.nro_resolucion === "number")
      patch.nroResolucion = String(body.nro_resolucion).trim();
    if (typeof body.fecha_resolucion === "string") patch.fechaResolucion = body.fecha_resolucion.trim();
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    actualizarSiiConfig(patch);
    const c = getSiiConfig();
    return json({
      data: {
        ambiente: c.ambiente,
        rut_empresa: c.rutEmpresa,
        rut_certificado: c.rutCertificado,
        nro_resolucion: c.nroResolucion,
        fecha_resolucion: c.fechaResolucion,
        enabled: c.enabled,
      },
    });
  }
  if (path === "sii/pendiente" && method === "GET") return json({ data: listPendingFromUser() });
  if (path === "sii/consulta-stc" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const rut = String((body as { rut?: string }).rut || "");
    // Siempre 200 con { ok } para que el front lea url_sii / mensaje sin tirar excepción.
    return json(await consultarStc(rut));
  }

  if (path === "sii/probe" && method === "POST") {
    try {
      return json(await probeSii());
    } catch (e) {
      return json(
        { message: e instanceof Error ? e.message : "Error SII", codigo: "sii" },
        502,
      );
    }
  }

  if (path === "ciclo/decision" && method === "GET") return json(CICLO);
  if (path === "suscripcion" && method === "GET") {
    const m = getTenantMeta(tenantId)!;
    const plan = getPlatform().plans.find((p) => p.slug === m.plan) || getPlatform().plans[0];
    return json({
      ...SUSCRIPCION,
      plan_actual: {
        id: 6,
        nombre: plan.nombre,
        precio: plan.precio,
        slug: plan.slug,
        dte_mes: plan.dte_mes,
        features: effectiveFeatures(m),
      },
      planes: getPlatform().plans,
    });
  }
  if (path === "suscripcion" && (method === "POST" || method === "PUT" || method === "PATCH")) {
    const body = await req.json().catch(() => ({}));
    const slug = String(body.plan || body.slug || "");
    if (!slug) return json({ message: "Indica el plan.", codigo: "plan" }, 422);
    const updated = updateTenantPlan(tenantId, slug);
    const plan = getPlatform().plans.find((p) => p.slug === updated.plan)!;
    return json({
      ...SUSCRIPCION,
      plan_actual: {
        nombre: plan.nombre,
        precio: plan.precio,
        slug: plan.slug,
        dte_mes: plan.dte_mes,
        features: effectiveFeatures(updated),
      },
      message: "Plan actualizado. El cobro con Webpay se habilitará después.",
    });
  }
  if (path === "empresa" && method === "GET") return json(empresaPayload());
  // Nómina pública del SII (personas jurídicas): razón social y actividades por RUT.
  if (path === "sii/nomina" && method === "GET") {
    const rut = (searchParams.get("rut") || "").replace(/\D/g, "");
    if (!/^\d{6,8}$/.test(rut)) return json({ message: "RUT inválido.", codigo: "validacion" }, 422);
    const data = await buscarNomina(Number(rut));
    if (!data) return json({ message: "RUT no encontrado en la nómina del SII.", codigo: "no_encontrado" }, 404);
    return json(data);
  }
  if (path === "empresa" && (method === "PUT" || method === "PATCH" || method === "POST")) {
    const body = await req.json().catch(() => ({}));
    return json(
      updateEmpresa({
        giro: body.giro,
        acteco: body.acteco,
        direccion: body.direccion,
        comuna: body.comuna,
        ciudad: body.ciudad,
        email: body.email,
        telefono: body.telefono,
        razon_social: body.razon_social,
        nombre_fantasia: body.nombre_fantasia,
        unidad_sii: body.unidad_sii,
        usar_logo: body.usar_logo,
        formato_impresion: body.formato_impresion,
        volumen_estimado: body.volumen_estimado,
        giros: body.giros,
        documentos_emitir: body.documentos_emitir,
      }),
    );
  }
  if (path === "empresa/logo" && method === "GET") {
    const logoPath = findLogoPath();
    if (!logoPath) return json({ message: "Sin logo", codigo: "sin_logo" }, 404);
    const buf = fs.readFileSync(logoPath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": mimeDeLogo(logoPath),
        "Cache-Control": "no-store",
      },
    });
  }
  if (path === "empresa/logo" && method === "POST") {
    try {
      const body = await req.json();
      const raw = String(body.image_base64 || body.logo_base64 || "");
      if (!raw) return json({ message: "Falta image_base64", codigo: "logo" }, 422);
      const saved = guardarLogoBase64(raw, body.mime ? String(body.mime) : undefined);
      // Al subir, activamos usar_logo para que aparezca en documentos.
      updateEmpresa({ usar_logo: true });
      return json({
        ok: true,
        has_logo: true,
        mime: saved.mime,
        usar_logo: true,
        message: "Logo guardado. Aparecerá en facturas y cotizaciones.",
      });
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : "No se pudo guardar el logo", codigo: "logo" }, 422);
    }
  }
  if (path === "empresa/logo" && method === "DELETE") {
    eliminarLogo();
    updateEmpresa({ usar_logo: false });
    return json({ ok: true, has_logo: logoExiste(), usar_logo: false });
  }

  if (path === "caf/estado" || path === "caf/status") {
    ensureCafDirs();
    const ambParam = (searchParams.get("ambiente") || getSiiConfig().ambiente) as SiiAmbiente;
    const ambiente: SiiAmbiente = ambParam === "produccion" ? "produccion" : "certificacion";
    return json({ ...cafEstado(ambiente), ambiente_emision: getSiiConfig().ambiente });
  }
  if (path === "caf/actividad") return json({ data: [] });
  // Subida REAL de un CAF: parsea el XML del SII, valida el RUT, guarda el archivo
  // y registra el rango de folios autorizado (por ambiente maullin/palena).
  if (path === "caf/upload" && method === "POST") {
    try {
      ensureCafDirs();
      const body = await req.json().catch(() => ({}));
      const xml = String(body.xml || "");
      if (!xml.trim()) {
        return json({ message: "Envía el contenido XML del CAF.", codigo: "caf" }, 422);
      }
      const caf = parseCaf(xml);

      const rutEmpresa = rutSii(`${db.empresa.rut}-${db.empresa.dv}`);
      if (caf.rutEmisor !== rutEmpresa) {
        return json(
          { message: `Este CAF es del RUT ${caf.rutEmisor}, pero tu empresa es ${rutEmpresa}. Sube el CAF correcto.`, codigo: "caf" },
          422,
        );
      }

      const ambBody = String(body.ambiente || getSiiConfig().ambiente);
      const ambiente: SiiAmbiente = ambBody === "produccion" ? "produccion" : "certificacion";
      // IDK 100 = certificación (maullin), 300 = producción (palena).
      const idkEsperado = ambiente === "produccion" ? "300" : "100";
      if (caf.idk && caf.idk !== idkEsperado) {
        return json(
          {
            message:
              `Este CAF es de ${caf.idk === "300" ? "producción (palena)" : "certificación (maullin)"} ` +
              `(IDK=${caf.idk}), pero lo estás subiendo a ${ambiente === "produccion" ? "producción" : "certificación"}. ` +
              `Cambia de pestaña o sube el CAF del ambiente correcto.`,
            codigo: "caf_ambiente",
          },
          422,
        );
      }

      const dir = cafDirAmbiente(ambiente);
      fs.mkdirSync(dir, { recursive: true });
      const file = nodePath.join(dir, `CAF_T${caf.tipoDte}_${caf.folioDesde}-${caf.folioHasta}.xml`);
      fs.writeFileSync(file, xml, "latin1");

      const vence = new Date(caf.fechaAutorizacion || Date.now());
      vence.setMonth(vence.getMonth() + 6);

      const estado = registrarCaf({
        tipo_dte: caf.tipoDte,
        desde: caf.folioDesde,
        hasta: caf.folioHasta,
        vence_el: vence.toISOString().slice(0, 10),
        ambiente,
      });
      return json(
        {
          ...estado,
          cargado: {
            tipo_dte: caf.tipoDte,
            desde: caf.folioDesde,
            hasta: caf.folioHasta,
            total: caf.folioHasta - caf.folioDesde + 1,
            ambiente,
          },
        },
        201,
      );
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : "CAF inválido o ilegible.", codigo: "caf" }, 422);
    }
  }
  // El alta simulada queda bloqueada: los folios deben venir de un CAF real.
  if (path === "caf/cargar" && method === "POST") {
    return json({ message: "Los folios se cargan subiendo el XML del CAF en /caf/upload.", codigo: "caf" }, 410);
  }
  if (path === "caf/proyeccion") {
    return json({
      data: {
        ambiente: getSiiConfig().ambiente,
        tipos: cafEstado(getSiiConfig().ambiente).data.tipos.map((t) => ({
          tipo_dte: t.tipo_dte,
          cobertura_dias: t.disponibles > 0 ? 178 : 0,
          disponibles: t.disponibles,
        })),
      },
    });
  }

  if (path === "dte" && method === "GET") return json(listDtes(searchParams));
  const dteMatch = path.match(/^dte\/(\d+)$/);
  if (dteMatch && method === "GET") {
    try {
      const { data } = getDte(Number(dteMatch[1]));
      return json({
        data,
        xml_path: rutaXmlDte(data.tipo_dte, data.folio),
      });
    } catch {
      return notFound();
    }
  }
  const dteDocMatch = path.match(/^dte\/(\d+)\/documento$/);
  if (dteDocMatch && method === "GET") {
    try {
      const { data } = getDte(Number(dteDocMatch[1]));
      const parsed = cargarDteDoc(data);
      const format = (searchParams.get("format") || "html").toLowerCase();
      if (format === "pdf") {
        const buf = await pdfDte(parsed, {
          tipoNombre: data.tipo_nombre,
          estado: data.estado,
          ambiente: data.ambiente,
          trackId: (data as { track_id?: string | null }).track_id ?? null,
        });
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="DTE_T${data.tipo_dte}_F${data.folio}.pdf"`,
          },
        });
      }
      const html = htmlDte(parsed, {
        tipoNombre: data.tipo_nombre,
        estado: data.estado,
        ambiente: data.ambiente,
      });
      return new NextResponse(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : "No se pudo generar", codigo: "dte" }, 422);
    }
  }
  if (path === "dte" && method === "POST") {
    let carga: { id?: string; doc_id?: string; huella?: string } | undefined;
    let turno: { id?: number; periodo?: string } | undefined;
    try {
      const body = await req.json();
      carga = body?.carga;
      turno = body?.programada;
      // Programadas: un turno (programación + mes) se emite una sola vez.
      if (turno?.id && turno.periodo) {
        const previo = turnoEmitido(Number(turno.id), String(turno.periodo));
        if (previo) {
          return json({ message: `El turno ${turno.periodo} ya se emitió con folio ${previo.folio ?? "?"}.`, codigo: "duplicado", dte_id: previo.dte_id, folio: previo.folio }, 409);
        }
      }
      // Carga masiva: nunca emitir dos veces el mismo documento (misma huella ya emitida).
      if (carga?.huella) {
        const previo = huellasEmitidas().get(carga.huella);
        if (previo) {
          const msg = `Ya se emitió en la carga «${previo.carga}» con folio ${previo.folio ?? "?"}. No se volvió a emitir.`;
          if (carga.id && carga.doc_id) registrarResultadoCarga(carga.id, carga.doc_id, { ok: false, error: msg });
          return json({ message: msg, codigo: "duplicado", dte_id: previo.dte_id, folio: previo.folio }, 409);
        }
      }
      // Siempre emisión real con CAF del ambiente (maullin/palena). Sin simulación local.
      const res = await emitirDteConSii(body);
      if (carga?.id && carga.doc_id) {
        registrarResultadoCarga(carga.id, carga.doc_id, { ok: true, dte_id: res.data.id, folio: res.data.folio, sii_estado: res.sii.estado });
      }
      if (turno?.id && turno.periodo) registrarTurno(Number(turno.id), String(turno.periodo), { ok: true, dte_id: res.data.id, folio: res.data.folio });
      return json(res, 201);
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo emitir";
      if (carga?.id && carga.doc_id) registrarResultadoCarga(carga.id, carga.doc_id, { ok: false, error: message });
      if (turno?.id && turno.periodo) registrarTurno(Number(turno.id), String(turno.periodo), { ok: false, error: message });
      return json({ message, codigo: "dte" }, 422);
    }
  }
  if ((path === "programadas" || path.startsWith("programadas/")) && !tenantHasFeature("programadas", tenantId)) {
    return json({ message: "El módulo Programadas no está incluido en tu plan.", codigo: "modulo" }, 403);
  }
  if (path === "programadas" && method === "GET") return json(listProgramadas());
  if (path === "programadas" && method === "POST") {
    try {
      return json(crearProgramada(await req.json()), 201);
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : "No se pudo guardar", codigo: "programada" }, 422);
    }
  }
  const progMatch = path.match(/^programadas\/(\d+)(\/omitir)?$/);
  if (progMatch) {
    const pid = Number(progMatch[1]);
    try {
      if (progMatch[2] && method === "POST") {
        const body = (await req.json().catch(() => ({}))) as { periodo?: string };
        return json(omitirTurno(pid, String(body.periodo ?? "")));
      }
      if (!progMatch[2] && (method === "PUT" || method === "PATCH")) return json(actualizarProgramada(pid, await req.json()));
      if (!progMatch[2] && method === "DELETE") return json(eliminarProgramada(pid));
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo guardar";
      return json({ message, codigo: "programada" }, message.includes("no encontrada") ? 404 : 422);
    }
  }
  if (path === "dte/cargas" && method === "GET") return json(listCargas());
  if (path === "dte/cargas/emitidos" && method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { huellas?: string[] };
    const m = huellasEmitidas();
    const data = (body.huellas ?? []).flatMap((h) => {
      const p = m.get(h);
      return p ? [{ huella: h, ...p }] : [];
    });
    return json({ data });
  }
  if (path === "dte/cargas" && method === "POST") {
    const body = (await req.json().catch(() => ({}))) as {
      archivo?: string;
      documentos?: { doc_id: string; huella: string; tipo_dte: number; receptor: string; total: number }[];
    };
    if (!body.archivo || !Array.isArray(body.documentos) || !body.documentos.length) {
      return json({ message: "La carga necesita archivo y documentos.", codigo: "carga" }, 422);
    }
    if (body.documentos.length > 1000) return json({ message: "Máximo 1.000 documentos por carga.", codigo: "carga" }, 422);
    return json(
      crearCarga({
        archivo: body.archivo,
        ambiente: getSiiConfig().ambiente,
        documentos: body.documentos.map((d) => ({
          doc_id: String(d.doc_id).slice(0, 60),
          huella: String(d.huella).slice(0, 40),
          tipo_dte: Number(d.tipo_dte),
          receptor: String(d.receptor).slice(0, 100),
          total: Number(d.total) || 0,
        })),
      }),
      201,
    );
  }
  const cargaMatch = path.match(/^dte\/cargas\/([a-z0-9]+)$/);
  if (cargaMatch && method === "GET") {
    try {
      return json(getCarga(cargaMatch[1]));
    } catch {
      return notFound();
    }
  }
  if (path === "dte/stats" && method === "GET") {
    return json(statsPayload(searchParams.get("desde"), searchParams.get("hasta")));
  }
  if (path === "dte/recibidos" || path === "dte/recibidos/sync" || (path.startsWith("dte/recibidos/") && path.endsWith("/reclamar"))) {
    if (!tenantHasFeature("recibidos", tenantId)) {
      return json(
        { message: "El módulo Recibidos no está incluido en tu plan. Actívalo desde Planes o pide a soporte.", codigo: "modulo" },
        403,
      );
    }
  }
  if (path === "dte/recibidos" && method === "GET") {
    const periodo = searchParams.get("periodo") || undefined;
    const listed = listRecibidos(periodo);
    const page = Number(searchParams.get("page") || 1);
    const perPage = Number(searchParams.get("per_page") || 50);
    return json({
      ...paginate(listed.data, page, perPage),
      meta: listed.meta,
    });
  }
  if (path === "dte/recibidos/sync" && method === "POST") {
    try {
      const body = (await req.json().catch(() => ({}))) as { periodo?: string };
      return json(await syncRecibidos(body.periodo || searchParams.get("periodo") || undefined));
    } catch (e) {
      return json(
        { message: e instanceof Error ? e.message : "No se pudo sincronizar con el SII", codigo: "recibidos" },
        422,
      );
    }
  }
  if (path.startsWith("dte/recibidos/") && path.endsWith("/reclamar") && method === "POST") {
    const id = Number(path.split("/")[2]);
    if (!Number.isFinite(id)) return notFound();
    const body = await req.json().catch(() => ({}));
    try {
      return json(reclamarRecibido(id, body?.motivo));
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : "No se pudo reclamar", codigo: "recibidos" }, 422);
    }
  }
  if (path === "rcv" && method === "GET") {
    return json({
      ...paginate([], Number(searchParams.get("page") || 1), Number(searchParams.get("per_page") || 20)),
      aviso: "Sin movimientos contables en el período.",
    });
  }

  /** DTE emitidos a este RUT (receptor_rut viene con o sin DV según el origen). */
  function dtesDeCliente(c: { rut: string; dv: string }) {
    const full = `${c.rut}${c.dv}`.toUpperCase();
    return db.dtes.filter((d) => {
      const r = rutLimpio(d.receptor_rut);
      return r === full || r === c.rut;
    }).length;
  }

  if (path === "clientes" && method === "GET") {
    const q = (searchParams.get("q") || "").toLowerCase();
    const qRut = rutLimpio(q);
    let rows = db.clientes;
    if (q) {
      rows = rows.filter(
        (c) =>
          c.razon_social.toLowerCase().includes(q) ||
          (qRut.length > 1 && `${c.rut}${c.dv}`.toUpperCase().includes(qRut)),
      );
    }
    const page = paginate(rows, Number(searchParams.get("page") || 1), Number(searchParams.get("per_page") || 50));
    return json({ ...page, data: page.data.map((c) => ({ ...c, documentos: dtesDeCliente(c) })) });
  }

  function rutDuplicado(rut: string, exceptId?: number) {
    return db.clientes.find((c) => c.rut === rut && c.id !== exceptId);
  }
  function parseClienteBody(body: Record<string, unknown>) {
    // Acepta rut+dv separados, o un RUT completo (con o sin puntos) en rut / rut_formateado.
    const completo = String(body.rut_formateado || body.rut_completo || "");
    let { cuerpo, dv } = completo
      ? partesRut(completo)
      : {
          cuerpo: String(body.rut || "").replace(/\D/g, ""),
          dv: String(body.dv || "").toUpperCase(),
        };
    // Si mandaron el RUT entero en "rut" sin "dv", separarlo.
    if (cuerpo && !dv && String(body.rut || "").length > 1 && !completo) {
      ({ cuerpo, dv } = partesRut(String(body.rut)));
    }
    const rutFmtSii = rutSii(`${cuerpo}-${dv}`);
    if (!cuerpo || !dv || !rutValido(rutFmtSii)) {
      const esperado = cuerpo ? calcularDv(cuerpo) : "?";
      return {
        error: `RUT inválido: ${formatRutPuntos(rutFmtSii) || "(vacío)"}. El dígito verificador correcto para ${cuerpo || "?"} es ${esperado}.`,
      } as const;
    }
    const girosRaw = Array.isArray(body.giros) ? body.giros : [];
    const giros: GiroCliente[] = girosRaw
      .map((g) => {
        const row = g as { codigo?: unknown; glosa?: unknown };
        return {
          codigo: String(row.codigo || "").trim(),
          glosa: String(row.glosa || "").trim(),
        };
      })
      .filter((g) => g.codigo || g.glosa);
    return {
      data: {
        rut: cuerpo,
        dv,
        rut_formateado: formatRutPuntos(rutFmtSii),
        razon_social: String(body.razon_social || "Cliente nuevo"),
        giro: String(body.giro || giros[0]?.glosa || "SIN GIRO"),
        giros,
        email: String(body.email || ""),
        email_cc: String(body.email_cc || ""),
        direccion: String(body.direccion || ""),
        comuna: String(body.comuna || ""),
        ciudad: String(body.ciudad || ""),
        telefono: String(body.telefono || ""),
        contacto: String(body.contacto || ""),
      },
    } as const;
  }

  if (path === "clientes" && method === "POST") {
    const body = await req.json();
    const parsed = parseClienteBody(body);
    if ("error" in parsed) return json({ message: parsed.error, codigo: "rut" }, 422);
    const dup = rutDuplicado(parsed.data.rut);
    if (dup) {
      return json({ message: `Ya tienes a ${dup.razon_social} con el RUT ${dup.rut_formateado}.`, codigo: "rut_duplicado", cliente_id: dup.id }, 409);
    }
    const id = db.clientes.length ? Math.max(...db.clientes.map((c) => c.id)) + 1 : 1;
    const cliente = { id, ...parsed.data };
    db.clientes.unshift(cliente);
    return json({ data: cliente }, 201);
  }

  const clienteMatch = path.match(/^clientes\/(\d+)$/);
  if (clienteMatch && method === "PUT") {
    const id = Number(clienteMatch[1]);
    const idx = db.clientes.findIndex((c) => c.id === id);
    if (idx < 0) return notFound();
    const body = await req.json();
    const parsed = parseClienteBody(body);
    if ("error" in parsed) return json({ message: parsed.error, codigo: "rut" }, 422);
    const dup = rutDuplicado(parsed.data.rut, id);
    if (dup) {
      return json({ message: `Ya tienes a ${dup.razon_social} con el RUT ${dup.rut_formateado}.`, codigo: "rut_duplicado", cliente_id: dup.id }, 409);
    }
    const cliente = { id, ...parsed.data };
    db.clientes[idx] = cliente;
    return json({ data: cliente });
  }
  if (clienteMatch && method === "DELETE") {
    const id = Number(clienteMatch[1]);
    const idx = db.clientes.findIndex((c) => c.id === id);
    if (idx < 0) return notFound();
    const documentos = dtesDeCliente(db.clientes[idx]);
    if (documentos > 0) {
      return json(
        { message: `No se puede eliminar: tiene ${documentos} documento${documentos === 1 ? "" : "s"} emitido${documentos === 1 ? "" : "s"}.`, codigo: "cliente_con_dtes", documentos },
        409,
      );
    }
    const [removed] = db.clientes.splice(idx, 1);
    return json({ data: removed });
  }

  if (path === "cotizaciones" && method === "GET") {
    const q = (searchParams.get("q") || "").toLowerCase();
    const estado = (searchParams.get("estado") || "").toLowerCase();
    let rows = listCotizaciones().data;
    if (q) {
      rows = rows.filter(
        (c) =>
          c.numero.toLowerCase().includes(q) ||
          c.receptor_razon_social.toLowerCase().includes(q) ||
          c.receptor_rut.includes(q),
      );
    }
    if (estado) {
      rows = rows.filter((c) => c.estado.toLowerCase() === estado);
    }
    return json(paginate(rows, Number(searchParams.get("page") || 1), Number(searchParams.get("per_page") || 50)));
  }
  if (path === "cotizaciones" && method === "POST") {
    try {
      const body = await req.json();
      const created = crearCotizacion({
        fecha: body.fecha,
        validez_dias: body.validez_dias != null ? Number(body.validez_dias) : undefined,
        receptor: body.receptor,
        items: body.items || [],
        notas: body.notas,
        estado: body.estado || "guardada",
      });
      const archivo = guardarDocumentoCotizacion(created.data);
      const saved = actualizarCotizacion(created.data.id, { archivo_path: archivo });
      return json({ data: saved.data, archivo_path: archivo }, 201);
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : "No se pudo guardar", codigo: "cotizacion" }, 422);
    }
  }
  const cotMatch = path.match(/^cotizaciones\/(\d+)$/);
  if (cotMatch && method === "GET") {
    try {
      return json(getCotizacion(Number(cotMatch[1])));
    } catch {
      return notFound();
    }
  }
  if (cotMatch && method === "PUT") {
    try {
      const body = await req.json();
      const updated = actualizarCotizacion(Number(cotMatch[1]), {
        fecha: body.fecha,
        validez_dias: body.validez_dias != null ? Number(body.validez_dias) : undefined,
        receptor: body.receptor,
        items: body.items,
        notas: body.notas,
        estado: body.estado,
      });
      const archivo = guardarDocumentoCotizacion(updated.data);
      const saved = actualizarCotizacion(updated.data.id, { archivo_path: archivo });
      return json({ data: saved.data, archivo_path: archivo });
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : "No se pudo actualizar", codigo: "cotizacion" }, 422);
    }
  }
  const cotDocMatch = path.match(/^cotizaciones\/(\d+)\/documento$/);
  if (cotDocMatch && method === "GET") {
    try {
      const { data: cot } = getCotizacion(Number(cotDocMatch[1]));
      const format = (searchParams.get("format") || "html").toLowerCase();
      // Siempre regenerar para aplicar el layout actual.
      const archivo = guardarDocumentoCotizacion(cot);
      actualizarCotizacion(cot.id, { archivo_path: archivo });
      if (format === "pdf") {
        const buf = await pdfCotizacion(cot);
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${cot.numero}.pdf"`,
          },
        });
      }
      const html = fs.readFileSync(archivo, "utf8");
      return new NextResponse(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch {
      return notFound();
    }
  }

  if (path === "productos" && method === "GET") {
    return json({
      data: db.productos,
      meta: {
        current_page: 1,
        last_page: 1,
        per_page: Number(searchParams.get("per_page") || 50),
        total: db.productos.length,
      },
    });
  }
  /** Valida el cuerpo de un producto. Precio = neto en CLP, entero ≥ 0. */
  function parseProducto(body: Record<string, unknown>, exceptId?: number) {
    const nombre = String(body.nombre || "").trim();
    const codigo = String(body.codigo || "").trim();
    // null/"" no son 0: un precio vacío (o NaN serializado) se rechaza.
    const precio = body.precio === null || body.precio === undefined || body.precio === "" ? NaN : Number(body.precio);
    if (!nombre) return { error: "Falta el nombre del producto." } as const;
    if (!Number.isInteger(precio) || precio < 0) {
      return { error: "El precio neto debe ser un monto en pesos, sin decimales y no negativo." } as const;
    }
    if (codigo) {
      const dup = db.productos.find((p) => p.codigo.toLowerCase() === codigo.toLowerCase() && p.id !== exceptId);
      if (dup) return { error: `El código ${codigo} ya lo usa «${dup.nombre}».`, status: 409 } as const;
    }
    // Al emitir se elige el producto por nombre, así que dos iguales chocarían.
    const mismoNombre = db.productos.find((p) => p.nombre.toLowerCase() === nombre.toLowerCase() && p.id !== exceptId);
    if (mismoNombre) return { error: `Ya tienes un producto llamado «${mismoNombre.nombre}» (código ${mismoNombre.codigo}).`, status: 409 } as const;
    return {
      data: {
        codigo,
        nombre,
        descripcion: String(body.descripcion || ""),
        precio,
        unidad: String(body.unidad || "UN").trim().toUpperCase().slice(0, 4) || "UN",
        exento: body.exento === true,
      },
    } as const;
  }

  if (path === "productos/importar" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const filas: unknown[] = Array.isArray(body?.filas) ? body.filas.slice(0, 1000) : [];
    const creados: number[] = [];
    const errores: { fila: number; message: string }[] = [];
    filas.forEach((f, i) => {
      const parsed = parseProducto((f || {}) as Record<string, unknown>);
      if ("error" in parsed) {
        errores.push({ fila: i + 1, message: parsed.error ?? "Fila inválida." });
        return;
      }
      const id = db.productos.length ? Math.max(...db.productos.map((p) => p.id)) + 1 : 1;
      db.productos.unshift({ id, ...parsed.data, codigo: parsed.data.codigo || `SKU-${id}` });
      creados.push(id);
    });
    return json({ creados: creados.length, errores });
  }

  if (path === "productos" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const parsed = parseProducto(body);
    if ("error" in parsed) return json({ message: parsed.error, codigo: "producto" }, parsed.status ?? 422);
    const id = db.productos.length ? Math.max(...db.productos.map((p) => p.id)) + 1 : 1;
    const producto = { id, ...parsed.data, codigo: parsed.data.codigo || `SKU-${id}` };
    db.productos.unshift(producto);
    return json({ data: producto }, 201);
  }

  const productoMatch = path.match(/^productos\/(\d+)$/);
  if (productoMatch && (method === "PUT" || method === "DELETE")) {
    const id = Number(productoMatch[1]);
    const idx = db.productos.findIndex((p) => p.id === id);
    if (idx < 0) return notFound();
    if (method === "DELETE") {
      // Los DTE emitidos guardan su propio detalle; sacar el producto del catálogo no los altera.
      const [removed] = db.productos.splice(idx, 1);
      return json({ data: removed });
    }
    const body = await req.json().catch(() => ({}));
    const parsed = parseProducto({ descripcion: db.productos[idx].descripcion, ...body }, id);
    if ("error" in parsed) return json({ message: parsed.error, codigo: "producto" }, parsed.status ?? 422);
    const producto = { id, ...parsed.data, codigo: parsed.data.codigo || db.productos[idx].codigo };
    db.productos[idx] = producto;
    return json({ data: producto });
  }

  if ((path === "api-keys" || path.startsWith("api-keys/") || path === "contable") && !tenantHasFeature(path === "contable" ? "contable" : "api", tenantId)) {
    return json({ message: `El módulo no está incluido en tu plan.`, codigo: "modulo" }, 403);
  }
  if (path === "api-keys" && method === "GET") {
    for (const k of db.apiKeys) {
      // Claves antiguas en claro: no se pueden pasar a hash sin conocerlas; se invalidan.
      if (k.key) { delete k.key; k.activo = false; }
    }
    return json({ data: db.apiKeys.map(claveSegura) });
  }
  if ((path === "api-keys" && method === "POST") || /^api-keys\/\d+$/.test(path)) {
    if (session.role !== "owner" && session.role !== "admin" && session.role !== "platform") {
      return json({ message: "Solo el dueño o un administrador de la empresa puede gestionar claves API.", codigo: "forbidden" }, 403);
    }
  }
  if (path === "api-keys" && method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ message: "Envía los datos de la clave.", codigo: "validacion" }, 422);
    const name = String(body.name || "").trim().slice(0, 60);
    if (!name) return json({ message: "Ponle un nombre a la clave (por ejemplo, el ERP que la usará).", codigo: "validacion" }, 422);
    const ambiente = body.ambiente === "produccion" ? "produccion" : body.ambiente === "certificacion" ? "certificacion" : null;
    if (!ambiente) return json({ message: "Elige el ambiente: certificación o producción.", codigo: "validacion" }, 422);
    const permissions = Array.isArray(body.permissions) ? PERMISOS.filter((p) => body.permissions.includes(p)) : [];
    if (!permissions.length) return json({ message: "Elige al menos un permiso.", codigo: "validacion" }, 422);
    const expires_at = body.expires_at ? new Date(String(body.expires_at)) : null;
    if (expires_at && (isNaN(expires_at.getTime()) || expires_at.getTime() <= Date.now())) {
      return json({ message: "La fecha de vencimiento debe ser futura.", codigo: "validacion" }, 422);
    }
    if (db.apiKeys.filter((k) => claveUsable(k)).length >= MAX_CLAVES_ACTIVAS) {
      return json({ message: `Ya tienes ${MAX_CLAVES_ACTIVAS} claves activas. Revoca una antes de crear otra.`, codigo: "limite" }, 409);
    }
    const gen = generarClave(ambiente);
    const key = {
      id: db.apiKeys.length ? Math.max(...db.apiKeys.map((k) => k.id)) + 1 : 1,
      name,
      key_hash: gen.key_hash,
      key_hint: gen.key_hint,
      ambiente,
      permissions,
      permisos_sin_lista: false,
      activo: true,
      last_used_at: null,
      expires_at: expires_at ? expires_at.toISOString() : null,
      created_at: new Date().toISOString(),
    };
    db.apiKeys.unshift(key);
    // La clave en claro sale solo en esta respuesta.
    return json({ data: claveSegura(key), clave: gen.plain }, 201);
  }
  const revocar = path.match(/^api-keys\/(\d+)$/);
  if (revocar && method === "PATCH") {
    const k = db.apiKeys.find((x) => x.id === Number(revocar[1]));
    if (!k) return json({ message: "Clave no encontrada.", codigo: "api-keys" }, 404);
    const body = await req.json().catch(() => ({}));
    if (body.activo !== false) return json({ message: "Solo se puede revocar (activo: false).", codigo: "validacion" }, 422);
    k.activo = false;
    return json({ data: claveSegura(k) });
  }

  if (path === "modulos" && method === "GET") {
    const feats = effectiveFeatures(getTenantMeta(tenantId)!);
    return json({
      data: getPlatform().modules.map((m) => ({
        key: m.key,
        nombre: m.nombre,
        descripcion: m.descripcion,
        activo: feats.includes(m.key),
      })),
    });
  }
  if (path === "planes" && method === "GET") return json({ data: getPlatform().plans });
  if (path === "documentos-autorizados" && method === "GET") {
    return json({
      data: cafEstado(getSiiConfig().ambiente).data.tipos.map((t) => ({
        tipo_dte: t.tipo_dte,
        nombre: t.tipo_nombre,
        autorizado: t.autorizado_sii,
        ambiente: getSiiConfig().ambiente,
      })),
    });
  }
  if (path === "contable" && method === "GET") {
    const periodo = searchParams.get("periodo") || periodoActualCl();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
      return json({ message: "Período no válido (usa AAAA-MM).", codigo: "validacion" }, 422);
    }
    const db = getDb();
    const ventas = libroVentas(db.dtes, periodo);
    // Sin el módulo Recibidos no hay compras que mostrar: null, no 0, para no inventar crédito fiscal.
    const compras = tenantHasFeature("recibidos", tenantId) ? resumenCompras(db.recibidos, periodo) : null;
    return json({
      data: {
        periodo,
        ventas,
        compras,
        iva_a_pagar: compras ? ventas.iva - compras.iva : null,
      },
    });
  }

  return notFound();
}

type Ctx = { params: Promise<{ path: string[] }> };

async function run(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  const publicPaths = new Set(["auth/login", "auth/register", "planes"]);
  const esClaveApi = req.headers.get("authorization")?.startsWith("Bearer sk_");
  if (!publicPaths.has(joined) && !esClaveApi && !verifyToken(req.headers.get("authorization"))) {
    return json({ message: "Sesión no válida o expirada.", codigo: "no_autenticado" }, 401);
  }
  try {
    await ensureLoaded();
  } catch (e) {
    console.error("[db] no se pudo cargar el estado:", e instanceof Error ? e.message : e);
    return json({ message: "Base de datos no disponible. Intenta más tarde.", codigo: "db" }, 503);
  }
  const res = await handle(req, path);
  const skipSave = joined === "auth/login" || joined === "sii/consulta-stc";
  // Un DTE fallido de una carga masiva igual deja registrado el fallo en el lote.
  const guardarFallo = joined === "dte" && req.method === "POST" && (res.status === 422 || res.status === 409);
  if (req.method !== "GET" && (res.ok || guardarFallo) && !skipSave) {
    try {
      await save();
    } catch (e) {
      console.error("[db] no se pudo guardar:", e instanceof Error ? e.message : e);
      return json({ message: "No se pudieron guardar los cambios en la base de datos.", codigo: "db" }, 503);
    }
  }
  return res;
}

export const GET = run;
export const POST = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;
