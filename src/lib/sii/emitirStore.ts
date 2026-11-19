import { cafTipos, getDb, nextFolioMap } from "../store";
import type { DteItem } from "../types";
import { getSiiConfig } from "./config";
import { TIPOS_DTE } from "../seed";
import { emitirFactura, cargarCafActivo } from "./emitir";
import { getToken } from "./client";
import { enviarEnvioDte } from "./upload";
import { calcularDv, rutSii, rutValido } from "./rut";
import type { CuotaPago, FormaPago, Item, Receptor, ReferenciaDte } from "./dte";

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
};

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
  if (!items.some((it) => it.nombre && it.cantidad > 0 && it.precio >= 0 && Math.round(it.cantidad * it.precio) > 0)) {
    throw new Error("Agrega al menos un ítem con monto mayor a 0.");
  }

  const formaPago: FormaPago = body.forma_pago === 2 || body.forma_pago === 3 ? body.forma_pago : 1;
  const cuotas: CuotaPago[] | undefined = body.cuotas
    ?.filter((c) => c.fecha && Number(c.monto) > 0)
    .map((c) => ({ fecha: c.fecha, monto: Number(c.monto), glosa: c.glosa }));
  const referencias: ReferenciaDte[] | undefined = body.referencias
    ?.filter((r) => r.tipo_doc && r.folio)
    .map((r) => ({
      tipoDoc: String(r.tipo_doc),
      folio: String(r.folio),
      fecha: r.fecha,
      razon: r.razon,
      codigoRef: r.codigo_ref,
    }));

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
