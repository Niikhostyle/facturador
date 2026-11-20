import type { CafParsed } from "./caf";
import { construirTed } from "./ted";
import { esc, trunc, timestampSii } from "./xmlutil";
import { rutSii } from "./rut";
import { TASA_IVA, ivaDe } from "../iva";

/**
 * Armado del <Documento> de un DTE (Factura 33 y afines).
 * Deja el documento listo para firmar con XML-DSig (ver sign.ts).
 */

export type Emisor = {
  rut: string;
  razonSocial: string;
  giro: string;
  acteco: string;
  direccion: string;
  comuna: string;
};

export type Receptor = {
  rut: string;
  razonSocial: string;
  giro?: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
  contacto?: string;
};

export type Item = {
  nombre: string;
  cantidad: number;
  precio: number;
  exento?: boolean;
  descripcion?: string;
  unidad?: string;
};

/** 1=contado, 2=crédito, 3=sin costo (catálogo SII). */
export type FormaPago = 1 | 2 | 3;

export type CuotaPago = {
  fecha: string; // YYYY-MM-DD
  monto: number;
  glosa?: string;
};

export type ReferenciaDte = {
  tipoDoc: string; // ej. 33, 61, 801 (OC), SET
  folio: string;
  fecha?: string; // YYYY-MM-DD
  razon?: string;
  codigoRef?: 1 | 2 | 3; // 1 anula, 2 corrige texto, 3 corrige montos
};

/** Documentos sin IVA: todos sus ítems son exentos. */
export const TIPOS_EXENTOS = new Set([34, 41]);

/** Guía de despacho (52): motivo del traslado (catálogo SII IndTraslado). */
export const IND_TRASLADO = {
  1: "Operación constituye venta",
  2: "Ventas por efectuar",
  3: "Consignaciones",
  4: "Entrega gratuita",
  5: "Traslados internos",
  6: "Otros traslados no venta",
  7: "Guía de devolución",
  8: "Traslado para exportación (no venta)",
  9: "Venta para exportación",
} as const;
export type IndTraslado = keyof typeof IND_TRASLADO;

export type DteInput = {
  tipoDte: number;
  folio: number;
  fechaEmision: string; // YYYY-MM-DD
  emisor: Emisor;
  receptor: Receptor;
  items: Item[];
  caf: CafParsed;
  formaPago?: FormaPago;
  cuotas?: CuotaPago[];
  referencias?: ReferenciaDte[];
  indTraslado?: IndTraslado; // obligatorio en guía 52
  tstamp?: Date;
};

export type Totales = { neto: number; exento: number; iva: number; total: number };

export type DteResult = {
  id: string;
  documento: string;
  totales: Totales;
};


export function calcularTotales(items: Item[], tipoDte?: number): Totales {
  let neto = 0;
  let exento = 0;
  const todoExento = tipoDte !== undefined && TIPOS_EXENTOS.has(tipoDte);
  for (const it of items) {
    const monto = Math.round(it.cantidad * it.precio);
    if (it.exento || todoExento) exento += monto;
    else neto += monto;
  }
  const iva = ivaDe(neto);
  return { neto, exento, iva, total: neto + iva + exento };
}

function detalleXml(items: Item[]): string {
  return items
    .map((it, i) => {
      const monto = Math.round(it.cantidad * it.precio);
      // Línea sin precio (NC/ND que solo corrige texto): el SII no acepta PrcItem 0, va solo con MontoItem 0.
      const conPrecio = it.precio > 0;
      return (
        `<Detalle>` +
        `<NroLinDet>${i + 1}</NroLinDet>` +
        // Orden del XSD: IndExe va antes de NmbItem.
        (it.exento ? `<IndExe>1</IndExe>` : "") +
        `<NmbItem>${esc(trunc(it.nombre, 80))}</NmbItem>` +
        (it.descripcion ? `<DscItem>${esc(trunc(it.descripcion, 1000))}</DscItem>` : "") +
        (conPrecio ? `<QtyItem>${it.cantidad}</QtyItem>` : "") +
        (conPrecio && it.unidad ? `<UnmdItem>${esc(trunc(it.unidad, 4))}</UnmdItem>` : "") +
        (conPrecio ? `<PrcItem>${it.precio}</PrcItem>` : "") +
        `<MontoItem>${monto}</MontoItem>` +
        `</Detalle>`
      );
    })
    .join("");
}

function referenciasXml(refs: ReferenciaDte[] | undefined): string {
  if (!refs?.length) return "";
  return refs
    .map((r, i) => {
      return (
        `<Referencia>` +
        `<NroLinRef>${i + 1}</NroLinRef>` +
        `<TpoDocRef>${esc(trunc(r.tipoDoc, 3))}</TpoDocRef>` +
        `<FolioRef>${esc(trunc(r.folio, 18))}</FolioRef>` +
        (r.fecha ? `<FchRef>${esc(r.fecha)}</FchRef>` : "") +
        (r.codigoRef ? `<CodRef>${r.codigoRef}</CodRef>` : "") +
        (r.razon ? `<RazonRef>${esc(trunc(r.razon, 90))}</RazonRef>` : "") +
        `</Referencia>`
      );
    })
    .join("");
}

function cuotasXml(cuotas: CuotaPago[] | undefined): string {
  if (!cuotas?.length) return "";
  return cuotas
    .map((c) => {
      return (
        `<MntPagos>` +
        `<FchPago>${esc(c.fecha)}</FchPago>` +
        `<MntPago>${Math.round(c.monto)}</MntPago>` +
        (c.glosa ? `<GlosaPagos>${esc(trunc(c.glosa, 40))}</GlosaPagos>` : "") +
        `</MntPagos>`
      );
    })
    .join("");
}

export function construirDocumento(input: DteInput): DteResult {
  const items = TIPOS_EXENTOS.has(input.tipoDte) ? input.items.map((it) => ({ ...it, exento: true })) : input.items;
  input = { ...input, items };
  const totales = calcularTotales(items, input.tipoDte);
  const esGuia = input.tipoDte === 52;
  const id = `F${input.folio}T${input.tipoDte}`;
  const rutEmisor = rutSii(input.emisor.rut);
  const rutReceptor = rutSii(input.receptor.rut);
  const formaPago = input.formaPago ?? 1;

  const ted = construirTed({
    caf: input.caf,
    folio: input.folio,
    fechaEmision: input.fechaEmision,
    rutEmisor,
    rutReceptor,
    razonSocialReceptor: input.receptor.razonSocial,
    montoTotal: totales.total,
    primerItem: input.items[0]?.nombre ?? "",
    tstamp: input.tstamp,
  });

  const totalesXml =
    `<Totales>` +
    (totales.neto > 0 ? `<MntNeto>${totales.neto}</MntNeto>` : "") +
    (totales.exento > 0 ? `<MntExe>${totales.exento}</MntExe>` : "") +
    (totales.neto > 0 ? `<TasaIVA>${TASA_IVA}</TasaIVA><IVA>${totales.iva}</IVA>` : "") +
    `<MntTotal>${totales.total}</MntTotal>` +
    `</Totales>`;

  const documento =
    `<Documento ID="${id}">` +
    `<Encabezado>` +
    `<IdDoc>` +
    `<TipoDTE>${input.tipoDte}</TipoDTE>` +
    `<Folio>${input.folio}</Folio>` +
    `<FchEmis>${esc(input.fechaEmision)}</FchEmis>` +
    (esGuia ? `<IndTraslado>${input.indTraslado ?? 1}</IndTraslado>` : "") +
    (esGuia ? "" : `<FmaPago>${formaPago}</FmaPago>` + cuotasXml(input.cuotas)) +
    `</IdDoc>` +
    `<Emisor>` +
    `<RUTEmisor>${esc(rutEmisor)}</RUTEmisor>` +
    `<RznSoc>${esc(trunc(input.emisor.razonSocial, 100))}</RznSoc>` +
    `<GiroEmis>${esc(trunc(input.emisor.giro, 80))}</GiroEmis>` +
    `<Acteco>${esc(input.emisor.acteco)}</Acteco>` +
    `<DirOrigen>${esc(trunc(input.emisor.direccion, 60))}</DirOrigen>` +
    `<CmnaOrigen>${esc(trunc(input.emisor.comuna, 20))}</CmnaOrigen>` +
    `</Emisor>` +
    `<Receptor>` +
    `<RUTRecep>${esc(rutReceptor)}</RUTRecep>` +
    `<RznSocRecep>${esc(trunc(input.receptor.razonSocial, 100))}</RznSocRecep>` +
    (input.receptor.giro ? `<GiroRecep>${esc(trunc(input.receptor.giro, 40))}</GiroRecep>` : "") +
    (input.receptor.contacto ? `<Contacto>${esc(trunc(input.receptor.contacto, 80))}</Contacto>` : "") +
    (input.receptor.direccion ? `<DirRecep>${esc(trunc(input.receptor.direccion, 70))}</DirRecep>` : "") +
    (input.receptor.comuna ? `<CmnaRecep>${esc(trunc(input.receptor.comuna, 20))}</CmnaRecep>` : "") +
    (input.receptor.ciudad ? `<CiudadRecep>${esc(trunc(input.receptor.ciudad, 20))}</CiudadRecep>` : "") +
    `</Receptor>` +
    totalesXml +
    `</Encabezado>` +
    detalleXml(input.items) +
    referenciasXml(input.referencias) +
    ted.ted +
    `<TmstFirma>${timestampSii(input.tstamp ?? new Date())}</TmstFirma>` +
    `</Documento>`;

  return { id, documento, totales };
}
