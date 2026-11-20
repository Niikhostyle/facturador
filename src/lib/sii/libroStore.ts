import fs from "fs";
import path from "path";
import { getDb } from "../store";
import { getSiiConfig } from "./config";
import { cargarCertDesdeEnv } from "./emitir";
import { getToken } from "./client";
import { enviarEnvioDte } from "./upload";
import { generarLibroCV, generarLibroGuias, type LineaGuia, type LineaLibroCV } from "./libro";

/** Puente libro IECV ↔ estado de la app: arma líneas, firma, guarda y (opcional) envía al SII. */

const TIPOS_LIBRO_VENTAS = new Set([33, 34, 46, 56, 61]); // sin guías (52) ni boletas (van en su propio resumen)

export type LibroBody = {
  operacion: "VENTA" | "COMPRA" | "GUIAS";
  /** Guías: ajustes del set de certificación por folio (anulada, factura que la facturó). */
  ajustes_guias?: Record<string, { anulado?: 1 | 2; ref?: { tipo: number; folio: number; fecha: string } }>;
  periodo: string;
  tipo_libro?: "MENSUAL" | "ESPECIAL";
  folio_notificacion?: number;
  factor_proporcionalidad?: number;
  /** Compras del set de certificación (o manuales). Si viene vacío se usan los Recibidos del período. */
  lineas?: LineaLibroCV[];
  enviar?: boolean;
};

export function rutaLibro(operacion: string, periodo: string) {
  const { empresa } = getDb();
  const amb = getSiiConfig().ambiente;
  const nombre = operacion === "COMPRA" ? "Compras" : operacion === "GUIAS" ? "Guias" : "Ventas";
  return path.join(process.cwd(), "data", "libros", empresa.rut, amb, `Libro${nombre}_${periodo}.xml`);
}

function lineasVentas(periodo: string): LineaLibroCV[] {
  const amb = getSiiConfig().ambiente;
  return getDb()
    .dtes.filter((d) => d.ambiente === amb && d.fecha_emision.startsWith(periodo) && TIPOS_LIBRO_VENTAS.has(d.tipo_dte) && !/rechaz/i.test(d.estado))
    .sort((a, b) => a.tipo_dte - b.tipo_dte || a.folio - b.folio)
    .map((d) => ({
      tpoDoc: d.tipo_dte,
      nroDoc: d.folio,
      fchDoc: d.fecha_emision,
      rutDoc: d.receptor_rut,
      rznSoc: d.receptor_razon_social,
      mntExe: d.monto_exento ?? 0,
      mntNeto: d.monto_neto ?? 0,
      mntIva: d.monto_iva ?? 0,
      mntTotal: d.monto_total,
    }));
}

function lineasComprasRecibidos(periodo: string): LineaLibroCV[] {
  return getDb()
    .recibidos.filter((r) => r.periodo === periodo)
    .map((r) => ({
      tpoDoc: r.tipo_dte,
      nroDoc: r.folio,
      fchDoc: r.fecha_emision,
      rutDoc: r.emisor_rut,
      rznSoc: r.emisor_razon_social,
      mntNeto: r.monto_neto,
      mntIva: r.monto_iva,
      mntExe: Math.max(0, r.monto_total - r.monto_neto - r.monto_iva),
      mntTotal: r.monto_total,
    }));
}

function lineasGuias(periodo: string, ajustes: LibroBody["ajustes_guias"] = {}): LineaGuia[] {
  const amb = getSiiConfig().ambiente;
  return getDb()
    .dtes.filter((d) => d.ambiente === amb && d.tipo_dte === 52 && d.fecha_emision.startsWith(periodo) && !/rechaz/i.test(d.estado))
    .sort((a, b) => a.folio - b.folio)
    .map((d) => {
      const aj = ajustes[String(d.folio)] ?? {};
      return {
        folio: d.folio,
        tpoOper: d.ind_traslado ?? 1,
        fchDoc: d.fecha_emision,
        rutDoc: d.receptor_rut,
        rznSoc: d.receptor_razon_social,
        mntNeto: d.monto_neto ?? 0,
        mntIva: d.monto_iva ?? 0,
        mntTotal: d.monto_total,
        anulado: aj.anulado === 1 || aj.anulado === 2 ? aj.anulado : undefined,
        ref: aj.ref?.tipo && aj.ref.folio && /^\d{4}-\d{2}-\d{2}$/.test(aj.ref.fecha) ? aj.ref : undefined,
      };
    });
}

function validarLinea(l: LineaLibroCV, i: number) {
  const fila = `Línea ${i + 1}`;
  if (!Number.isInteger(l.tpoDoc) || l.tpoDoc <= 0) throw new Error(`${fila}: tipo de documento inválido.`);
  if (!Number.isInteger(l.nroDoc) || l.nroDoc <= 0) throw new Error(`${fila}: folio inválido.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.fchDoc)) throw new Error(`${fila}: fecha inválida (AAAA-MM-DD).`);
  if (!/^\d{1,8}-[\dkK]$/.test(String(l.rutDoc).replace(/\./g, ""))) throw new Error(`${fila}: RUT inválido.`);
  for (const k of ["mntExe", "mntNeto", "mntIva", "mntTotal"] as const) {
    if (l[k] !== undefined && !Number.isFinite(Number(l[k]))) throw new Error(`${fila}: ${k} no es un número.`);
  }
}

export async function generarYEnviarLibro(body: LibroBody) {
  if (!["VENTA", "COMPRA", "GUIAS"].includes(body.operacion)) throw new Error("Operación inválida.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.periodo || "")) throw new Error("Período inválido (AAAA-MM).");
  const tipoLibro = body.tipo_libro === "ESPECIAL" ? "ESPECIAL" : "MENSUAL";
  if (body.operacion === "GUIAS") return firmarGuardarEnviar(body, tipoLibro, lineasGuias(body.periodo, body.ajustes_guias));
  const lineas: LineaLibroCV[] =
    body.operacion === "VENTA"
      ? lineasVentas(body.periodo)
      : body.lineas?.length
        ? body.lineas.map((l, i) => (validarLinea(l, i), { ...l, rutDoc: String(l.rutDoc).replace(/\./g, "") }))
        : lineasComprasRecibidos(body.periodo);

  return firmarGuardarEnviar(body, tipoLibro, lineas);
}

async function firmarGuardarEnviar(body: LibroBody, tipoLibro: "MENSUAL" | "ESPECIAL", lineas: LineaLibroCV[] | LineaGuia[]) {
  const cfg = getSiiConfig();
  const cert = cargarCertDesdeEnv();
  const comun = {
    periodo: body.periodo,
    tipoLibro,
    folioNotificacion: tipoLibro === "ESPECIAL" ? Number(body.folio_notificacion) || undefined : undefined,
    rutEmisor: cfg.rutEmpresa,
    rutEnvia: cfg.rutCertificado || cert.rutTitular || cfg.rutEmpresa,
    fchResol: cfg.fechaResolucion,
    nroResol: Number(cfg.nroResolucion) || 0,
  };
  const xml =
    body.operacion === "GUIAS"
      ? generarLibroGuias({ ...comun, lineas: lineas as LineaGuia[] }, cert)
      : generarLibroCV({ ...comun, operacion: body.operacion, factorProporcionalidad: body.factor_proporcionalidad, lineas: lineas as LineaLibroCV[] }, cert);

  const archivo = rutaLibro(body.operacion, body.periodo);
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, xml, "latin1");

  let envio: { ok: boolean; track_id: string | null; glosa: string | null } | null = null;
  if (body.enviar) {
    const { token } = await getToken();
    const r = await enviarEnvioDte({ envioXml: xml, token, rutEnvia: cfg.rutCertificado, rutEmpresa: cfg.rutEmpresa });
    envio = { ok: r.ok, track_id: r.trackId, glosa: r.glosa };
  }
  return { documentos: lineas.length, ambiente: cfg.ambiente, archivo: path.basename(archivo), envio };
}
