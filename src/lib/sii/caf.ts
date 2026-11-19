import forge from "node-forge";
import { rutSii } from "./rut";

/**
 * Parseo de un archivo CAF (Código de Autorización de Folios) entregado por el SII.
 *
 * Estructura del CAF:
 *   <AUTORIZACION>
 *     <CAF version="1.0">
 *       <DA>
 *         <RE>76192083-9</RE>        RUT emisor autorizado
 *         <RS>Razón social</RS>
 *         <TD>33</TD>                tipo de DTE
 *         <RNG><D>1</D><H>100</H></RNG>   rango de folios: Desde / Hasta
 *         <FA>2026-01-01</FA>        fecha de autorización
 *         <RSAPK><M>..</M><E>..</E></RSAPK>
 *         <IDK>300</IDK>
 *       </DA>
 *       <FRMA algoritmo="SHA1withRSA">..firma SII del DA..</FRMA>
 *     </CAF>
 *     <RSASK>-----BEGIN RSA PRIVATE KEY-----..</RSASK>   llave privada para el timbre
 *     <RSAPUBK>-----BEGIN PUBLIC KEY-----..</RSAPUBK>
 *   </AUTORIZACION>
 *
 * El nodo <CAF> se incrusta VERBATIM dentro del <DD> del timbre (TED), por eso lo
 * conservamos tal cual aparece en el archivo (sin re-serializar).
 */

export type CafParsed = {
  tipoDte: number;
  rutEmisor: string; // formato SII: 12345678-9
  razonSocial: string;
  folioDesde: number;
  folioHasta: number;
  fechaAutorizacion: string; // YYYY-MM-DD
  idk: string;
  /** Nodo <CAF ...>...</CAF> exactamente como viene en el archivo. */
  cafXml: string;
  /** Llave privada RSA (RSASK) lista para firmar el DD del timbre. */
  privateKey: forge.pki.rsa.PrivateKey;
  /** Llave pública (RSAPUBK) para verificar localmente el timbre. */
  publicKeyPem: string;
};

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : null;
}

export function parseCaf(xml: string): CafParsed {
  const cafMatch = xml.match(/<CAF\b[^>]*>[\s\S]*?<\/CAF>/i);
  if (!cafMatch) throw new Error("CAF inválido: no se encontró el nodo <CAF>.");
  const cafXml = cafMatch[0];

  const da = cafXml.match(/<DA>[\s\S]*?<\/DA>/i)?.[0] || "";
  const td = tag(da, "TD");
  const re = tag(da, "RE");
  const rng = da.match(/<RNG>[\s\S]*?<\/RNG>/i)?.[0] || "";
  const d = tag(rng, "D");
  const h = tag(rng, "H");
  const fa = tag(da, "FA");

  if (!td || !re || !d || !h || !fa) {
    throw new Error("CAF inválido: faltan campos obligatorios (TD/RE/RNG/FA).");
  }

  const skPem = tag(xml, "RSASK");
  if (!skPem) throw new Error("CAF inválido: falta <RSASK> (llave privada del timbre).");
  const pubPem = tag(xml, "RSAPUBK") || "";

  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    privateKey = forge.pki.privateKeyFromPem(skPem);
  } catch {
    throw new Error("No se pudo leer la llave privada RSASK del CAF.");
  }

  return {
    tipoDte: parseInt(td, 10),
    rutEmisor: rutSii(re),
    razonSocial: tag(da, "RS") || "",
    folioDesde: parseInt(d, 10),
    folioHasta: parseInt(h, 10),
    fechaAutorizacion: fa,
    idk: tag(da, "IDK") || "",
    cafXml,
    privateKey,
    publicKeyPem: pubPem,
  };
}

/** True si el folio está dentro del rango autorizado por este CAF. */
export function folioEnRango(caf: CafParsed, folio: number): boolean {
  return folio >= caf.folioDesde && folio <= caf.folioHasta;
}
