import type { CafParsed } from "./caf";
import type { CertMaterial } from "./cert";
import { construirTed } from "./ted";
import { NS_SIIDTE, cortarB64Firma, formatearParaSii, sangrar } from "./envio";
import { firmarElementoPorId } from "./sign";
import { esc, trunc, timestampSii } from "./xmlutil";
import { rutSii } from "./rut";
import { IVA } from "../iva";

/**
 * Boleta electrónica 39 (afecta) y 41 (exenta) según EnvioBOLETA_v11.xsd.
 * A diferencia de la factura: precios CON IVA incluido, etiquetas de emisor propias
 * (RznSocEmisor/GiroEmisor), IndServicio obligatorio y receptor anónimo 66666666-6.
 */

export const RUT_CONSUMIDOR_FINAL = "66666666-6";

export type ItemBoleta = { nombre: string; cantidad: number; precio: number; exento?: boolean; unidad?: string };

export type BoletaInput = {
  tipoDte: 39 | 41;
  folio: number;
  fechaEmision: string;
  emisor: { rut: string; razonSocial: string; giro: string; direccion: string; comuna: string };
  receptor?: { rut?: string; razonSocial?: string; email?: string };
  items: ItemBoleta[];
  /** Set de certificación: <Referencia> con CodRef "SET" y RazonRef "CASO-n" */
  casoSet?: string;
  caf: CafParsed;
  tstamp?: Date;
};

export type TotalesBoleta = { neto: number; exento: number; iva: number; total: number };

/** Totales desde precios brutos: el neto se despeja del total afecto. */
export function totalesBoleta(items: ItemBoleta[], tipoDte: 39 | 41): TotalesBoleta {
  let afecto = 0;
  let exento = 0;
  for (const it of items) {
    const monto = Math.round(it.cantidad * it.precio);
    if (it.exento || tipoDte === 41) exento += monto;
    else afecto += monto;
  }
  const neto = Math.round(afecto / (1 + IVA));
  return { neto, exento, iva: afecto - neto, total: afecto + exento };
}

const tag = (t: string, v: string | number) => `<${t}>${v}</${t}>`;

export function generarBoletaFirmada(input: BoletaInput, cert: CertMaterial) {
  const t = totalesBoleta(input.items, input.tipoDte);
  const id = `B${input.folio}T${input.tipoDte}`;
  const rutEmisor = rutSii(input.emisor.rut);
  const rutRecep = rutSii(input.receptor?.rut || RUT_CONSUMIDOR_FINAL);
  const razonRecep = input.receptor?.razonSocial?.trim() || "Consumidor final";
  const ted = construirTed({
    caf: input.caf,
    folio: input.folio,
    fechaEmision: input.fechaEmision,
    rutEmisor,
    rutReceptor: rutRecep,
    razonSocialReceptor: razonRecep,
    montoTotal: t.total,
    primerItem: input.items[0]?.nombre ?? "",
    tstamp: input.tstamp,
  });
  const detalle = input.items
    .map((it, i) => {
      const monto = Math.round(it.cantidad * it.precio);
      return (
        `<Detalle>` +
        tag("NroLinDet", i + 1) +
        (it.exento && input.tipoDte === 39 ? tag("IndExe", 1) : "") +
        tag("NmbItem", esc(trunc(it.nombre, 80))) +
        tag("QtyItem", it.cantidad) +
        (it.unidad ? tag("UnmdItem", esc(trunc(it.unidad, 4))) : "") +
        tag("PrcItem", it.precio) +
        tag("MontoItem", monto) +
        `</Detalle>`
      );
    })
    .join("");
  const documento =
    `<Documento ID="${id}">` +
    `<Encabezado>` +
    `<IdDoc>` + tag("TipoDTE", input.tipoDte) + tag("Folio", input.folio) + tag("FchEmis", esc(input.fechaEmision)) +
    // 3 = boletas de venta y servicios
    tag("IndServicio", 3) +
    `</IdDoc>` +
    `<Emisor>` +
    tag("RUTEmisor", esc(rutEmisor)) +
    tag("RznSocEmisor", esc(trunc(input.emisor.razonSocial, 100))) +
    tag("GiroEmisor", esc(trunc(input.emisor.giro, 80))) +
    (input.emisor.direccion ? tag("DirOrigen", esc(trunc(input.emisor.direccion, 60))) : "") +
    (input.emisor.comuna ? tag("CmnaOrigen", esc(trunc(input.emisor.comuna, 20))) : "") +
    `</Emisor>` +
    `<Receptor>` +
    tag("RUTRecep", esc(rutRecep)) +
    tag("RznSocRecep", esc(trunc(razonRecep, 100))) +
    (input.receptor?.email ? tag("CorreoRecep", esc(trunc(input.receptor.email, 80))) : "") +
    `</Receptor>` +
    `<Totales>` +
    (t.neto > 0 ? tag("MntNeto", t.neto) : "") +
    (t.exento > 0 ? tag("MntExe", t.exento) : "") +
    (t.neto > 0 ? tag("IVA", t.iva) : "") +
    tag("MntTotal", t.total) +
    `</Totales>` +
    `</Encabezado>` +
    detalle +
    (input.casoSet ? `<Referencia>${tag("NroLinRef", 1)}${tag("CodRef", "SET")}${tag("RazonRef", esc(trunc(input.casoSet, 90)))}</Referencia>` : "") +
    ted.ted +
    tag("TmstFirma", timestampSii(input.tstamp ?? new Date())) +
    `</Documento>`;
  const xml = sangrar(`<DTE xmlns="${NS_SIIDTE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0">${documento}</DTE>`);
  const firmado = cortarB64Firma(firmarElementoPorId(xml, id, "//*[local-name(.)='DTE']", cert));
  return { id, tipoDte: input.tipoDte, folio: input.folio, xml: firmado, totales: t };
}

export function generarEnvioBoleta(
  boletas: { tipoDte: number; xml: string }[],
  caratula: { rutEmisor: string; rutEnvia: string; fechaResolucion: string; nroResolucion: string | number; tstamp?: Date },
  cert: CertMaterial,
): string {
  if (!boletas.length) throw new Error("No hay boletas para enviar.");
  const porTipo = new Map<number, number>();
  for (const b of boletas) porTipo.set(b.tipoDte, (porTipo.get(b.tipoDte) || 0) + 1);
  const car = sangrar(
    `<Caratula version="1.0">` +
      tag("RutEmisor", esc(rutSii(caratula.rutEmisor))) +
      tag("RutEnvia", esc(rutSii(caratula.rutEnvia))) +
      tag("RutReceptor", "60803000-K") +
      tag("FchResol", esc(caratula.fechaResolucion)) +
      tag("NroResol", esc(String(caratula.nroResolucion))) +
      tag("TmstFirmaEnv", timestampSii(caratula.tstamp ?? new Date())) +
      [...porTipo.entries()].map(([tpo, n]) => `<SubTotDTE>${tag("TpoDTE", tpo)}${tag("NroDTE", n)}</SubTotDTE>`).join("") +
      `</Caratula>`,
  );
  const xml =
    `<?xml version="1.0" encoding="ISO-8859-1"?>\n` +
    `<EnvioBOLETA xmlns="${NS_SIIDTE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="${NS_SIIDTE} EnvioBOLETA_v11.xsd" version="1.0">\n` +
    `<SetDTE ID="SetDoc">\n${car}\n${boletas.map((b) => b.xml).join("\n")}\n</SetDTE>\n</EnvioBOLETA>`;
  return formatearParaSii(firmarElementoPorId(xml, "SetDoc", "//*[local-name(.)='EnvioBOLETA']", cert));
}
