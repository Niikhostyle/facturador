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
import type { ApiKey, Cliente, Cotizacion, CotizacionItem, DteItem, Producto, RecibidoItem, Tenant } from "./types";
import { logoExiste } from "./logo";
import { ivaDe } from "./iva";

export type CafTipo = {
  tipo_dte: number;
  tipo_nombre: string;
  autorizado_sii: boolean;
  alerta: "ninguna" | "agotado" | "bajo" | "vencido";
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

export type SiiAmbiente = "certificacion" | "produccion";

export type SiiSettings = {
  ambiente?: SiiAmbiente;
  rutEmpresa?: string;
  rutCertificado?: string;
  nroResolucion?: string;
  fechaResolucion?: string;
  enabled?: boolean;
  /** Certificado propio de la empresa (ruta relativa) y su clave cifrada (lib/sii/certSecret). */
  certFile?: string;
  certPasswordEnc?: string;
};

export type Db = {
  empresa: Tenant;
  siiConfig?: SiiSettings;
  certificado: CertificadoState;
  /** @deprecated usar cafByAmbiente; se mantiene sincronizado con el ambiente activo. */
  caf: CafTipo[];
  /** Folios/CAF separados: maullin (certificacion) vs palena (produccion). */
  cafByAmbiente?: Record<SiiAmbiente, CafTipo[]>;
  flags: ProgressFlags;
  dtes: DteItem[];
  recibidos: RecibidoItem[];
  cotizaciones?: Cotizacion[];
  nextCotizacionFolio?: number;
  clientes: Cliente[];
  productos: Producto[];
  apiKeys: ApiKey[];
  /** @deprecated usar nextFolioByAmbiente */
  nextFolio: Record<number, number>;
  nextFolioByAmbiente?: Record<SiiAmbiente, Record<number, number>>;
  cargasMasivas?: CargaMasiva[];
  programadas?: Programada[];
};

export type Ejecucion = {
  /** Período del turno: AAAA-MM */
  periodo: string;
  estado: "emitida" | "omitida" | "fallida";
  at: string;
  dte_id?: number;
  folio?: number;
  error?: string;
};

export type Programada = {
  id: number;
  nombre: string;
  tipo_dte: 33 | 34;
  receptor: { rut: string; dv: string; razon_social: string; giro?: string; direccion?: string; comuna?: string; email?: string };
  glosa: string;
  /** Monto neto (sin IVA). En tipo 34 es el monto exento. */
  neto: number;
  /** Día del mes del turno, 1 a 28. */
  dia: number;
  encendida: boolean;
  /** Primer período que corresponde emitir (AAAA-MM). */
  desde: string;
  creada_at: string;
  actualizada_at: string;
  ejecuciones: Ejecucion[];
};

export type CargaDoc = {
  doc_id: string;
  huella: string;
  tipo_dte: number;
  receptor: string;
  total: number;
  estado: "pendiente" | "emitido" | "fallido";
  dte_id?: number;
  folio?: number;
  sii_estado?: string;
  error?: string;
};

export type CargaMasiva = {
  id: string;
  archivo: string;
  creada_at: string;
  usuario?: string;
  ambiente: SiiAmbiente;
  documentos: CargaDoc[];
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

/** Bucket de datos de una empresa (tenant). */
export function defaultTenantDb(): Db {
  const cafCert = emptyCaf();
  const cafProd = emptyCaf();
  const nfCert = defaultNextFolio();
  const nfProd = defaultNextFolio();
  return {
    empresa: { ...TENANT },
    siiConfig: {},
    certificado: { tiene_certificado: false, data: null },
    caf: cafCert,
    cafByAmbiente: { certificacion: cafCert, produccion: cafProd },
    flags: {
      renuncia_portal_gratuito: false,
      inscripcion_sii: false,
      produccion_habilitada: false,
      folios_palena: false,
    },
    dtes: [...INITIAL_DTES],
    recibidos: [],
    cotizaciones: [],
    nextCotizacionFolio: 1,
    clientes: [...INITIAL_CLIENTES],
    productos: [...INITIAL_PRODUCTOS],
    apiKeys: [...INITIAL_API_KEYS],
    nextFolio: nfCert,
    nextFolioByAmbiente: { certificacion: nfCert, produccion: nfProd },
  };
}

function defaultDb(): Db {
  return defaultTenantDb();
}

function defaultNextFolio(): Record<number, number> {
  return Object.fromEntries(CAF_TIPOS_BASE.map((t) => [t.tipo_dte, 1]));
}

/** Normaliza el estado para tener buckets por ambiente (migración desde caf/nextFolio planos). */
export function ensureCafAmbientes(db: Db = getDb()): Db {
  if (!db.cotizaciones) db.cotizaciones = [];
  if (!db.nextCotizacionFolio || db.nextCotizacionFolio < 1) db.nextCotizacionFolio = 1;
  if (!db.cafByAmbiente) {
    db.cafByAmbiente = {
      certificacion: db.caf?.length ? db.caf.map((t) => ({ ...t })) : emptyCaf(),
      produccion: emptyCaf(),
    };
  } else {
    if (!db.cafByAmbiente.certificacion?.length) db.cafByAmbiente.certificacion = emptyCaf();
    if (!db.cafByAmbiente.produccion?.length) db.cafByAmbiente.produccion = emptyCaf();
  }
  // Empresas creadas antes de sumar tipos al catálogo: agregar las filas que falten.
  for (const amb of ["certificacion", "produccion"] as const) {
    const filas = db.cafByAmbiente[amb];
    for (const base of emptyCaf()) if (!filas.some((t) => t.tipo_dte === base.tipo_dte)) filas.push(base);
    filas.sort((a, b) => a.tipo_dte - b.tipo_dte);
  }
  if (!db.nextFolioByAmbiente) {
    db.nextFolioByAmbiente = {
      certificacion: { ...(db.nextFolio || defaultNextFolio()) },
      produccion: defaultNextFolio(),
    };
  } else {
    db.nextFolioByAmbiente.certificacion ??= defaultNextFolio();
    db.nextFolioByAmbiente.produccion ??= defaultNextFolio();
  }
  for (const amb of ["certificacion", "produccion"] as const) {
    for (const [tipo, folio] of Object.entries(defaultNextFolio())) db.nextFolioByAmbiente[amb][Number(tipo)] ??= folio;
  }
  // Mantener aliases hacia el ambiente SII activo (compat).
  const amb: SiiAmbiente = db.siiConfig?.ambiente === "produccion" ? "produccion" : "certificacion";
  db.caf = db.cafByAmbiente[amb];
  db.nextFolio = db.nextFolioByAmbiente[amb];
  return db;
}

export function getDb(): Db {
  // Multi-tenant: el bucket activo lo define platform (AsyncLocalStorage / tenant del token).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getTenantDb } = require("./platform") as typeof import("./platform");
    return getTenantDb();
  } catch {
    if (!globalStore[STORE_KEY]) globalStore[STORE_KEY] = defaultDb();
    return ensureCafAmbientes(globalStore[STORE_KEY]!);
  }
}

/** @deprecated Preferir replacePlatform; se mantiene para migraciones. */
export function replaceDb(data: Db) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { replacePlatform } = require("./platform") as typeof import("./platform");
    replacePlatform(data);
    return;
  } catch {
    globalStore[STORE_KEY] = ensureCafAmbientes({ ...defaultDb(), ...data });
  }
}

export function cafTipos(ambiente: SiiAmbiente): CafTipo[] {
  return ensureCafAmbientes().cafByAmbiente![ambiente];
}

export function nextFolioMap(ambiente: SiiAmbiente): Record<number, number> {
  return ensureCafAmbientes().nextFolioByAmbiente![ambiente];
}

export function resetDb() {
  globalStore[STORE_KEY] = defaultDb();
}

export function authPayload(user = USER, tenantId?: number) {
  const db = getDb();
  const tid = tenantId ?? db.empresa.id;
  return {
    user,
    token: "local|gdt-devsur-demo-token",
    tenantId: tid,
    tenant: db.empresa,
    scope: "empresa",
    organizacion: null,
    empresas: [db.empresa],
  };
}

export function mePayload(user = USER) {
  const db = getDb();
  let features = db.empresa.features || [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { effectiveFeatures, getTenantMeta } = require("./platform") as typeof import("./platform");
    const meta = getTenantMeta(db.empresa.id);
    if (meta) features = effectiveFeatures(meta);
  } catch {
    /* ignore */
  }
  return {
    aviso_cuenta: null,
    empresas: [db.empresa],
    organizacion: null,
    scope: "empresa",
    tenant: {
      ...db.empresa,
      features,
      ambiente_effective: db.empresa.ambiente,
      emite_dte: true,
      es_demo: false,
      created_at: new Date().toISOString(),
    },
    user,
    features,
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
    has_logo: logoExiste(),
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

/** Vigencia calculada al consultar: lo guardado al subir queda viejo con los días. */
export function certificadoEstado(hoy = new Date().toISOString().slice(0, 10)) {
  const c = getDb().certificado;
  if (!c.data) return c;
  const dias = Math.round((Date.parse(c.data.vence_el) - Date.parse(hoy)) / 86_400_000);
  return { ...c, data: { ...c.data, dias_restantes: dias, vigente: dias >= 0 } };
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
    resolucion: {
      nro: Number(db.siiConfig?.nroResolucion ?? process.env.SII_NRO_RESOLUCION ?? 0) || 0,
      fecha: (db.siiConfig?.fechaResolucion || process.env.SII_FECHA_RESOLUCION || "").replace(
        /^(\d{4})-(\d{2})-(\d{2})$/,
        "$3-$2-$1",
      ),
    },
    resolucion_documentos:
      "Completa los pasos de habilitación. El porcentaje sube a medida que cargas datos, certificado, folios y documentos de prueba.",
    sistema_gratuito:
      "En certificación el N° de resolución es 0; la fecha debe coincidir con la de maullín para tu RUT.",
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
      // 0 o el viejo comodín 999999 = plan ilimitado (Empresa).
      ilimitado: !db.empresa.max_dte_mes || db.empresa.max_dte_mes >= 999999,
      limite: !db.empresa.max_dte_mes || db.empresa.max_dte_mes >= 999999 ? 0 : db.empresa.max_dte_mes,
      periodo: (desde ?? new Date().toISOString()).slice(0, 7),
    },
    por_estado: [],
    por_tipo: [],
    suma_total: suma,
    total_bruto_emitido: suma,
    total_documentos: filtered.length,
  };
}

export function getDte(id: number) {
  const row = getDb().dtes.find((d) => d.id === id);
  if (!row) throw new Error("Documento no encontrado");
  return { data: row };
}

/* ── Programadas (contratos mensuales, se emiten con confirmación) ─── */

/** Hoy en Chile (America/Santiago), como AAAA-MM-DD. */
export function hoyChile(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function sumarMes(periodo: string, n: number) {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Primer período: este mes si el turno aún no pasa, si no el próximo. */
export function primerPeriodo(dia: number, hoy = hoyChile()) {
  const periodo = hoy.slice(0, 7);
  return Number(hoy.slice(8, 10)) <= dia ? periodo : sumarMes(periodo, 1);
}

export function estadoProgramada(p: Programada, hoy = hoyChile()) {
  const resueltos = new Set(p.ejecuciones.filter((e) => e.estado !== "fallida").map((e) => e.periodo));
  const actual = hoy.slice(0, 7);
  const diaHoy = Number(hoy.slice(8, 10));
  // Turnos vencidos y no resueltos, desde `desde` hasta hoy (máx. 12 hacia atrás).
  const pendientes: string[] = [];
  if (p.encendida) {
    let per = p.desde;
    for (let i = 0; i < 24 && per <= actual; i++, per = sumarMes(per, 1)) {
      if (per === actual && diaHoy < p.dia) break;
      if (!resueltos.has(per)) pendientes.push(per);
    }
  }
  // Próximo turno futuro no resuelto.
  let prox = actual < p.desde ? p.desde : diaHoy < p.dia ? actual : sumarMes(actual, 1);
  while (resueltos.has(prox)) prox = sumarMes(prox, 1);
  const proxima = p.encendida ? `${prox}-${String(p.dia).padStart(2, "0")}` : null;
  const iva = p.tipo_dte === 34 ? 0 : ivaDe(p.neto);
  const ultima = [...p.ejecuciones].sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  return { ...p, pendientes: pendientes.slice(-12), proxima, iva, total: p.neto + iva, ultima };
}

function programadas(): Programada[] {
  const db = getDb();
  if (!db.programadas) db.programadas = [];
  return db.programadas;
}

export function listProgramadas() {
  const hoy = hoyChile();
  return { data: programadas().map((p) => estadoProgramada(p, hoy)), hoy };
}

export type ProgramadaInput = Pick<Programada, "nombre" | "tipo_dte" | "receptor" | "glosa" | "neto" | "dia" | "encendida">;

function validarProgramada(i: Partial<ProgramadaInput>): ProgramadaInput {
  const nombre = String(i.nombre ?? "").trim().slice(0, 80);
  if (!nombre) throw new Error("Ponle un nombre a la programación.");
  const tipo = Number(i.tipo_dte);
  if (tipo !== 33 && tipo !== 34) throw new Error("Solo se programan facturas (33) y facturas exentas (34).");
  const r = i.receptor;
  const rut = String(r?.rut ?? "").replace(/\D/g, "");
  const dv = String(r?.dv ?? "").toUpperCase();
  if (!rut || !dv) throw new Error("Falta el RUT del cliente.");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { calcularDv } = require("./sii/rut") as typeof import("./sii/rut");
  if (calcularDv(rut) !== dv) throw new Error(`El RUT ${rut}-${dv} no es válido: el dígito verificador debería ser ${calcularDv(rut)}.`);
  const razon = String(r?.razon_social ?? "").trim().slice(0, 100);
  if (!razon) throw new Error("Falta la razón social del cliente.");
  const glosa = String(i.glosa ?? "").trim().slice(0, 80);
  if (!glosa) throw new Error("Describe qué se factura (glosa).");
  const neto = Math.round(Number(i.neto));
  if (!(neto > 0)) throw new Error("El monto debe ser mayor que $0.");
  const dia = Math.round(Number(i.dia));
  if (!(dia >= 1 && dia <= 28)) throw new Error("El día del turno va del 1 al 28.");
  return {
    nombre,
    tipo_dte: tipo,
    receptor: {
      rut,
      dv,
      razon_social: razon,
      giro: r?.giro?.slice(0, 40) || undefined,
      direccion: r?.direccion?.slice(0, 70) || undefined,
      comuna: r?.comuna?.slice(0, 20) || undefined,
      email: r?.email?.slice(0, 80) || undefined,
    },
    glosa,
    neto,
    dia,
    encendida: i.encendida !== false,
  };
}

export function crearProgramada(input: Partial<ProgramadaInput>) {
  const v = validarProgramada(input);
  const lista = programadas();
  const now = new Date().toISOString();
  const p: Programada = {
    ...v,
    id: lista.length ? Math.max(...lista.map((x) => x.id)) + 1 : 1,
    desde: primerPeriodo(v.dia),
    creada_at: now,
    actualizada_at: now,
    ejecuciones: [],
  };
  lista.unshift(p);
  return { data: estadoProgramada(p) };
}

function buscarProgramada(id: number) {
  const p = programadas().find((x) => x.id === id);
  if (!p) throw new Error("Programación no encontrada");
  return p;
}

export function actualizarProgramada(id: number, input: Partial<ProgramadaInput>) {
  const p = buscarProgramada(id);
  const v = validarProgramada({ ...p, ...input, receptor: { ...p.receptor, ...(input.receptor ?? {}) } });
  const cambioDia = v.dia !== p.dia;
  const reencendida = v.encendida && !p.encendida;
  Object.assign(p, v, { actualizada_at: new Date().toISOString() });
  // Al cambiar el día o volver a encender, no se cobran turnos atrasados.
  if (cambioDia || reencendida) {
    const prim = primerPeriodo(p.dia);
    if (prim > p.desde) p.desde = prim;
  }
  return { data: estadoProgramada(p) };
}

export function eliminarProgramada(id: number) {
  const lista = programadas();
  const i = lista.findIndex((x) => x.id === id);
  if (i < 0) throw new Error("Programación no encontrada");
  lista.splice(i, 1);
  return { ok: true };
}

export function omitirTurno(id: number, periodo: string) {
  const p = buscarProgramada(id);
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw new Error("Período inválido");
  if (p.ejecuciones.some((e) => e.periodo === periodo && e.estado === "emitida")) throw new Error("Ese turno ya se emitió.");
  p.ejecuciones = p.ejecuciones.filter((e) => e.periodo !== periodo);
  p.ejecuciones.push({ periodo, estado: "omitida", at: new Date().toISOString() });
  return { data: estadoProgramada(p) };
}

/** Turno ya emitido → para no emitir dos veces el mismo mes. */
export function turnoEmitido(id: number, periodo: string) {
  const p = programadas().find((x) => x.id === id);
  return p?.ejecuciones.find((e) => e.periodo === periodo && e.estado === "emitida") ?? null;
}

export function registrarTurno(id: number, periodo: string, r: { ok: true; dte_id: number; folio: number } | { ok: false; error: string }) {
  const p = programadas().find((x) => x.id === id);
  if (!p) return;
  p.ejecuciones = p.ejecuciones.filter((e) => e.periodo !== periodo);
  p.ejecuciones.push(
    r.ok
      ? { periodo, estado: "emitida", at: new Date().toISOString(), dte_id: r.dte_id, folio: r.folio }
      : { periodo, estado: "fallida", at: new Date().toISOString(), error: r.error.slice(0, 300) },
  );
}

/* ── Cargas masivas (lotes de la planilla) ─────────────────────────── */

function cargas(): CargaMasiva[] {
  const db = getDb();
  if (!db.cargasMasivas) db.cargasMasivas = [];
  return db.cargasMasivas;
}

export function resumenCarga(c: CargaMasiva) {
  const emitidos = c.documentos.filter((d) => d.estado === "emitido").length;
  const fallidos = c.documentos.filter((d) => d.estado === "fallido").length;
  const pendientes = c.documentos.length - emitidos - fallidos;
  const estado = pendientes === c.documentos.length ? "sin_emitir" : pendientes > 0 ? "incompleta" : fallidos > 0 ? "con_fallos" : "emitida";
  return { ...c, emitidos, fallidos, pendientes, estado };
}

export function listCargas() {
  return { data: cargas().slice(0, 50).map((c) => ({ ...resumenCarga(c), documentos: undefined })) };
}

export function getCarga(id: string) {
  const c = cargas().find((x) => x.id === id);
  if (!c) throw new Error("Carga no encontrada");
  return { data: resumenCarga(c) };
}

/** Huellas ya emitidas en cualquier carga anterior → para no emitir dos veces el mismo documento. */
export function huellasEmitidas(): Map<string, { folio?: number; dte_id?: number; carga: string }> {
  const m = new Map<string, { folio?: number; dte_id?: number; carga: string }>();
  for (const c of cargas()) for (const d of c.documentos) if (d.estado === "emitido") m.set(d.huella, { folio: d.folio, dte_id: d.dte_id, carga: c.archivo });
  return m;
}

export function crearCarga(input: { archivo: string; ambiente: SiiAmbiente; usuario?: string; documentos: Omit<CargaDoc, "estado">[] }) {
  const lista = cargas();
  const c: CargaMasiva = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    archivo: input.archivo.slice(0, 120),
    creada_at: new Date().toISOString(),
    usuario: input.usuario,
    ambiente: input.ambiente,
    documentos: input.documentos.map((d) => ({ ...d, estado: "pendiente" as const })),
  };
  lista.unshift(c);
  if (lista.length > 200) lista.length = 200;
  return { data: resumenCarga(c) };
}

export function registrarResultadoCarga(
  cargaId: string,
  docId: string,
  r: { ok: true; dte_id: number; folio: number; sii_estado?: string } | { ok: false; error: string },
) {
  const c = cargas().find((x) => x.id === cargaId);
  const d = c?.documentos.find((x) => x.doc_id === docId);
  if (!d) return;
  if (r.ok) Object.assign(d, { estado: "emitido", dte_id: r.dte_id, folio: r.folio, sii_estado: r.sii_estado, error: undefined });
  else Object.assign(d, { estado: "fallido", error: r.error.slice(0, 300) });
}

export function listDtes(params: URLSearchParams) {
  const db = getDb();
  let rows = [...db.dtes];
  const q = (params.get("q") || params.get("buscar") || "").toLowerCase();
  const tipo = params.get("tipo_dte");
  const estado = params.get("estado");
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  const montoMin = params.get("monto_min");
  const montoMax = params.get("monto_max");
  const ocultarPruebas =
    params.get("ocultar_pruebas") === "1" ||
    params.get("ocultar_pruebas") === "true";
  const exportAll =
    params.get("export") === "1" ||
    params.get("export") === "all" ||
    params.get("all") === "1";
  const sort = params.get("sort") || "fecha_emision";
  const dir = (params.get("dir") || "desc").toLowerCase() === "asc" ? 1 : -1;
  const page = Number(params.get("page") || 1);
  const perPage = Number(params.get("per_page") || 50);

  if (q) {
    rows = rows.filter(
      (d) =>
        d.receptor_razon_social.toLowerCase().includes(q) ||
        d.receptor_rut.includes(q) ||
        String(d.folio).includes(q),
    );
  }
  if (tipo) {
    const tipos = tipo.split(",").map((t) => t.trim()).filter(Boolean);
    rows = rows.filter((d) => tipos.includes(String(d.tipo_dte)));
  }
  if (estado) {
    const estados = estado.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    rows = rows.filter((d) => estados.some((e) => d.estado.toLowerCase().includes(e)));
  }
  if (desde) rows = rows.filter((d) => d.fecha_emision >= desde);
  if (hasta) rows = rows.filter((d) => d.fecha_emision <= hasta);
  if (montoMin) rows = rows.filter((d) => d.monto_total >= Number(montoMin));
  if (montoMax) rows = rows.filter((d) => d.monto_total <= Number(montoMax));
  // Set de certificación (maullín): no son ventas de producción.
  if (ocultarPruebas) {
    rows = rows.filter((d) => d.ambiente !== "certificacion");
  }

  rows.sort((a, b) => {
    if (sort === "folio") return (a.folio - b.folio) * dir;
    if (sort === "monto_total") return (a.monto_total - b.monto_total) * dir;
    const byDate = a.fecha_emision.localeCompare(b.fecha_emision) * dir;
    return byDate || (b.id - a.id);
  });
  const total = rows.length;
  if (exportAll) {
    const capped = rows.slice(0, 50_000);
    return {
      data: capped,
      meta: {
        current_page: 1,
        last_page: 1,
        per_page: capped.length,
        total,
      },
    };
  }
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

export function listRecibidos(periodo?: string) {
  const db = getDb();
  const rows = periodo ? db.recibidos.filter((r) => r.periodo === periodo) : [...db.recibidos];
  rows.sort((a, b) => b.fecha_emision.localeCompare(a.fecha_emision) || b.id - a.id);
  const aceptadas = rows.filter((r) => r.estado === "aceptada").length;
  const reclamables = rows.filter((r) => r.estado === "reclamable").length;
  const reclamadas = rows.filter((r) => r.estado === "reclamada").length;
  const creditoFiscal = rows
    .filter((r) => r.estado !== "reclamada")
    .reduce((acc, r) => acc + (r.monto_iva || 0), 0);
  return {
    data: rows,
    meta: {
      periodo: periodo || null,
      total: rows.length,
      credito_fiscal: creditoFiscal,
      estados: {
        aceptadas,
        reclamables,
        reclamadas,
      },
    },
  };
}

/**
 * Trae del SII el RCV de compras del periodo (datos reales de www4/palena)
 * y reemplaza la bandeja local de ese mes.
 */
export async function syncRecibidos(periodo?: string) {
  const ym =
    periodo && /^\d{4}-\d{2}$/.test(periodo)
      ? periodo
      : (() => {
          const d = new Date();
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        })();

  const { traerComprasRcv } = await import("./sii/rcv");
  const remotos = await traerComprasRcv(ym);
  const db = getDb();
  const otros = db.recibidos.filter((r) => r.periodo !== ym);
  let nextId = db.recibidos.length ? Math.max(...db.recibidos.map((r) => r.id)) + 1 : 1;
  const mapped = remotos.map((r) => ({ ...r, id: nextId++ }));
  db.recibidos = [...mapped, ...otros];

  const listed = listRecibidos(ym);
  return {
    nuevos: mapped.length,
    total: listed.meta.total,
    periodo: ym,
    message:
      "Le pedimos al SII tus facturas de compra del período. Puede tardar un minuto; vuelve a cargar.",
    ...listed,
  };
}

export function reclamarRecibido(id: number, motivo: unknown) {
  if (motivo !== "RCD" && motivo !== "RFP" && motivo !== "RFT") {
    throw new Error("Indica el motivo del reclamo (RCD, RFP o RFT).");
  }
  const db = getDb();
  const row = db.recibidos.find((r) => r.id === id);
  if (!row) throw new Error("Documento recibido no encontrado.");
  if (row.estado !== "reclamable") {
    throw new Error("Este documento ya no se puede reclamar.");
  }
  row.estado = "reclamada";
  row.motivo_reclamo = motivo;
  return { data: row };
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
  if (alertaCaf(caf) === "vencido") {
    throw new Error(`El CAF de este tipo venció el ${caf.caf_en_uso!.vence_el}. Solicita uno nuevo en el SII y súbelo en Folios.`);
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
  const iva = ivaDe(neto);
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
    monto_neto: neto,
    monto_exento: 0,
    monto_iva: iva,
    estado: "aceptado",
    ambiente: db.flags.produccion_habilitada ? "produccion" : "certificacion",
  };
  db.dtes.unshift(dte);
  return { data: dte, totales: { neto, iva, total } };
}

const hoyIso = () => new Date().toISOString().slice(0, 10);

/** Alerta calculada al consultar: vencimiento y "bajo" dependen de la fecha y del rango, no solo del último evento. */
export function alertaCaf(t: Pick<CafTipo, "disponibles" | "autorizado_sii" | "caf_en_uso">, hoy = hoyIso()): CafTipo["alerta"] {
  if (t.caf_en_uso && t.caf_en_uso.vence_el < hoy) return "vencido";
  if (t.disponibles <= 0) return t.autorizado_sii ? "agotado" : "ninguna";
  const rango = t.caf_en_uso ? t.caf_en_uso.hasta - t.caf_en_uso.desde + 1 : t.disponibles;
  return t.disponibles < Math.max(10, Math.ceil(rango * 0.1)) ? "bajo" : "ninguna";
}

export function cafEstado(ambiente: SiiAmbiente = "certificacion") {
  const db = getDb();
  const tipos = cafTipos(ambiente);
  const nf = nextFolioMap(ambiente);
  const hoy = hoyIso();
  const conAlerta = tipos.map((t) => ({ ...t, alerta: alertaCaf(t, hoy) }));
  const activos = conAlerta.filter((t) => t.disponibles > 0 || Boolean(t.caf_en_uso));
  const alertas = conAlerta.filter((t) => t.alerta !== "ninguna");
  return {
    data: {
      tenant_id: db.empresa.id,
      ambiente,
      ambiente_empresa: db.empresa.ambiente,
      calculado_at: new Date().toISOString(),
      resumen: {
        alertas: alertas.map((t) => ({ alerta: t.alerta, tipo_dte: t.tipo_dte })),
        tipos_en_alerta: alertas.length,
        tipos_activos: activos.length,
      },
      tipos: conAlerta.map((t) => {
        const desde = t.caf_en_uso?.desde ?? 1;
        const hasta = t.caf_en_uso?.hasta ?? desde;
        const actual = nf[t.tipo_dte];
        const proximo = actual && actual >= desde ? actual : desde;
        return {
          ...t,
          declarado: t.disponibles > 0 || Boolean(t.caf_en_uso),
          emitidos_ventana: 0,
          en_uso: false,
          proximo_folio: proximo <= hasta ? proximo : null,
        };
      }),
    },
  };
}

export function cargarCaf(tipo_dte: number, cantidad = 100, ambiente: SiiAmbiente = "certificacion") {
  const row = cafTipos(ambiente).find((t) => t.tipo_dte === tipo_dte);
  if (!row) throw new Error("Tipo de DTE no soportado");
  const nf = nextFolioMap(ambiente);
  const desde = nf[tipo_dte] ?? 1;
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
  nf[tipo_dte] = desde;
  return cafEstado(ambiente);
}

/** Config SII editable desde la UI (se superpone a las variables de entorno). */
export function getSiiSettings(): SiiSettings {
  return getDb().siiConfig ?? {};
}

export function actualizarSiiConfig(patch: SiiSettings) {
  const db = getDb();
  db.siiConfig = { ...(db.siiConfig ?? {}), ...patch };
  return db.siiConfig;
}

/** Guarda en el estado los datos de un certificado .p12 REAL ya validado. */
export function guardarCertificado(data: NonNullable<CertificadoState["data"]>) {
  const db = getDb();
  db.certificado = { tiene_certificado: true, data };
  return { data: db.certificado };
}

/** Elimina el certificado del estado (para volver a subir otro). */
export function eliminarCertificado() {
  const db = getDb();
  db.certificado = { tiene_certificado: false, data: null };
  return { data: db.certificado };
}

/**
 * Registra un CAF REAL ya parseado (del XML del SII) en el estado.
 * Fija el rango de folios autorizado y el próximo folio a usar.
 */
export function registrarCaf(input: {
  tipo_dte: number;
  desde: number;
  hasta: number;
  vence_el: string;
  ambiente?: SiiAmbiente;
}) {
  const ambiente: SiiAmbiente = input.ambiente ?? "certificacion";
  const row = cafTipos(ambiente).find((t) => t.tipo_dte === input.tipo_dte);
  if (!row) throw new Error(`Tipo de DTE ${input.tipo_dte} no está soportado.`);

  const nf = nextFolioMap(ambiente);
  // Próximo folio: parte en 'desde' salvo que ya venga uno válido dentro del rango.
  const next = nf[input.tipo_dte];
  if (!next || next < input.desde || next > input.hasta) {
    nf[input.tipo_dte] = input.desde;
  }
  const proximo = nf[input.tipo_dte];

  row.autorizado_sii = true;
  row.alerta = "ninguna";
  row.caf_en_uso = { desde: input.desde, hasta: input.hasta, vence_el: input.vence_el };
  row.disponibles = Math.max(0, input.hasta - proximo + 1);
  return cafEstado(ambiente);
}

function calcCotizacionTotales(items: CotizacionItem[]) {
  let neto = 0;
  let exento = 0;
  for (const it of items) {
    const monto = Math.round(Number(it.cantidad) * Number(it.precio));
    if (it.exento) exento += monto;
    else neto += monto;
  }
  const iva = ivaDe(neto);
  return { neto, exento, iva, total: neto + iva + exento };
}

export function listCotizaciones() {
  const db = getDb();
  return { data: db.cotizaciones ?? [] };
}

export function getCotizacion(id: number) {
  const row = (getDb().cotizaciones ?? []).find((c) => c.id === id);
  if (!row) throw new Error("Cotización no encontrada");
  return { data: row };
}

export function crearCotizacion(input: {
  fecha?: string;
  validez_dias?: number;
  receptor: {
    rut: string;
    razon_social: string;
    giro?: string;
    direccion?: string;
    comuna?: string;
    email?: string;
  };
  items: CotizacionItem[];
  notas?: string;
  estado?: Cotizacion["estado"];
}) {
  const db = getDb();
  if (!input.items?.length) throw new Error("Agrega al menos un ítem.");
  const folio = db.nextCotizacionFolio ?? 1;
  db.nextCotizacionFolio = folio + 1;
  const totales = calcCotizacionTotales(input.items);
  const now = new Date().toISOString();
  const cot: Cotizacion = {
    id: (db.cotizaciones?.length ? Math.max(...db.cotizaciones.map((c) => c.id)) : 0) + 1,
    folio,
    numero: `COT-${String(folio).padStart(4, "0")}`,
    fecha: input.fecha || now.slice(0, 10),
    validez_dias: input.validez_dias ?? 15,
    estado: input.estado ?? "guardada",
    receptor_rut: input.receptor.rut,
    receptor_razon_social: input.receptor.razon_social,
    receptor_giro: input.receptor.giro,
    receptor_direccion: input.receptor.direccion,
    receptor_comuna: input.receptor.comuna,
    receptor_email: input.receptor.email,
    items: input.items.map((it) => ({
      nombre: it.nombre,
      cantidad: Number(it.cantidad),
      precio: Number(it.precio),
      exento: Boolean(it.exento),
    })),
    ...totales,
    notas: input.notas || "",
    archivo_path: null,
    created_at: now,
    updated_at: now,
  };
  db.cotizaciones = db.cotizaciones ?? [];
  db.cotizaciones.unshift(cot);
  return { data: cot };
}

export function actualizarCotizacion(
  id: number,
  patch: Partial<{
    fecha: string;
    validez_dias: number;
    receptor: CrearCotizacionReceptor;
    items: CotizacionItem[];
    notas: string;
    estado: Cotizacion["estado"];
    archivo_path: string | null;
  }>,
) {
  const db = getDb();
  const idx = (db.cotizaciones ?? []).findIndex((c) => c.id === id);
  if (idx < 0) throw new Error("Cotización no encontrada");
  const prev = db.cotizaciones![idx];
  const items = patch.items ?? prev.items;
  const totales = calcCotizacionTotales(items);
  const receptor = patch.receptor;
  const next: Cotizacion = {
    ...prev,
    fecha: patch.fecha ?? prev.fecha,
    validez_dias: patch.validez_dias ?? prev.validez_dias,
    estado: patch.estado ?? prev.estado,
    notas: patch.notas ?? prev.notas,
    archivo_path: patch.archivo_path !== undefined ? patch.archivo_path : prev.archivo_path,
    items,
    ...totales,
    receptor_rut: receptor?.rut ?? prev.receptor_rut,
    receptor_razon_social: receptor?.razon_social ?? prev.receptor_razon_social,
    receptor_giro: receptor?.giro ?? prev.receptor_giro,
    receptor_direccion: receptor?.direccion ?? prev.receptor_direccion,
    receptor_comuna: receptor?.comuna ?? prev.receptor_comuna,
    receptor_email: receptor?.email ?? prev.receptor_email,
    updated_at: new Date().toISOString(),
  };
  db.cotizaciones![idx] = next;
  return { data: next };
}

type CrearCotizacionReceptor = {
  rut: string;
  razon_social: string;
  giro?: string;
  direccion?: string;
  comuna?: string;
  email?: string;
};

export { CICLO, SUSCRIPCION, TENANT, TIPOS_DTE, USER };
