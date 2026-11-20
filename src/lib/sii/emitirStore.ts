import { cafTipos, getDb, nextFolioMap } from "../store";
import type { DteItem } from "../types";
import { getSiiConfig } from "./config";
import { TIPOS_DTE } from "../seed";
import { emitirFactura, cargarCafActivo } from "./emitir";
import { getToken } from "./client";
import { enviarEnvioDte } from "./upload";
import { calcularDv, rutSii, rutValido } from "./rut";
import { IND_TRASLADO, type CuotaPago, type FormaPago, type IndTraslado, type Item, type Receptor, type ReferenciaDte } from "./dte";

/**
 * Puente entre el motor SII y el estado de la app (store).
 * Asigna el folio real desde el rango del CAF, emite el DTE firmado, registra el
 * documento y lo transmite a maullin/palena.
 */

export type EmitirBody = {
  tipo_dte?: number;
  receptor: {
    rut: string;
    dv?: string;
    razon_social: string;
    giro?: string;
    direccion?: string;
    comuna?: string;
    ciudad?: string;
    contacto?: string;
    email?: string;
    casilla?: string;
  };
  items: { nombre: string; cantidad: number; precio: number; exento?: boolean; unidad?: string; descripcion?: string }[];
  fecha_emision?: string;
  transmitir?: boolean;
  forma_pago?: FormaPago;
  cuotas?: { fecha: string; monto: number; glosa?: string }[];
  referencias?: {
    tipo_doc: string;
    folio: string;
    fecha?: string;
    razon?: string;
    codigo_ref?: 1 | 2 | 3;
  }[];
  ind_traslado?: number; // guía 52
};

/** Tipos que este motor (EnvioDTE vía DTEUpload) sabe emitir. Boletas 39/41 van por la API de boletas. */
export const TIPOS_EMITIBLES = [33, 34, 52, 56, 61] as const;

function emisorDesdeEmpresa() {
  const { empresa } = getDb();
  return {
    rut: `${empresa.rut}-${empresa.dv}`,
    razonSocial: empresa.razon_social,
    giro: empresa.giro ?? "",
    acteco: empresa.acteco ?? "",
    direccion: empresa.direccion ?? "",
    comuna: empresa.comuna ?? "",
  };
}

/** Folio siguiente dentro del rango del CAF, contador por ambiente SII. */
function siguienteFolio(tipo: number, desde: number, hasta: number, ambiente: "certificacion" | "produccion"): number {
  const nf = nextFolioMap(ambiente);
  const actual = nf[tipo];
  const folio = actual && actual >= desde ? actual : desde;
  if (folio > hasta) {
    throw new Error(
      `Folios agotados para el tipo ${tipo} en ${ambiente} (rango ${desde}-${hasta}). Carga un nuevo CAF.`,
    );
  }
  return folio;
}

export async function emitirDteConSii(body: EmitirBody) {
  const cfg = getSiiConfig();
  const tipo = body.tipo_dte ?? 33;
  if (!(TIPOS_EMITIBLES as readonly number[]).includes(tipo)) {
    throw new Error(
      tipo === 39 || tipo === 41
        ? "Las boletas se emiten con emitirBoletaConSii (API de boletas del SII)."
        : `El tipo de documento ${tipo} aún no se puede emitir.`,
    );
  }
  const indTraslado = tipo === 52 ? (Number(body.ind_traslado) as IndTraslado) : undefined;
  if (tipo === 52 && !(indTraslado && indTraslado in IND_TRASLADO)) {
    throw new Error("Indica el motivo del traslado de la guía de despacho.");
  }

  const rutReceptor = rutSii(
    body.receptor.dv ? `${body.receptor.rut}-${body.receptor.dv}` : body.receptor.rut,
  );
  if (!rutValido(rutReceptor)) {
    const cuerpo = body.receptor.rut.replace(/\D/g, "");
    const esperado = cuerpo ? calcularDv(cuerpo) : "?";
    throw new Error(
      `RUT receptor inválido: ${rutReceptor || "(vacío)"}. ` +
        `El dígito verificador correcto para ${cuerpo || "?"} es ${esperado}.`,
    );
  }
  if (!body.receptor.razon_social?.trim()) {
    throw new Error("Indica la razón social del receptor.");
  }

  const caf = cargarCafActivo(tipo);
  const folio = siguienteFolio(tipo, caf.folioDesde, caf.folioHasta, cfg.ambiente);

  const receptor: Receptor = {
    rut: rutReceptor,
    razonSocial: body.receptor.razon_social.trim(),
    giro: body.receptor.giro,
    direccion: body.receptor.direccion,
    comuna: body.receptor.comuna,
    ciudad: body.receptor.ciudad,
    contacto: body.receptor.contacto || body.receptor.email || body.receptor.casilla,
  };
  const items: Item[] = body.items.map((it) => ({
    nombre: it.nombre,
    cantidad: it.cantidad,
    precio: it.precio,
    exento: it.exento,
    unidad: it.unidad,
    descripcion: it.descripcion,
  }));
  const referencias: ReferenciaDte[] | undefined = body.referencias
    ?.filter((r) => r.tipo_doc && r.folio)
    .map((r) => ({
      tipoDoc: String(r.tipo_doc),
      folio: String(r.folio),
      fecha: r.fecha,
      razon: r.razon,
      codigoRef: r.codigo_ref,
    }));
  const esNota = tipo === 61 || tipo === 56;
  if (esNota && !referencias?.some((r) => r.codigoRef && r.fecha)) {
    throw new Error("La nota de crédito/débito debe referenciar el documento original (tipo, folio, fecha y código: anula, corrige texto o corrige montos).");
  }
  // NC/ND que solo corrige texto (código 2) va sin montos; el resto exige monto.
  const soloTexto = esNota && referencias?.some((r) => r.codigoRef === 2);
  const montoPositivo = items.some((it) => it.nombre && it.cantidad > 0 && it.precio >= 0 && Math.round(it.cantidad * it.precio) > 0);
  // Guías que no son venta pueden ir sin valor.
  const guiaSinValor = tipo === 52 && indTraslado !== 1;
  if (!montoPositivo && !(soloTexto || guiaSinValor)) {
    throw new Error("Agrega al menos un ítem con monto mayor a 0.");
  }
  if (!items.some((it) => it.nombre?.trim())) throw new Error("Agrega al menos un ítem con nombre.");

  const formaPago: FormaPago = body.forma_pago === 2 || body.forma_pago === 3 ? body.forma_pago : 1;
  const cuotas: CuotaPago[] | undefined = body.cuotas
    ?.filter((c) => c.fecha && Number(c.monto) > 0)
    .map((c) => ({ fecha: c.fecha, monto: Number(c.monto), glosa: c.glosa }));

  const emitido = emitirFactura({
    tipoDte: tipo,
    folio,
    fechaEmision: body.fecha_emision,
    emisor: emisorDesdeEmpresa(),
    receptor,
    items,
    formaPago,
    cuotas: formaPago === 2 ? cuotas : undefined,
    referencias,
    indTraslado,
  });

  const transmitir = body.transmitir !== false;
  let estado = "generado";
  let trackId: string | null = null;
  let glosaSii: string | null = null;
  if (transmitir) {
    const { token } = await getToken();
    const envio = await enviarEnvioDte({
      envioXml: emitido.envioXml,
      token,
      rutEnvia: cfg.rutCertificado,
      rutEmpresa: cfg.rutEmpresa,
    });
    trackId = envio.trackId;
    glosaSii = envio.glosa;
    estado = envio.ok ? "enviado" : "rechazado_envio";
  }

  const db = getDb();
  nextFolioMap(cfg.ambiente)[tipo] = folio + 1;
  const cafRow = cafTipos(cfg.ambiente).find((c) => c.tipo_dte === tipo);
  if (cafRow && cafRow.disponibles > 0) cafRow.disponibles -= 1;

  const tipoNombre = TIPOS_DTE.find((t) => t.codigo === tipo)?.nombre ?? `Tipo ${tipo}`;
  const dte: DteItem = {
    id: db.dtes.length ? Math.max(...db.dtes.map((d) => d.id)) + 1 : 1,
    tipo_dte: tipo,
    tipo_nombre: tipoNombre,
    folio,
    fecha_emision: emitido.fechaEmision,
    receptor_rut: receptor.rut,
    receptor_razon_social: receptor.razonSocial,
    monto_total: emitido.totales.total,
    monto_neto: emitido.totales.neto,
    monto_exento: emitido.totales.exento,
    monto_iva: emitido.totales.iva,
    estado,
    ambiente: cfg.ambiente,
    ...(indTraslado ? { ind_traslado: indTraslado } : {}),
  };
  db.dtes.unshift(dte);

  return {
    data: dte,
    totales: emitido.totales,
    sii: { track_id: trackId, estado, glosa: glosaSii },
    xml_path: emitido.rutaXml,
    dte_id: emitido.id,
  };
}

/* ───────────── Boletas 39/41 (API REST de boletas del SII) ───────────── */

export type EmitirBoletaBody = {
  tipo_dte: 39 | 41;
  fecha_emision?: string;
  transmitir?: boolean;
  receptor?: { rut?: string; dv?: string; razon_social?: string; email?: string };
  items: { nombre: string; cantidad: number; precio: number; exento?: boolean; unidad?: string }[];
  caso_set?: string;
};

export async function emitirBoletaConSii(body: EmitirBoletaBody) {
  const { generarBoletaFirmada, generarEnvioBoleta, RUT_CONSUMIDOR_FINAL } = await import("./boleta");
  const { enviarEnvioBoleta } = await import("./boletaApi");
  const { cargarCertDesdeEnv, rutaXmlEmitido } = await import("./emitir");
  const fs = await import("fs");
  const path = await import("path");

  const cfg = getSiiConfig();
  const tipo = body.tipo_dte;
  let rutRecep = RUT_CONSUMIDOR_FINAL;
  if (body.receptor?.rut?.trim()) {
    rutRecep = rutSii(body.receptor.dv ? `${body.receptor.rut}-${body.receptor.dv}` : body.receptor.rut);
    if (!rutValido(rutRecep)) throw new Error(`RUT del cliente inválido: ${rutRecep}.`);
  }
  const items = (body.items || [])
    .filter((it) => it.nombre?.trim())
    .map((it) => ({ nombre: it.nombre.trim(), cantidad: Number(it.cantidad), precio: Math.round(Number(it.precio)), exento: Boolean(it.exento), unidad: it.unidad }));
  if (!items.length || items.some((it) => !(it.cantidad > 0) || !(it.precio >= 0))) throw new Error("Revisa los ítems: cantidad mayor a 0 y precio válido.");
  if (!items.some((it) => Math.round(it.cantidad * it.precio) > 0)) throw new Error("La boleta debe tener un monto mayor a 0.");

  const caf = cargarCafActivo(tipo);
  const folio = siguienteFolio(tipo, caf.folioDesde, caf.folioHasta, cfg.ambiente);
  const cert = cargarCertDesdeEnv();
  const fechaEmision = body.fecha_emision || new Date().toISOString().slice(0, 10);
  const boleta = generarBoletaFirmada(
    {
      tipoDte: tipo,
      folio,
      fechaEmision,
      emisor: emisorDesdeEmpresa(),
      receptor: { rut: rutRecep, razonSocial: body.receptor?.razon_social, email: body.receptor?.email },
      items,
      casoSet: body.caso_set?.trim() || undefined,
      caf,
    },
    cert,
  );
  const envioXml = generarEnvioBoleta(
    [boleta],
    { rutEmisor: cfg.rutEmpresa, rutEnvia: cfg.rutCertificado || cert.rutTitular || cfg.rutEmpresa, fechaResolucion: cfg.fechaResolucion, nroResolucion: cfg.nroResolucion },
    cert,
  );
  const rutaXml = rutaXmlEmitido(cfg.rutEmpresa, cfg.ambiente, tipo, folio);
  fs.mkdirSync(path.dirname(rutaXml), { recursive: true });
  fs.writeFileSync(rutaXml, envioXml, "latin1");

  let estado = "generado";
  let trackId: string | null = null;
  let glosaSii: string | null = null;
  if (body.transmitir !== false) {
    const r = await enviarEnvioBoleta(envioXml);
    trackId = r.trackId;
    glosaSii = r.glosa ?? r.estado;
    estado = r.ok ? "enviado" : "rechazado_envio";
  }

  const db = getDb();
  nextFolioMap(cfg.ambiente)[tipo] = folio + 1;
  const cafRow = cafTipos(cfg.ambiente).find((c) => c.tipo_dte === tipo);
  if (cafRow && cafRow.disponibles > 0) cafRow.disponibles -= 1;
  const dte: DteItem = {
    id: db.dtes.length ? Math.max(...db.dtes.map((d) => d.id)) + 1 : 1,
    tipo_dte: tipo,
    tipo_nombre: TIPOS_DTE.find((t) => t.codigo === tipo)?.nombre ?? `Tipo ${tipo}`,
    folio,
    fecha_emision: fechaEmision,
    receptor_rut: rutRecep,
    receptor_razon_social: body.receptor?.razon_social?.trim() || "Consumidor final",
    monto_total: boleta.totales.total,
    monto_neto: boleta.totales.neto,
    monto_exento: boleta.totales.exento,
    monto_iva: boleta.totales.iva,
    estado,
    ambiente: cfg.ambiente,
    ...(trackId ? { track_id: trackId } : {}),
  };
  db.dtes.unshift(dte);
  return { data: dte, totales: boleta.totales, sii: { track_id: trackId, estado, glosa: glosaSii }, xml_path: rutaXml, dte_id: boleta.id };
}
