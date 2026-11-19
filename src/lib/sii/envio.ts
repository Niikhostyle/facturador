import type { CertMaterial } from "./cert";
import type { CafParsed } from "./caf";
import { construirDocumento, type DteInput } from "./dte";
import { firmarElementoPorId } from "./sign";
import { esc, timestampSii } from "./xmlutil";
import { rutSii } from "./rut";

const NS_SIIDTE = "http://www.sii.cl/SiiDte";
/** RUT del SII como receptor del envío (igual en certificación y producción). */
export const RUT_SII = "60803000-K";

/**
 * Genera un DTE individual FIRMADO.
 * El <Documento> se firma dentro de un <DTE> que ya declara el namespace SiiDte,
 * para que el digest C14N sea estable al incrustarlo luego en el EnvioDTE.
 */
/** Inserta saltos de línea entre elementos (el parser del SII los necesita). */
const sangrar = (xml: string) => xml.replace(/></g, ">\n<");

/**
 * Corta el base64 largo en líneas de 64 SOLO en elementos de firma
 * (X509Certificate, SignatureValue, Modulus) — nunca en el Documento ni en el DD,
 * cuyo base64 (CAF) debe quedar intacto para no invalidar las firmas. Estos
 * elementos están en KeyInfo / son el propio valor de firma, fuera de todo
 * SignedInfo, así que cortarlos no rompe ninguna firma. Idempotente.
 */
function cortarB64Firma(xml: string): string {
  return xml.replace(
    /(<(?:X509Certificate|SignatureValue|Modulus)>)([A-Za-z0-9+/=\s]{77,}?)(<\/)/g,
    (_m, open: string, content: string, close: string) => {
      const b = content.replace(/\s+/g, "");
      return open + "\n" + b.replace(/(.{64})/g, "$1\n").replace(/\n+$/, "") + "\n" + close;
    },
  );
}

export function generarDteFirmado(input: DteInput, cert: CertMaterial) {
  const { id, documento, totales } = construirDocumento(input);
  // Formateamos (saltos entre elementos) ANTES de firmar: xml-crypto preserva ese
  // whitespace y la firma del Documento queda calculada sobre el contenido formateado,
  // igual que el ejemplo oficial del SII. El base64 del Documento (CAF) queda inline
  // en su propia línea (<400 chars), no se corta.
  const xml = sangrar(
    `<DTE xmlns="${NS_SIIDTE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0">` +
      documento +
      `</DTE>`,
  );
  const firmado = firmarElementoPorId(xml, id, "//*[local-name(.)='DTE']", cert);
  // Cortamos el base64 de la firma del DTE AHORA (antes de firmar el SetDTE), para
  // que esa firma lo cubra ya cortado.
  return { id, tipoDte: input.tipoDte, folio: input.folio, xml: cortarB64Firma(firmado), totales };
}

export type CaratulaInput = {
  rutEmisor: string;
  rutEnvia: string; // RUT titular del certificado
  fechaResolucion: string; // YYYY-MM-DD
  nroResolucion: string | number;
  tstamp?: Date;
};

/**
 * Arma y firma el <EnvioDTE> (Carátula + SetDTE con uno o más DTE firmados).
 * La firma XML-DSig cubre el SetDTE (ID="SetDoc").
 */
export function generarEnvioDte(
  dtesFirmados: { tipoDte: number; xml: string }[],
  caratula: CaratulaInput,
  cert: CertMaterial,
): string {
  if (dtesFirmados.length === 0) throw new Error("No hay DTE para enviar.");

  // SubTotDTE: cantidad por tipo de documento.
  const porTipo = new Map<number, number>();
  for (const d of dtesFirmados) porTipo.set(d.tipoDte, (porTipo.get(d.tipoDte) || 0) + 1);
  const subtot = [...porTipo.entries()]
    .map(([tpo, n]) => `<SubTotDTE><TpoDTE>${tpo}</TpoDTE><NroDTE>${n}</NroDTE></SubTotDTE>`)
    .join("");

  // Carátula formateada (saltos entre elementos). Los DTE ya vienen formateados.
  const caratulaXml = sangrar(
    `<Caratula version="1.0">` +
      `<RutEmisor>${esc(rutSii(caratula.rutEmisor))}</RutEmisor>` +
      `<RutEnvia>${esc(rutSii(caratula.rutEnvia))}</RutEnvia>` +
      `<RutReceptor>${RUT_SII}</RutReceptor>` +
      `<FchResol>${esc(caratula.fechaResolucion)}</FchResol>` +
      `<NroResol>${esc(String(caratula.nroResolucion))}</NroResol>` +
      `<TmstFirmaEnv>${timestampSii(caratula.tstamp ?? new Date())}</TmstFirmaEnv>` +
      subtot +
      `</Caratula>`,
  );

  const setDte =
    `<SetDTE ID="SetDoc">\n` + caratulaXml + "\n" + dtesFirmados.map((d) => d.xml).join("\n") + "\n</SetDTE>";

  // El SII EXIGE xsi:schemaLocation para validar el schema (si falta: SCH-00001).
  // El <DTE> también declara xmlns:xsi al firmarse (ver generarDteFirmado) para que
  // el <Documento> tenga el mismo conjunto de namespaces en alcance al firmar y validar.
  const envio =
    `<?xml version="1.0" encoding="ISO-8859-1"?>\n` +
    `<EnvioDTE xmlns="${NS_SIIDTE}" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="${NS_SIIDTE} EnvioDTE_v10.xsd" version="1.0">\n` +
    setDte +
    `\n</EnvioDTE>`;

  const firmado = firmarElementoPorId(envio, "SetDoc", "//*[local-name(.)='EnvioDTE']", cert);
  return formatearParaSii(firmado);
}

/**
 * Ajusta el XML al parser (antiguo) del SII de recepción, confirmado contra el
 * ejemplo oficial F60T33-ejemplo.xml:
 *  1) Debe haber whitespace entre la declaración XML y el elemento raíz, o rechaza
 *     con STATUS 7 / SCH-00001 ("Invalid Schema Name").
 *  2) El parser trunca líneas largas (≈>4000 chars) → "EnvioDTE must be terminated".
 *     xml-crypto emite el base64 en una sola línea enorme; lo cortamos en líneas de
 *     64 para que ninguna línea exceda el límite.
 * Ambos cambios caen FUERA de los elementos firmados (el salto tras la declaración,
 * y el corte solo afecta SignatureValue/X509Certificate/Modulus — DigestValue es
 * corto y no se toca), así que las firmas siguen válidas.
 */
function formatearParaSii(xml: string): string {
  // Salto entre la declaración XML y el root (xml-crypto puede reserializarlos pegados).
  let s = xml.replace(/\?>\s*</, "?>\n<");
  // Corta el base64 de la firma del SetDTE (idempotente sobre las del DTE ya cortadas).
  s = cortarB64Firma(s);
  return s;
}

/** Helper de alto nivel: de datos de negocio a EnvioDTE firmado, en un solo paso. */
export function emitirEnvioCompleto(args: {
  dte: DteInput;
  caf: CafParsed;
  cert: CertMaterial;
  caratula: CaratulaInput;
}): { id: string; folio: number; tipoDte: number; dteXml: string; envioXml: string; totales: ReturnType<typeof construirDocumento>["totales"] } {
  const firmado = generarDteFirmado({ ...args.dte, caf: args.caf }, args.cert);
  const envioXml = generarEnvioDte([firmado], args.caratula, args.cert);
  return {
    id: firmado.id,
    folio: firmado.folio,
    tipoDte: firmado.tipoDte,
    dteXml: firmado.xml,
    envioXml,
    totales: firmado.totales,
  };
}
