import fs from "fs";
import { loadP12FromPath } from "./cert";
import { getSiiConfig } from "./config";
import { firmarDocumentoEnvolvente } from "./sign";
import type { RecibidoEstado, RecibidoItem } from "../types";

/**
 * RCV (Registro de Compras): los documentos recibidos son siempre de producción
 * (www4.sii.cl). El token debe pedirse a palena, aunque la empresa emita en maullín.
 */

type EstadoContab = "REGISTRO" | "PENDIENTE" | "NO_INCLUIR" | "RECLAMADO";

const TIPOS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta Electrónica",
  46: "Factura de Compra Electrónica",
  52: "Guía de Despacho Electrónica",
  56: "Nota de Débito Electrónica",
  61: "Nota de Crédito Electrónica",
};

function extractTag(xml: string, tag: string) {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() || null;
}

function unescapeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function soapEnvelope(bodyInner: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:dte="http://DefaultNamespace">
  <soapenv:Header/>
  <soapenv:Body>
    ${bodyInner}
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function postSoap(url: string, bodyInner: string) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""', "User-Agent": "Mozilla/5.0" },
        body: soapEnvelope(bodyInner),
      });
      const text = await res.text();
      if (res.ok) return text;
      last = `SII HTTP ${res.status}`;
      if (res.status < 500) throw new Error(`${last}: ${text.slice(0, 200)}`);
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      if (last.startsWith("SII HTTP") && !last.includes("5")) throw e;
    }
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  throw new Error(`${last} (SII no disponible tras reintentos).`);
}

/** Token SII de producción (palena) — obligatorio para consultar el RCV real. */
export async function getTokenProduccion() {
  const cfg = getSiiConfig();
  if (!cfg.certPath || !fs.existsSync(cfg.certPath) || !cfg.certPassword) {
    throw new Error("Falta el certificado digital (.p12) o su clave para consultar el SII.");
  }
  if (!cfg.rutEmpresa || !/^\d{7,8}-[\dkK]$/.test(cfg.rutEmpresa)) {
    throw new Error("Configura el RUT de la empresa (SII_RUT_EMPRESA) para consultar el registro de compras.");
  }

  const host = "https://palena.sii.cl";
  const seedXml = await postSoap(`${host}/DTEWS/CrSeed.jws`, "<dte:getSeed/>");
  const seedRet = extractTag(seedXml, "getSeedReturn");
  const seedInner = seedRet ? unescapeXml(seedRet) : seedXml;
  const seed = extractTag(seedInner, "SEMILLA");
  if (!seed) throw new Error("No se pudo obtener SEMILLA de palena.sii.cl.");

  const cert = loadP12FromPath(cfg.certPath, cfg.certPassword);
  const signed = firmarDocumentoEnvolvente(
    `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`,
    cert,
  );
  const escaped = signed.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tokenXml = await postSoap(
    `${host}/DTEWS/GetTokenFromSeed.jws`,
    `<dte:getToken><pszXml>${escaped}</pszXml></dte:getToken>`,
  );
  const tokenRet = extractTag(tokenXml, "getTokenReturn");
  const tokenInner = tokenRet ? unescapeXml(tokenRet) : tokenXml;
  const token = extractTag(tokenInner, "TOKEN");
  if (!token) {
    const glosa = extractTag(tokenInner, "GLOSA") || extractTag(tokenInner, "ESTADO");
    throw new Error(`SII no devolvió TOKEN de producción${glosa ? ` (${glosa})` : ""}.`);
  }
  return { token, rutEmpresa: cfg.rutEmpresa };
}

function parseCsvLine(line: string): string[] {
  return line.split(";").map((c) => c.trim());
}

function parseFechaCl(s: string): string | null {
  // "03/11/2026" o "03/11/2026 12:07:17"
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d;
}

function mapEstado(estadoContab: EstadoContab, fechaRecepcion: string | null, fechaAcuse: string | null): RecibidoEstado {
  if (estadoContab === "RECLAMADO") return "reclamada";
  if (estadoContab === "PENDIENTE") return "reclamable";
  // REGISTRO / NO_INCLUIR
  if (fechaAcuse) return "aceptada";
  if (fechaRecepcion) {
    // Plazo habitual de reclamo ~8 días corridos desde la recepción.
    if (addDays(fechaRecepcion, 8) < new Date()) return "aceptada";
  }
  return estadoContab === "NO_INCLUIR" ? "aceptada" : "reclamable";
}

function num(s: string) {
  const n = Number(String(s || "0").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export type RcvCompraRaw = {
  estadoContab: EstadoContab;
  tipo_dte: number;
  emisor_rut: string;
  emisor_razon_social: string;
  folio: number;
  fecha_emision: string;
  fecha_recepcion: string | null;
  fecha_acuse: string | null;
  monto_exento: number;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
};

async function detalleCompraExport(token: string, rut: string, dv: string, periodoYm: string, estadoContab: EstadoContab) {
  const ptributario = periodoYm.replace("-", "");
  const body = {
    metaData: {
      namespace: "cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/getDetalleCompraExport",
      conversationId: token,
      transactionId: "0",
      page: null,
    },
    data: {
      rutEmisor: rut,
      dvEmisor: dv,
      ptributario,
      operacion: "COMPRA",
      estadoContab,
      codTipoDoc: "0",
    },
  };
  const res = await fetch(
    "https://www4.sii.cl/consdcvinternetui/services/data/facadeService/getDetalleCompraExport",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json, text/plain, */*",
        Cookie: `TOKEN=${token}`,
        Origin: "https://www4.sii.cl",
        Referer: "https://www4.sii.cl/consdcvinternetui/",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify(body),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SII RCV ${estadoContab} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  let json: { data?: unknown; message?: string };
  try {
    json = JSON.parse(text) as { data?: unknown; message?: string };
  } catch {
    throw new Error(`SII RCV ${estadoContab} respondió HTML/texto no JSON: ${text.slice(0, 200)}`);
  }

  const rows: RcvCompraRaw[] = [];
  const data = json.data;
  if (!Array.isArray(data) || data.length < 2) return rows;

  // Primera fila = encabezado CSV
  for (let i = 1; i < data.length; i++) {
    const line = String(data[i] || "");
    if (!line.trim()) continue;
    const c = parseCsvLine(line);
    // Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse;Monto Exento;Monto Neto;Monto IVA Recuperable;...;Monto Total
    const tipo = Number(c[1] || 0);
    const folio = Number(c[5] || 0);
    const fechaEmision = parseFechaCl(c[6] || "") || `${periodoYm}-01`;
    const fechaRecepcion = parseFechaCl(c[7] || "");
    const fechaAcuse = parseFechaCl(c[8] || "");
    if (!tipo || !folio) continue;
    rows.push({
      estadoContab,
      tipo_dte: tipo,
      emisor_rut: (c[3] || "").toUpperCase(),
      emisor_razon_social: c[4] || "Proveedor",
      folio,
      fecha_emision: fechaEmision,
      fecha_recepcion: fechaRecepcion,
      fecha_acuse: fechaAcuse,
      monto_exento: num(c[9]),
      monto_neto: num(c[10]),
      monto_iva: num(c[11]),
      monto_total: num(c[14]),
    });
  }
  return rows;
}

/** Trae facturas de compra reales del RCV (REGISTRO + PENDIENTE + RECLAMADO). */
export async function traerComprasRcv(periodoYm: string): Promise<Omit<RecibidoItem, "id">[]> {
  if (!/^\d{4}-\d{2}$/.test(periodoYm)) {
    throw new Error("Periodo inválido. Usa formato YYYY-MM.");
  }
  const { token, rutEmpresa } = await getTokenProduccion();
  const [rut, dv] = rutEmpresa.split("-");

  const estados: EstadoContab[] = ["REGISTRO", "PENDIENTE", "RECLAMADO"];
  const all: RcvCompraRaw[] = [];
  for (const estado of estados) {
    const chunk = await detalleCompraExport(token, rut, dv.toUpperCase(), periodoYm, estado);
    all.push(...chunk);
  }

  // Deduplicar por emisor+tipo+folio (prioridad: RECLAMADO > PENDIENTE > REGISTRO)
  const rank: Record<EstadoContab, number> = { RECLAMADO: 3, PENDIENTE: 2, REGISTRO: 1, NO_INCLUIR: 0 };
  const map = new Map<string, RcvCompraRaw>();
  for (const row of all) {
    const key = `${row.emisor_rut}|${row.tipo_dte}|${row.folio}`;
    const prev = map.get(key);
    if (!prev || rank[row.estadoContab] > rank[prev.estadoContab]) map.set(key, row);
  }

  return [...map.values()].map((r) => ({
    tipo_dte: r.tipo_dte,
    tipo_nombre: TIPOS[r.tipo_dte] || `Tipo ${r.tipo_dte}`,
    folio: r.folio,
    fecha_emision: r.fecha_emision,
    emisor_rut: r.emisor_rut,
    emisor_razon_social: r.emisor_razon_social,
    monto_neto: r.monto_neto || r.monto_exento,
    monto_iva: r.monto_iva,
    monto_total: r.monto_total,
    estado: mapEstado(r.estadoContab, r.fecha_recepcion, r.fecha_acuse),
    fecha_recepcion: r.fecha_recepcion,
    periodo: periodoYm,
  }));
}
