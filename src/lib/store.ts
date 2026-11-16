import {
  CAF_TIPOS_BASE,
  CICLO,
  INITIAL_API_KEYS,
  INITIAL_CLIENTES,
  INITIAL_DTES,
  INITIAL_PRODUCTOS,
  ONBOARDING_FASES,
  SUSCRIPCION,
  TENANT,
  TIPOS_DTE,
  USER,
} from "./seed";
import type { ApiKey, Cliente, DteItem, Producto, Tenant } from "./types";

export type CafTipo = {
  tipo_dte: number;
  tipo_nombre: string;
  autorizado_sii: boolean;
  alerta: "ninguna" | "agotado" | "bajo";
  disponibles: number;
  caf_en_uso: { desde: number; hasta: number; vence_el: string } | null;
};

export type CertificadoState = {
  tiene_certificado: boolean;
  data: {
    vigente: boolean;
    sujeto: string;
    emisor: string;
    vence_el: string;
    dias_restantes: number;
    rut_titular: string;
  } | null;
};

export type ProgressFlags = {
  renuncia_portal_gratuito: boolean;
  inscripcion_sii: boolean;
  produccion_habilitada: boolean;
  folios_palena: boolean;
};

export type Db = {
  empresa: Tenant;
  certificado: CertificadoState;
  caf: CafTipo[];
  flags: ProgressFlags;
  dtes: DteItem[];
  recibidos: DteItem[];
  clientes: Cliente[];
  productos: Producto[];
  apiKeys: ApiKey[];
  nextFolio: Record<number, number>;
};

const STORE_KEY = "__gdtDb_v2_zero";
const globalStore = globalThis as typeof globalThis & { [STORE_KEY]?: Db };

function emptyCaf(): CafTipo[] {
  return CAF_TIPOS_BASE.map((t) => ({
    tipo_dte: t.tipo_dte,
    tipo_nombre: t.tipo_nombre,
    autorizado_sii: false,
    alerta: "agotado",
    disponibles: 0,
    caf_en_uso: null,
  }));
}

function defaultDb(): Db {
  return {
    empresa: { ...TENANT },
    certificado: { tiene_certificado: false, data: null },
    caf: emptyCaf(),
    flags: {
      renuncia_portal_gratuito: false,
      inscripcion_sii: false,
      produccion_habilitada: false,
      folios_palena: false,
    },
    dtes: [...INITIAL_DTES],
    recibidos: [],
    clientes: [...INITIAL_CLIENTES],
    productos: [...INITIAL_PRODUCTOS],
    apiKeys: [...INITIAL_API_KEYS],
    nextFolio: Object.fromEntries(CAF_TIPOS_BASE.map((t) => [t.tipo_dte, 1])),
  };
}

export function getDb(): Db {
  if (!globalStore[STORE_KEY]) globalStore[STORE_KEY] = defaultDb();
  return globalStore[STORE_KEY]!;
}

export function resetDb() {
  globalStore[STORE_KEY] = defaultDb();
}

export function authPayload() {
  const db = getDb();
  return {
    user: USER,
    token: "local|gdt-devsur-demo-token",
    tenantId: db.empresa.id,
    tenant: db.empresa,
    scope: "empresa",
    organizacion: null,
    empresas: [db.empresa],
  };
}

export function mePayload() {
  const db = getDb();
  return {
    aviso_cuenta: null,
    empresas: [db.empresa],
    organizacion: null,
    scope: "empresa",
    tenant: {
      ...db.empresa,
      ambiente_effective: db.empresa.ambiente,
      emite_dte: true,
      es_demo: false,
      created_at: new Date().toISOString(),
    },
    user: USER,
  };
}

export function empresaPayload() {
  const e = getDb().empresa;
  const giros =
    e.giros && e.giros.length
      ? e.giros
      : e.acteco && e.giro
        ? [
            {
              categoria: "1",
              codigo: e.acteco,
              fecha_inicio: new Date().toLocaleDateString("es-CL"),
              glosa: e.giro,
              rubro: "Información y comunicaciones",
              principal: true,
            },
          ]
        : [];
  return {
    acteco: e.acteco || "",
    ciudad: e.ciudad || "",
    comuna: e.comuna || "",
    direccion: e.direccion || "",
    dv: e.dv,
    email: e.email || "",
    formato_impresion: e.formato_impresion ?? null,
    giro: e.giro || "",
    giros,
    logo: null,
    nombre_fantasia: e.nombre_fantasia || "",
    origen: "local",
    proveedor_actual: "Facturador GDT DevSur",
    razon_social: e.razon_social,
    rut: e.rut,
    rut_formateado: e.rut_formateado,
    sii_correos: e.email ? [e.email] : [],
    telefono: e.telefono || "",
    unidad_sii: e.unidad_sii || e.comuna || "",
    usar_logo: Boolean(e.usar_logo),
    volumen_estimado: e.volumen_estimado ?? null,
    documentos_emitir: e.documentos_emitir || [],
  };
}

export function updateEmpresa(patch: Partial<Tenant> & { giros?: Tenant["giros"]; documentos_emitir?: number[] }) {
  const db = getDb();
  const next = { ...db.empresa, ...patch };
  if (patch.giro || patch.acteco) {
    const codigo = patch.acteco ?? next.acteco ?? "";
    const glosa = patch.giro ?? next.giro ?? "";
    if (codigo && glosa) {
      const others = (next.giros || []).filter((g) => g.codigo !== codigo);
      next.giros = [{ codigo, glosa, principal: true, rubro: "Información y comunicaciones", categoria: "1" }, ...others];
    }
  }
  db.empresa = next;
  return empresaPayload();
}

export function certificadoEstado() {
  return getDb().certificado;
}

export function cargarCertificado(input?: { sujeto?: string; emisor?: string; dias?: number }) {
  const db = getDb();
  const dias = input?.dias ?? 365;
  const vence = new Date();
  vence.setDate(vence.getDate() + dias);
  db.certificado = {
    tiene_certificado: true,
    data: {
      vigente: true,
      sujeto: input?.sujeto || USER.name.toUpperCase(),
      emisor: input?.emisor || "E-CERTCHILE",
      vence_el: vence.toISOString().slice(0, 10),
      dias_restantes: dias,
      rut_titular: db.empresa.rut_formateado,
    },
  };
  return db.certificado;
}

function datosEmpresaCompletos(e: Tenant) {
  return Boolean(
    e.razon_social &&
      e.rut &&
      e.giro &&
      e.acteco &&
      e.direccion &&
      e.comuna &&
      e.ciudad &&
      e.email,
  );
}

export function onboardingEstado() {
  const db = getDb();
  const tieneFoliosCert = db.caf.some((t) => t.disponibles > 0);
  const tienePrueba = db.dtes.some((d) => d.ambiente === "certificacion");
  const emitiendoProd = db.dtes.some((d) => d.ambiente === "produccion");

  const done: Record<string, boolean> = {
    datos_empresa: datosEmpresaCompletos(db.empresa),
    certificado: db.certificado.tiene_certificado,
    renuncia_portal_gratuito: db.flags.renuncia_portal_gratuito,
    inscripcion_sii: db.flags.inscripcion_sii,
    folios_certificacion: tieneFoliosCert,
    prueba_certificacion: tienePrueba,
    produccion_habilitada: db.flags.produccion_habilitada,
    folios_palena: db.flags.folios_palena,
    emitiendo_produccion: emitiendoProd,
  };

  const fases = ONBOARDING_FASES.map((f) => ({
    ...f,
    completa: Boolean(done[f.key]),
  }));
  const completas = fases.filter((f) => f.completa).length;
  const total = fases.length;
  const progreso_pct = Math.round((completas / total) * 100);
  const pendiente = fases.find((f) => !f.completa);

  return {
    ambiente: db.empresa.ambiente,
    completas,
    total,
    progreso_pct,
    fase_actual: pendiente?.key ?? "completo",
    tipo_onboarding: "certificacion",
    documentos: db.caf.filter((t) => t.disponibles > 0).map((t) => t.tipo_dte),
    para_emitir: tieneFoliosCert && db.certificado.tiene_certificado,
    resolucion: { nro: 99, fecha: "21-10-2014" },
    resolucion_documentos:
      "Completa los pasos de habilitación. El porcentaje sube a medida que cargas datos, certificado, folios y documentos de prueba.",
    sistema_gratuito:
      "Sistema de facturación gratuito del SII (Resolución 99 del 21-10-2014).",
    fases,
  };
}

export function setProgressFlag(key: keyof ProgressFlags, value = true) {
  const db = getDb();
  db.flags[key] = value;
  return onboardingEstado();
}

export function statsPayload(desde?: string | null, hasta?: string | null) {
  const db = getDb();
  const filtered = db.dtes.filter((d) => {
    if (desde && d.fecha_emision < desde) return false;
    if (hasta && d.fecha_emision > hasta) return false;
    return true;
  });
  const aceptados = filtered.filter((d) => d.estado.startsWith("aceptado")).length;
  const suma = filtered.reduce((acc, d) => acc + d.monto_total, 0);
  return {
    aceptados,
    consumo_plan: {
      emitidos: filtered.length,
      ilimitado: false,
      limite: db.empresa.max_dte_mes,
      periodo: (desde ?? new Date().toISOString()).slice(0, 7),
    },
    por_estado: [],
    por_tipo: [],
    suma_total: suma,
    total_bruto_emitido: suma,
    total_documentos: filtered.length,
  };
}

export function listDtes(params: URLSearchParams) {
  const db = getDb();
  let rows = [...db.dtes];
  const q = (params.get("q") || params.get("buscar") || "").toLowerCase();
  const tipo = params.get("tipo_dte");
  const estado = params.get("estado");
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  const page = Number(params.get("page") || 1);
  const perPage = Number(params.get("per_page") || 50);

  if (q) {
    rows = rows.filter(
      (d) =>
        d.receptor_razon_social.toLowerCase().includes(q) ||
        d.receptor_rut.includes(q),
    );
  }
  if (tipo) rows = rows.filter((d) => String(d.tipo_dte) === tipo);
  if (estado) rows = rows.filter((d) => d.estado === estado);
  if (desde) rows = rows.filter((d) => d.fecha_emision >= desde);
  if (hasta) rows = rows.filter((d) => d.fecha_emision <= hasta);

  rows.sort((a, b) => b.fecha_emision.localeCompare(a.fecha_emision) || b.id - a.id);
  const total = rows.length;
  const start = (page - 1) * perPage;
  return {
    data: rows.slice(start, start + perPage),
    meta: {
      current_page: page,
      last_page: Math.max(1, Math.ceil(total / perPage) || 1),
      per_page: perPage,
      total,
    },
  };
}

export function emitirDte(input: {
  tipo_dte: number;
  receptor: { rut: string; dv: string; razon_social: string };
  items: { nombre: string; cantidad: number; precio: number; exento?: boolean }[];
  fecha_emision?: string;
}) {
  const db = getDb();
  const caf = db.caf.find((t) => t.tipo_dte === input.tipo_dte);
  if (!caf || caf.disponibles <= 0) {
    throw new Error("No hay folios disponibles para este tipo de DTE. Carga un CAF primero.");
  }
  if (!db.certificado.tiene_certificado) {
    throw new Error("Debes cargar un certificado digital antes de emitir.");
  }

  const tipo = TIPOS_DTE.find((t) => t.codigo === input.tipo_dte);
  const folio = db.nextFolio[input.tipo_dte] ?? 1;
  db.nextFolio[input.tipo_dte] = folio + 1;
  caf.disponibles = Math.max(0, caf.disponibles - 1);
  if (caf.disponibles === 0) {
    caf.alerta = "agotado";
    caf.caf_en_uso = null;
  }

  const neto = input.items.reduce((acc, it) => acc + it.cantidad * it.precio, 0);
  const iva = Math.round(neto * 0.19);
  const total = neto + iva;
  const dte: DteItem = {
    id: db.dtes.length ? Math.max(...db.dtes.map((d) => d.id)) + 1 : 1,
    tipo_dte: input.tipo_dte,
    tipo_nombre: tipo?.nombre ?? `Tipo ${input.tipo_dte}`,
    folio,
    fecha_emision: input.fecha_emision ?? new Date().toISOString().slice(0, 10),
    receptor_rut: `${input.receptor.rut}-${input.receptor.dv}`,
    receptor_razon_social: input.receptor.razon_social,
    monto_total: total,
    estado: "aceptado",
    ambiente: db.flags.produccion_habilitada ? "produccion" : "certificacion",
  };
  db.dtes.unshift(dte);
  return { data: dte, totales: { neto, iva, total } };
}

export function cafEstado() {
  const db = getDb();
  const activos = db.caf.filter((t) => t.disponibles > 0 || Boolean(t.caf_en_uso));
  const alertas = db.caf.filter((t) => t.alerta !== "ninguna" && (t.autorizado_sii || t.disponibles > 0 || Boolean(t.caf_en_uso)));
  return {
    data: {
      tenant_id: db.empresa.id,
      ambiente: "certificacion",
      ambiente_empresa: db.empresa.ambiente,
      calculado_at: new Date().toISOString(),
      resumen: {
        alertas: alertas.map((t) => ({ alerta: t.alerta, tipo_dte: t.tipo_dte })),
        tipos_en_alerta: alertas.length,
        tipos_activos: activos.length,
      },
      tipos: db.caf.map((t) => ({
        ...t,
        declarado: t.disponibles > 0 || Boolean(t.caf_en_uso),
        emitidos_ventana: 0,
        en_uso: false,
      })),
    },
  };
}

export function cargarCaf(tipo_dte: number, cantidad = 100) {
  const db = getDb();
  const row = db.caf.find((t) => t.tipo_dte === tipo_dte);
  if (!row) throw new Error("Tipo de DTE no soportado");
  const desde = db.nextFolio[tipo_dte] ?? 1;
  const hasta = desde + cantidad - 1;
  const vence = new Date();
  vence.setMonth(vence.getMonth() + 6);
  row.disponibles += cantidad;
  row.autorizado_sii = true;
  row.alerta = "ninguna";
  row.caf_en_uso = {
    desde,
    hasta,
    vence_el: vence.toISOString().slice(0, 10),
  };
  db.nextFolio[tipo_dte] = desde;
  return cafEstado();
}

export { CICLO, SUSCRIPCION, TENANT, TIPOS_DTE, USER };
