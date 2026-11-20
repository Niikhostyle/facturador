import type { CertMaterial } from "./cert";
import { NS_SIIDTE, cortarB64Firma, formatearParaSii, sangrar } from "./envio";
import { firmarElementoPorId } from "./sign";
import { esc, trunc, timestampSii } from "./xmlutil";
import { rutSii } from "./rut";

/**
 * Intercambio entre contribuyentes (respuesta a un EnvioDTE recibido):
 *  1) RespuestaDTE / RecepcionEnvio — acuse de recibo técnico del envío.
 *  2) EnvioRecibos — recibo de mercaderías o servicios (Ley 19.983).
 *  3) RespuestaDTE / ResultadoDTE — aceptación o rechazo comercial.
 * Esquemas: RespuestaEnvioDTE_v10.xsd y EnvioRecibos_v10.xsd.
 */

export type DteRecibido = { tipo: number; folio: number; fchEmis: string; rutEmisor: string; rutRecep: string; mntTotal: number };
export type EnvioRecibido = { setId: string; rutEmisor: string; rutReceptor: string; dtes: DteRecibido[] };

const tag = (t: string, v: string | number) => `<${t}>${v}</${t}>`;
const val = (xml: string, t: string) => xml.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1]?.trim() ?? "";

/** Lee la carátula y los DTE de un EnvioDTE recibido (sin validar firmas). */
export function leerEnvioDte(xml: string): EnvioRecibido {
  const setId = xml.match(/<SetDTE[^>]*\bID="([^"]+)"/)?.[1];
  const caratula = xml.match(/<Caratula[\s\S]*?<\/Caratula>/)?.[0];
  if (!setId || !caratula) throw new Error("El archivo no es un EnvioDTE válido (falta SetDTE o Carátula).");
  const dtes = [...xml.matchAll(/<Documento\b[\s\S]*?<\/Documento>/g)].map(([doc]) => ({
    tipo: Number(val(doc, "TipoDTE")),
    folio: Number(val(doc, "Folio")),
    fchEmis: val(doc, "FchEmis"),
    rutEmisor: val(doc, "RUTEmisor"),
    rutRecep: val(doc, "RUTRecep"),
    mntTotal: Number(val(doc, "MntTotal")) || 0,
  }));
  if (!dtes.length || dtes.some((d) => !d.tipo || !d.folio)) throw new Error("El EnvioDTE no trae documentos legibles.");
  return { setId, rutEmisor: val(caratula, "RutEmisor"), rutReceptor: val(caratula, "RutReceptor"), dtes };
}

export type Responde = {
  rutResponde: string; // nuestra empresa (receptor)
  contacto?: { nombre?: string; fono?: string; mail?: string };
  tstamp?: Date;
};

function caratulaRespuesta(env: EnvioRecibido, r: Responde, idRespuesta: number, nroDetalles: number, ts: string) {
  return (
    `<Caratula version="1.0">` +
    tag("RutResponde", esc(rutSii(r.rutResponde))) +
    tag("RutRecibe", esc(rutSii(env.rutEmisor))) +
    tag("IdRespuesta", idRespuesta) +
    tag("NroDetalles", nroDetalles) +
    (r.contacto?.nombre ? tag("NmbContacto", esc(trunc(r.contacto.nombre, 40))) : "") +
    (r.contacto?.fono ? tag("FonoContacto", esc(trunc(r.contacto.fono, 40))) : "") +
    (r.contacto?.mail ? tag("MailContacto", esc(trunc(r.contacto.mail, 80))) : "") +
    tag("TmstFirmaResp", ts) +
    `</Caratula>`
  );
}

function respuestaDte(resultadoInterior: string, id: string, cert: CertMaterial) {
  const xml =
    `<?xml version="1.0" encoding="ISO-8859-1"?>\n` +
    `<RespuestaDTE xmlns="${NS_SIIDTE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="${NS_SIIDTE} RespuestaEnvioDTE_v10.xsd" version="1.0">\n` +
    sangrar(`<Resultado ID="${id}">${resultadoInterior}</Resultado>`) +
    `\n</RespuestaDTE>`;
  return formatearParaSii(firmarElementoPorId(xml, id, "//*[local-name(.)='RespuestaDTE']", cert));
}

/** Estado de cada DTE: 0 OK, 3 el RUT receptor no es nuestra empresa. */
const estadoRecep = (d: DteRecibido, rutNuestro: string) =>
  rutSii(d.rutRecep) === rutSii(rutNuestro) ? { cod: 0, glosa: "DTE Recibido OK" } : { cod: 3, glosa: "Error en RUT Receptor" };

/** 1) Acuse de recibo del envío. */
export function generarRecepcionEnvio(env: EnvioRecibido, r: Responde & { nombreArchivo: string }, cert: CertMaterial) {
  const ts = timestampSii(r.tstamp ?? new Date());
  const okEnvio = rutSii(env.rutReceptor) === rutSii(r.rutResponde);
  const detalle = env.dtes
    .map((d) => {
      const e = estadoRecep(d, r.rutResponde);
      return (
        `<RecepcionDTE>` +
        tag("TipoDTE", d.tipo) + tag("Folio", d.folio) + tag("FchEmis", esc(d.fchEmis)) +
        tag("RUTEmisor", esc(rutSii(d.rutEmisor))) + tag("RUTRecep", esc(rutSii(d.rutRecep))) +
        tag("MntTotal", d.mntTotal) + tag("EstadoRecepDTE", e.cod) + tag("RecepDTEGlosa", e.glosa) +
        `</RecepcionDTE>`
      );
    })
    .join("");
  const recepcion =
    `<RecepcionEnvio>` +
    tag("NmbEnvio", esc(trunc(r.nombreArchivo, 80))) +
    tag("FchRecep", ts) +
    tag("CodEnvio", 1) +
    tag("EnvioDTEID", esc(env.setId)) +
    tag("RutEmisor", esc(rutSii(env.rutEmisor))) +
    tag("RutReceptor", esc(rutSii(env.rutReceptor))) +
    tag("EstadoRecepEnv", okEnvio ? 0 : 3) +
    tag("RecepEnvGlosa", okEnvio ? "Envio Recibido Conforme" : "Rut Receptor No Corresponde") +
    tag("NroDTE", env.dtes.length) +
    detalle +
    `</RecepcionEnvio>`;
  return respuestaDte(caratulaRespuesta(env, r, 1, 1, ts) + recepcion, "ResultadoEnvio", cert);
}

export type Decision = { estado: 0 | 1 | 2; glosa?: string };

/** 3) Aceptación (0), aceptación con reparos (1) o rechazo (2) comercial de cada DTE. */
export function generarResultadoDte(env: EnvioRecibido, r: Responde, decidir: (d: DteRecibido) => Decision, cert: CertMaterial) {
  const ts = timestampSii(r.tstamp ?? new Date());
  const glosas = { 0: "DTE Aceptado OK", 1: "DTE Aceptado con Discrepancias", 2: "DTE Rechazado" } as const;
  const detalle = env.dtes
    .map((d) => {
      const dec = rutSii(d.rutRecep) === rutSii(r.rutResponde) ? decidir(d) : { estado: 2 as const, glosa: "RUT receptor no corresponde" };
      return (
        `<ResultadoDTE>` +
        tag("TipoDTE", d.tipo) + tag("Folio", d.folio) + tag("FchEmis", esc(d.fchEmis)) +
        tag("RUTEmisor", esc(rutSii(d.rutEmisor))) + tag("RUTRecep", esc(rutSii(d.rutRecep))) +
        tag("MntTotal", d.mntTotal) + tag("CodEnvio", 1) +
        tag("EstadoDTE", dec.estado) + tag("EstadoDTEGlosa", esc(trunc(dec.glosa || glosas[dec.estado], 256))) +
        (dec.estado === 2 ? tag("CodRchDsc", -1) : "") +
        `</ResultadoDTE>`
      );
    })
    .join("");
  return respuestaDte(caratulaRespuesta(env, r, 2, env.dtes.length, ts) + detalle, "ResultadoDTE", cert);
}

const DECLARACION =
  "El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4, y la letra c) del Art. 5 de la Ley 19.983, acredita que la entrega de mercaderias o servicio(s) prestado(s) ha(n) sido recibido(s).";

/** 2) Recibo de mercaderías (Ley 19.983) de los DTE aceptados. Cada recibo y el set van firmados. */
export function generarEnvioRecibos(
  env: EnvioRecibido,
  r: Responde & { recinto: string; rutFirma: string },
  cert: CertMaterial,
  aceptar: (d: DteRecibido) => boolean = () => true,
) {
  const ts = timestampSii(r.tstamp ?? new Date());
  const dtes = env.dtes.filter((d) => rutSii(d.rutRecep) === rutSii(r.rutResponde) && aceptar(d));
  if (!dtes.length) throw new Error("No hay documentos aceptados para emitir recibos.");
  // Cada Recibo declara su xmlns: así su digest no cambia al quedar dentro del SetRecibos.
  const recibos = dtes.map((d) => {
    const id = `R_T${d.tipo}F${d.folio}`;
    const xml = sangrar(
      `<Recibo xmlns="${NS_SIIDTE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0">` +
        `<DocumentoRecibo ID="${id}">` +
        tag("TipoDoc", d.tipo) + tag("Folio", d.folio) + tag("FchEmis", esc(d.fchEmis)) +
        tag("RUTEmisor", esc(rutSii(d.rutEmisor))) + tag("RUTRecep", esc(rutSii(d.rutRecep))) +
        tag("MntTotal", d.mntTotal) + tag("Recinto", esc(trunc(r.recinto, 80))) +
        tag("RutFirma", esc(rutSii(r.rutFirma))) + tag("Declaracion", DECLARACION) + tag("TmstFirmaRecibo", ts) +
        `</DocumentoRecibo></Recibo>`,
    );
    return cortarB64Firma(firmarElementoPorId(xml, id, "//*[local-name(.)='Recibo']", cert));
  });
  const caratula = sangrar(
    `<Caratula version="1.0">` +
      tag("RutResponde", esc(rutSii(r.rutResponde))) +
      tag("RutRecibe", esc(rutSii(env.rutEmisor))) +
      (r.contacto?.nombre ? tag("NmbContacto", esc(trunc(r.contacto.nombre, 40))) : "") +
      (r.contacto?.fono ? tag("FonoContacto", esc(trunc(r.contacto.fono, 40))) : "") +
      (r.contacto?.mail ? tag("MailContacto", esc(trunc(r.contacto.mail, 80))) : "") +
      tag("TmstFirmaEnv", ts) +
      `</Caratula>`,
  );
  const xml =
    `<?xml version="1.0" encoding="ISO-8859-1"?>\n` +
    `<EnvioRecibos xmlns="${NS_SIIDTE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="${NS_SIIDTE} EnvioRecibos_v10.xsd" version="1.0">\n` +
    `<SetRecibos ID="SetRecibos">\n${caratula}\n${recibos.join("\n")}\n</SetRecibos>\n</EnvioRecibos>`;
  return formatearParaSii(firmarElementoPorId(xml, "SetRecibos", "//*[local-name(.)='EnvioRecibos']", cert));
}
