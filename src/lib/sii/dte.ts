import type { CafParsed } from "./caf";
import { construirTed } from "./ted";
import { esc, trunc, timestampSii } from "./xmlutil";
import { rutSii } from "./rut";

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
  tstamp?: Date;
};

export type Totales = { neto: number; exento: number; iva: number; total: number };

export type DteResult = {
  id: string;
  documento: string;
  totales: Totales;
};

const TASA_IVA = 19;

export function calcularTotales(items: Item[]): Totales {
  let neto = 0;
  let exento = 0;
  for (const it of items) {
    const monto = Math.round(it.cantidad * it.precio);
    if (it.exento) exento += monto;
    else neto += monto;
  }
  const iva = Math.round(neto * (TASA_IVA / 100));
  return { neto, exento, iva, total: neto + iva + exento };
}

function detalleXml(items: Item[]): string {
  return items
    .map((it, i) => {
      const monto = Math.round(it.cantidad * it.precio);
      return (
        `<Detalle>` +
        `<NroLinDet>${i + 1}</NroLinDet>` +
        `<NmbItem>${esc(trunc(it.nombre, 80))}</NmbItem>` +
        (it.descripcion ? `<DscItem>${esc(trunc(it.descripcion, 1000))}</DscItem>` : "") +
        (it.exento ? `<IndExe>1</IndExe>` : "") +
        `<QtyItem>${it.cantidad}</QtyItem>` +
        (it.unidad ? `<UnmdItem>${esc(trunc(it.unidad, 4))}</UnmdItem>` : "") +
        `<PrcItem>${it.precio}</PrcItem>` +
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
  const totales = calcularTotales(input.items);
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
    `<FmaPago>${formaPago}</FmaPago>` +
    cuotasXml(input.cuotas) +
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
