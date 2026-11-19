import forge from "node-forge";
import type { CafParsed } from "./caf";
import { esc, trunc, timestampSii } from "./xmlutil";

/**
 * Timbre Electrónico (TED).
 *
 * El TED contiene <DD> (Datos del Documento) + <FRMT> (firma del DD).
 * La firma es RSA-SHA1 (SHA1withRSA) sobre el <DD> APLANO (sin whitespace entre
 * elementos) codificado en ISO-8859-1, con la llave privada RSASK del CAF.
 * El SII aplana `>\s+<` → `><` antes de verificar: si firmamos el CAF con saltos
 * de línea (como viene del archivo), da TED-2-510.
 *
 * Orden de campos del DD (obligatorio, según formato SII):
 *   RE, TD, F, FE, RR, RSR, MNT, IT1, CAF, TSTED
 */

/** Quita whitespace entre tags (regla SII para firmar/verificar el DD). */
export function aplanarXml(xml: string): string {
  return xml.replace(/>\s+</g, "><");
}

/** Bytes ISO-8859-1 del string (cada char → 1 byte), como exige el SII para el FRMT. */
function bytesLatin1(s: string): string {
  // node-forge md.update(..., "raw") interpreta cada code unit como un byte.
  return Buffer.from(s, "latin1").toString("binary");
}

export type TedInput = {
  caf: CafParsed;
  folio: number;
  fechaEmision: string; // YYYY-MM-DD
  rutEmisor: string; // 12345678-9
  rutReceptor: string; // 12345678-9
  razonSocialReceptor: string; // RSR, máx 40
  montoTotal: number;
  primerItem: string; // IT1, máx 40
  tstamp?: Date;
};

export type TedResult = {
  ted: string; // <TED>...</TED>
  dd: string; // <DD>...</DD> (lo que se firmó, por si se quiere auditar)
  frmt: string; // firma base64
  tsted: string;
};

export function construirTed(input: TedInput): TedResult {
  const tsted = timestampSii(input.tstamp ?? new Date());

  // CAF aplanado (el archivo del SII suele traer saltos de línea). El DD completo
  // debe quedar sin whitespace entre elementos: es lo que se firma y lo que el
  // SII reconstruye al validar.
  const cafFlat = aplanarXml(input.caf.cafXml);
  const dd = aplanarXml(
    `<DD>` +
      `<RE>${esc(input.rutEmisor)}</RE>` +
      `<TD>${input.caf.tipoDte}</TD>` +
      `<F>${input.folio}</F>` +
      `<FE>${esc(input.fechaEmision)}</FE>` +
      `<RR>${esc(input.rutReceptor)}</RR>` +
      `<RSR>${esc(trunc(input.razonSocialReceptor, 40))}</RSR>` +
      `<MNT>${Math.round(input.montoTotal)}</MNT>` +
      `<IT1>${esc(trunc(input.primerItem, 40))}</IT1>` +
      cafFlat +
      `<TSTED>${tsted}</TSTED>` +
      `</DD>`,
  );

  // Firma SHA1withRSA del DD en ISO-8859-1 (no UTF-8).
  const md = forge.md.sha1.create();
  md.update(bytesLatin1(dd), "raw");
  const frmt = forge.util.encode64(input.caf.privateKey.sign(md));

  const ted =
    `<TED version="1.0">` +
    dd +
    `<FRMT algoritmo="SHA1withRSA">${frmt}</FRMT>` +
    `</TED>`;

  return { ted, dd, frmt, tsted };
}

/** Verifica localmente el timbre contra la llave pública del CAF (RSAPUBK). */
export function verificarTed(dd: string, frmt: string, caf: CafParsed): boolean {
  if (!caf.publicKeyPem) return false;
  try {
    const pub = forge.pki.publicKeyFromPem(caf.publicKeyPem);
    const md = forge.md.sha1.create();
    // Misma regla que el SII: aplanar y hashear en Latin-1.
    md.update(bytesLatin1(aplanarXml(dd)), "raw");
    return pub.verify(md.digest().getBytes(), forge.util.decode64(frmt));
  } catch {
    return false;
  }
}
