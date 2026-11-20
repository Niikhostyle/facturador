import type { DteItem, RecibidoItem } from "./types";
import { IVA } from "./iva";

const EXENTOS = new Set([34, 41]);
const NO_VENTA = new Set([52]); // guía de despacho: traslado, no venta

export type LineaLibro = {
  tipo_dte: number;
  tipo_nombre: string;
  folio: number;
  fecha_emision: string;
  receptor_rut: string;
  receptor_razon_social: string;
  exento: number;
  neto: number;
  iva: number;
  total: number;
};

/** YYYY-MM actual en hora de Chile (toISOString es UTC y cambia de mes 3-4 h antes). */
export function periodoActualCl(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" }).format(now);
}

/** Montos del DTE con signo: la nota de crédito (61) resta. */
export function montosDte(d: DteItem) {
  let exento: number, neto: number, iva: number;
  if (d.monto_neto !== undefined) {
    exento = d.monto_exento ?? 0;
    neto = d.monto_neto;
    iva = d.monto_iva ?? 0;
  } else if (EXENTOS.has(d.tipo_dte)) {
    // shortcut: DTE emitidos antes de guardar el desglose; se estima desde el total, exacto solo sin ítems mixtos.
    exento = d.monto_total; neto = 0; iva = 0;
  } else {
    exento = 0; neto = Math.round(d.monto_total / (1 + IVA)); iva = d.monto_total - neto;
  }
  const s = d.tipo_dte === 61 ? -1 : 1;
  return { exento: s * exento, neto: s * neto, iva: s * iva, total: s * d.monto_total };
}

export function libroVentas(dtes: DteItem[], periodo: string) {
  const lineas: LineaLibro[] = dtes
    .filter((d) => d.fecha_emision.startsWith(periodo) && !NO_VENTA.has(d.tipo_dte) && !/rechaz|anul/i.test(d.estado))
    .sort((a, b) => a.fecha_emision.localeCompare(b.fecha_emision) || a.tipo_dte - b.tipo_dte || a.folio - b.folio)
    .map((d) => ({
      tipo_dte: d.tipo_dte,
      tipo_nombre: d.tipo_nombre,
      folio: d.folio,
      fecha_emision: d.fecha_emision,
      receptor_rut: d.receptor_rut,
      receptor_razon_social: d.receptor_razon_social,
      ...montosDte(d),
    }));

  const porTipo = new Map<number, { tipo_dte: number; tipo_nombre: string; cantidad: number; exento: number; neto: number; iva: number; total: number }>();
  for (const l of lineas) {
    const t = porTipo.get(l.tipo_dte) ?? { tipo_dte: l.tipo_dte, tipo_nombre: l.tipo_nombre, cantidad: 0, exento: 0, neto: 0, iva: 0, total: 0 };
    t.cantidad++; t.exento += l.exento; t.neto += l.neto; t.iva += l.iva; t.total += l.total;
    porTipo.set(l.tipo_dte, t);
  }
  const tot = lineas.reduce(
    (a, l) => ({ exento: a.exento + l.exento, neto: a.neto + l.neto, iva: a.iva + l.iva, total: a.total + l.total }),
    { exento: 0, neto: 0, iva: 0, total: 0 },
  );
  return { ...tot, documentos: lineas.length, por_tipo: [...porTipo.values()].sort((a, b) => a.tipo_dte - b.tipo_dte), lineas };
}

/** Compras del periodo: las reclamadas no dan crédito fiscal. */
export function resumenCompras(recibidos: RecibidoItem[], periodo: string) {
  const rows = recibidos.filter((r) => r.periodo === periodo && r.estado !== "reclamada");
  return {
    neto: rows.reduce((a, r) => a + (r.monto_neto || 0), 0),
    iva: rows.reduce((a, r) => a + (r.monto_iva || 0), 0),
    total: rows.reduce((a, r) => a + (r.monto_total || 0), 0),
    documentos: rows.length,
  };
}
