import type { CertMaterial } from "./cert";
import { NS_SIIDTE, formatearParaSii } from "./envio";
import { firmarElementoPorId } from "./sign";
import { esc, trunc, timestampSii } from "./xmlutil";
import { rutSii } from "./rut";
import { TASA_IVA } from "../iva";

/**
 * Libro electrónico de Compras y Ventas (IECV, LibroCV_v10.xsd), firmado.
 * Montos siempre positivos por documento: el SII resta las notas de crédito por su tipo.
 */

export type LineaLibroCV = {
  tpoDoc: number;
  nroDoc: number;
  fchDoc: string; // YYYY-MM-DD
  rutDoc: string; // con DV
  rznSoc: string;
  mntExe?: number;
  mntNeto?: number;
  mntIva?: number;
  mntTotal: number;
  anulado?: boolean;
  /** Compras: IVA no recuperable (código 1-9 del SII) */
  ivaNoRec?: { cod: number; monto: number };
  /** Compras: IVA de uso común */
  ivaUsoComun?: number;
};

export type LibroCVInput = {
  operacion: "VENTA" | "COMPRA";
  periodo: string; // YYYY-MM
  tipoLibro: "MENSUAL" | "ESPECIAL";
  folioNotificacion?: number; // obligatorio en ESPECIAL (certificación: el que indique el SII)
  rutEmisor: string;
  rutEnvia: string;
  fchResol: string;
  nroResol: number;
  /** Compras con IVA de uso común: factor de proporcionalidad (ej. 0.6) */
  factorProporcionalidad?: number;
  lineas: LineaLibroCV[];
  tstamp?: Date;
};

const n = (v: number | undefined) => Math.round(Math.abs(v ?? 0));
const tag = (t: string, v: string | number) => `<${t}>${v}</${t}>`;

function totales(input: LibroCVInput): string {
  const porTipo = new Map<number, LineaLibroCV[]>();
  for (const l of input.lineas) porTipo.set(l.tpoDoc, [...(porTipo.get(l.tpoDoc) ?? []), l]);
  return [...porTipo.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tpo, ls]) => {
      const vivas = ls.filter((l) => !l.anulado);
      const sum = (f: (l: LineaLibroCV) => number | undefined) => vivas.reduce((a, l) => a + n(f(l)), 0);
      const anulados = ls.length - vivas.length;
      const noRec = new Map<number, { op: number; monto: number }>();
      for (const l of vivas) {
        if (!l.ivaNoRec) continue;
        const t = noRec.get(l.ivaNoRec.cod) ?? { op: 0, monto: 0 };
        t.op++;
        t.monto += n(l.ivaNoRec.monto);
        noRec.set(l.ivaNoRec.cod, t);
      }
      const usoComun = vivas.filter((l) => l.ivaUsoComun);
      const totUsoComun = sum((l) => l.ivaUsoComun);
      const fct = input.factorProporcionalidad ?? 0;
      return (
        `<TotalesPeriodo>` +
        tag("TpoDoc", tpo) +
        tag("TotDoc", vivas.length) +
        (anulados ? tag("TotAnulado", anulados) : "") +
        tag("TotMntExe", sum((l) => l.mntExe)) +
        tag("TotMntNeto", sum((l) => l.mntNeto)) +
        tag("TotMntIVA", sum((l) => l.mntIva)) +
        [...noRec.entries()]
          .map(([cod, t]) => `<TotIVANoRec>${tag("CodIVANoRec", cod)}${tag("TotOpIVANoRec", t.op)}${tag("TotMntIVANoRec", t.monto)}</TotIVANoRec>`)
          .join("") +
        (usoComun.length
          ? tag("TotOpIVAUsoComun", usoComun.length) +
            tag("TotIVAUsoComun", totUsoComun) +
            tag("FctProp", fct.toFixed(2)) +
            tag("TotCredIVAUsoComun", Math.round(totUsoComun * fct))
          : "") +
        tag("TotMntTotal", sum((l) => l.mntTotal)) +
        `</TotalesPeriodo>`
      );
    })
    .join("");
}

function detalle(l: LineaLibroCV): string {
  const conIva = n(l.mntNeto) > 0 || n(l.mntIva) > 0;
  return (
    `<Detalle>` +
    tag("TpoDoc", l.tpoDoc) +
    tag("NroDoc", l.nroDoc) +
    (l.anulado ? tag("Anulado", "A") : "") +
    (conIva ? tag("TasaImp", TASA_IVA) : "") +
    tag("FchDoc", esc(l.fchDoc)) +
    tag("RUTDoc", esc(rutSii(l.rutDoc))) +
    tag("RznSoc", esc(trunc(l.rznSoc, 50))) +
    (l.anulado
      ? ""
      : (n(l.mntExe) ? tag("MntExe", n(l.mntExe)) : "") +
        (n(l.mntNeto) ? tag("MntNeto", n(l.mntNeto)) : "") +
        (n(l.mntIva) ? tag("MntIVA", n(l.mntIva)) : "") +
        (l.ivaNoRec ? `<IVANoRec>${tag("CodIVANoRec", l.ivaNoRec.cod)}${tag("MntIVANoRec", n(l.ivaNoRec.monto))}</IVANoRec>` : "") +
        (l.ivaUsoComun ? tag("IVAUsoComun", n(l.ivaUsoComun)) : "") +
        tag("MntTotal", n(l.mntTotal))) +
    `</Detalle>`
  );
}

export function generarLibroCV(input: LibroCVInput, cert: CertMaterial): string {
  if (!/^\d{4}-\d{2}$/.test(input.periodo)) throw new Error("Periodo inválido (YYYY-MM).");
  if (input.tipoLibro === "ESPECIAL" && !input.folioNotificacion) throw new Error("El libro especial requiere folio de notificación.");
  const id = `LIBRO_${input.operacion}_${input.periodo.replace("-", "")}`;
  const caratula =
    `<Caratula>` +
    tag("RutEmisorLibro", esc(rutSii(input.rutEmisor))) +
    tag("RutEnvia", esc(rutSii(input.rutEnvia))) +
    tag("PeriodoTributario", input.periodo) +
    tag("FchResol", esc(input.fchResol)) +
    tag("NroResol", input.nroResol) +
    tag("TipoOperacion", input.operacion) +
    tag("TipoLibro", input.tipoLibro) +
    tag("TipoEnvio", "TOTAL") +
    (input.folioNotificacion ? tag("FolioNotificacion", input.folioNotificacion) : "") +
    `</Caratula>`;
  const xml =
    `<?xml version="1.0" encoding="ISO-8859-1"?>\n` +
    `<LibroCompraVenta xmlns="${NS_SIIDTE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="${NS_SIIDTE} LibroCV_v10.xsd" version="1.0">\n` +
    `<EnvioLibro ID="${id}">` +
    caratula +
    (input.lineas.length ? `<ResumenPeriodo>${totales(input)}</ResumenPeriodo>` : "") +
    input.lineas.map(detalle).join("") +
    tag("TmstFirma", timestampSii(input.tstamp ?? new Date())) +
    `</EnvioLibro>\n</LibroCompraVenta>`;
  return formatearParaSii(firmarElementoPorId(xml, id, "//*[local-name(.)='LibroCompraVenta']", cert));
}

/* ───────────── Libro de Guías de Despacho (LibroGuia_v10.xsd) ───────────── */

export type LineaGuia = {
  folio: number;
  tpoOper: number; // IndTraslado de la guía (1 = venta)
  fchDoc: string;
  rutDoc: string;
  rznSoc: string;
  mntNeto?: number;
  mntIva?: number;
  mntTotal: number;
  /** 1 = folio anulado antes de usarse · 2 = guía anulada después de emitida */
  anulado?: 1 | 2;
  /** Factura que facturó la guía */
  ref?: { tipo: number; folio: number; fecha: string };
};

export type LibroGuiaInput = Omit<LibroCVInput, "operacion" | "lineas" | "factorProporcionalidad"> & { lineas: LineaGuia[] };

export function generarLibroGuias(input: LibroGuiaInput, cert: CertMaterial): string {
  if (!/^\d{4}-\d{2}$/.test(input.periodo)) throw new Error("Periodo inválido (YYYY-MM).");
  if (!input.folioNotificacion && input.tipoLibro === "ESPECIAL") throw new Error("El libro especial requiere folio de notificación.");
  const id = `LIBRO_GUIAS_${input.periodo.replace("-", "")}`;
  const vivas = input.lineas.filter((l) => !l.anulado);
  const ventas = vivas.filter((l) => l.tpoOper === 1);
  const traslados = new Map<number, { cant: number; monto: number }>();
  for (const l of vivas.filter((l) => l.tpoOper !== 1)) {
    const t = traslados.get(l.tpoOper) ?? { cant: 0, monto: 0 };
    t.cant++;
    t.monto += n(l.mntTotal);
    traslados.set(l.tpoOper, t);
  }
  const folAnulados = input.lineas.filter((l) => l.anulado === 1).length;
  const guiasAnuladas = input.lineas.filter((l) => l.anulado === 2).length;
  const resumen =
    `<ResumenPeriodo>` +
    (folAnulados ? tag("TotFolAnulado", folAnulados) : "") +
    (guiasAnuladas ? tag("TotGuiaAnulada", guiasAnuladas) : "") +
    tag("TotGuiaVenta", ventas.length) +
    tag("TotMntGuiaVta", ventas.reduce((a, l) => a + n(l.mntTotal), 0)) +
    [...traslados.entries()]
      .sort(([a], [b]) => a - b)
      .map(([tpo, t]) => `<TotTraslado>${tag("TpoTraslado", tpo)}${tag("CantGuia", t.cant)}${tag("MntGuia", t.monto)}</TotTraslado>`)
      .join("") +
    `</ResumenPeriodo>`;
  const detalle = input.lineas
    .map(
      (l) =>
        `<Detalle>` +
        tag("Folio", l.folio) +
        (l.anulado ? tag("Anulado", l.anulado) : "") +
        tag("TpoOper", l.tpoOper) +
        tag("FchDoc", esc(l.fchDoc)) +
        tag("RUTDoc", esc(rutSii(l.rutDoc))) +
        tag("RznSoc", esc(trunc(l.rznSoc, 50))) +
        (n(l.mntNeto) ? tag("MntNeto", n(l.mntNeto)) + tag("TasaImp", TASA_IVA) + tag("IVA", n(l.mntIva)) : "") +
        tag("MntTotal", n(l.mntTotal)) +
        (l.ref ? tag("TpoDocRef", l.ref.tipo) + tag("FolioDocRef", l.ref.folio) + tag("FchDocRef", esc(l.ref.fecha)) : "") +
        `</Detalle>`,
    )
    .join("");
  const xml =
    `<?xml version="1.0" encoding="ISO-8859-1"?>\n` +
    `<LibroGuia xmlns="${NS_SIIDTE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="${NS_SIIDTE} LibroGuia_v10.xsd" version="1.0">\n` +
    `<EnvioLibro ID="${id}">` +
    `<Caratula>` +
    tag("RutEmisorLibro", esc(rutSii(input.rutEmisor))) +
    tag("RutEnvia", esc(rutSii(input.rutEnvia))) +
    tag("PeriodoTributario", input.periodo) +
    tag("FchResol", esc(input.fchResol)) +
    tag("NroResol", input.nroResol) +
    tag("TipoLibro", input.tipoLibro) +
    tag("TipoEnvio", "TOTAL") +
    tag("FolioNotificacion", input.folioNotificacion ?? 0) +
    `</Caratula>` +
    resumen +
    detalle +
    tag("TmstFirma", timestampSii(input.tstamp ?? new Date())) +
    `</EnvioLibro>\n</LibroGuia>`;
  return formatearParaSii(firmarElementoPorId(xml, id, "//*[local-name(.)='LibroGuia']", cert));
}
