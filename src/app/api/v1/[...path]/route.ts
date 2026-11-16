import { NextRequest, NextResponse } from "next/server";
import { PLANES, MODULOS } from "@/lib/seed";
import {
  authPayload,
  cafEstado,
  cargarCaf,
  cargarCertificado,
  certificadoEstado,
  CICLO,
  emitirDte,
  empresaPayload,
  getDb,
  listDtes,
  mePayload,
  onboardingEstado,
  setProgressFlag,
  statsPayload,
  SUSCRIPCION,
  updateEmpresa,
} from "@/lib/store";
import { siiReadiness } from "@/lib/sii/config";
import { listPendingFromUser, probeSii } from "@/lib/sii/client";

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
  const db = getDb();

  if (path === "auth/login" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) {
      return json({ message: "Correo y contraseña requeridos.", codigo: "validacion" }, 422);
    }
    // Local demo: any password works for the seeded admin email, or demo/demo
    if (
      email !== "nfigueroa@gdtdevsur.cl" &&
      email !== "admin@gdtdevsur.cl" &&
      email !== "demo@gdtdevsur.cl"
    ) {
      return json({ message: "Credenciales inválidas.", codigo: "auth" }, 401);
    }
    return json(authPayload());
  }

  if (path === "auth/me" && method === "GET") return json(mePayload());
  if (path === "perfil" && method === "GET") {
    return json({
      id: authPayload().user.id,
      name: authPayload().user.name,
      email: authPayload().user.email,
      role: authPayload().user.role,
    });
  }

  if (path === "certificado/estado" && method === "GET") return json(certificadoEstado());
  if (path === "certificado" && method === "POST") {
    return json(cargarCertificado(await req.json().catch(() => ({}))), 201);
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
  if (path === "sii/pendiente" && method === "GET") return json({ data: listPendingFromUser() });
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
  if (path === "suscripcion" && method === "GET") return json(SUSCRIPCION);
  if (path === "empresa" && method === "GET") return json(empresaPayload());
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

  if (path === "caf/estado" || path === "caf/status") return json(cafEstado());
  if (path === "caf/actividad") return json({ data: [] });
  if (path === "caf/cargar" && method === "POST") {
    const body = await req.json().catch(() => ({}));
    try {
      return json(cargarCaf(Number(body.tipo_dte || 33), Number(body.cantidad || 100)), 201);
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : "Error CAF", codigo: "caf" }, 422);
    }
  }
  if (path === "caf/proyeccion") {
    return json({
      data: {
        ambiente: "certificacion",
        tipos: cafEstado().data.tipos.map((t) => ({
          tipo_dte: t.tipo_dte,
          cobertura_dias: t.disponibles > 0 ? 178 : 0,
          disponibles: t.disponibles,
        })),
      },
    });
  }

  if (path === "dte" && method === "GET") return json(listDtes(searchParams));
  if (path === "dte" && method === "POST") {
    try {
      const body = await req.json();
      return json(emitirDte(body), 201);
    } catch (e) {
      return json({ message: e instanceof Error ? e.message : "No se pudo emitir", codigo: "dte" }, 422);
    }
  }
  if (path === "dte/stats" && method === "GET") {
    return json(statsPayload(searchParams.get("desde"), searchParams.get("hasta")));
  }
  if (path === "dte/recibidos" && method === "GET") {
    return json(paginate(db.recibidos, Number(searchParams.get("page") || 1), Number(searchParams.get("per_page") || 20)));
  }
  if (path === "rcv" && method === "GET") {
    return json({
      ...paginate([], Number(searchParams.get("page") || 1), Number(searchParams.get("per_page") || 20)),
      aviso: "Sin movimientos contables en el período.",
    });
  }

  if (path === "clientes" && method === "GET") {
    const q = (searchParams.get("q") || "").toLowerCase();
    let rows = db.clientes;
    if (q) {
      rows = rows.filter(
        (c) =>
          c.razon_social.toLowerCase().includes(q) ||
          c.rut_formateado.includes(q) ||
          c.rut.includes(q),
      );
    }
    return json(paginate(rows, Number(searchParams.get("page") || 1), Number(searchParams.get("per_page") || 50)));
  }
  if (path === "clientes" && method === "POST") {
    const body = await req.json();
    const id = db.clientes.length ? Math.max(...db.clientes.map((c) => c.id)) + 1 : 1;
    const cliente = {
      id,
      rut: String(body.rut || "").replace(/\D/g, "").slice(0, -1) || "11111111",
      dv: String(body.dv || "1"),
      rut_formateado: body.rut_formateado || `${body.rut}-${body.dv}`,
      razon_social: body.razon_social || "Cliente nuevo",
      giro: body.giro || "SIN GIRO",
      email: body.email || "",
      direccion: body.direccion || "",
      comuna: body.comuna || "",
      ciudad: body.ciudad || "",
    };
    db.clientes.unshift(cliente);
    return json({ data: cliente }, 201);
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
  if (path === "productos" && method === "POST") {
    const body = await req.json();
    const id = db.productos.length ? Math.max(...db.productos.map((p) => p.id)) + 1 : 1;
    const producto = {
      id,
      codigo: body.codigo || `SKU-${id}`,
      nombre: body.nombre || "Producto",
      descripcion: body.descripcion || "",
      precio: Number(body.precio || 0),
      unidad: body.unidad || "UN",
      exento: Boolean(body.exento),
    };
    db.productos.unshift(producto);
    return json({ data: producto }, 201);
  }

  if (path === "api-keys" && method === "GET") return json({ data: db.apiKeys });
  if (path === "api-keys" && method === "POST") {
    const body = await req.json();
    const id = db.apiKeys.length ? Math.max(...db.apiKeys.map((k) => k.id)) + 1 : 1;
    const key = {
      id,
      name: body.name || `Clave ${id}`,
      key: `sk_test_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
      ambiente: body.ambiente || "test",
      permissions: body.permissions || ["dte:create", "dte:read"],
      permisos_sin_lista: false,
      activo: true,
      last_used_at: null,
      expires_at: null,
      created_at: new Date().toISOString(),
    };
    db.apiKeys.unshift(key);
    return json({ data: key }, 201);
  }

  if (path === "modulos" && method === "GET") return json({ data: MODULOS });
  if (path === "planes" && method === "GET") return json({ data: PLANES });
  if (path === "documentos-autorizados" && method === "GET") {
    return json({
      data: cafEstado().data.tipos.map((t) => ({
        tipo_dte: t.tipo_dte,
        nombre: t.tipo_nombre,
        autorizado: t.autorizado_sii,
        ambiente: "certificacion",
      })),
    });
  }
  if (path === "contable" && method === "GET") {
    return json({
      data: {
        periodo: searchParams.get("periodo") || new Date().toISOString().slice(0, 7),
        ventas: statsPayload().suma_total,
        compras: 0,
        documentos: statsPayload().total_documentos,
      },
    });
  }

  return notFound();
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return handle(req, path);
}
