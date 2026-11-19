import { SignedXml } from "xml-crypto";
import type { CertMaterial } from "./cert";

/**
 * Firma XML-DSig según exige el SII:
 *   - Canonicalización C14N  (http://www.w3.org/TR/2001/REC-xml-c14n-20010315)
 *   - SignatureMethod  RSA-SHA1
 *   - DigestMethod     SHA1
 *   - Transform        enveloped-signature
 *   - KeyInfo con <KeyValue><RSAKeyValue> + <X509Data><X509Certificate>
 *
 * El SII sigue usando SHA1 y C14N no-exclusiva: NO cambiar a SHA256 ni a exc-c14n.
 */

const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

function nuevoFirmador(cert: CertMaterial): SignedXml {
  const sig = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: RSA_SHA1,
    canonicalizationAlgorithm: C14N,
  });
  // KeyInfo al estilo SII: RSAKeyValue + X509Certificate.
  sig.getKeyInfoContent = () =>
    `<KeyValue><RSAKeyValue>` +
    `<Modulus>${cert.modulusB64}</Modulus>` +
    `<Exponent>${cert.exponentB64}</Exponent>` +
    `</RSAKeyValue></KeyValue>` +
    `<X509Data><X509Certificate>${cert.certDerB64}</X509Certificate></X509Data>`;
  return sig;
}

/**
 * Firma un elemento identificado por su atributo ID y deja la <Signature>
 * como hermana (último hijo del nodo contenedor indicado por containerXPath).
 *
 * @param xml          XML completo que contiene el elemento a firmar.
 * @param elementId    valor del atributo ID del elemento firmado (sin '#').
 * @param containerXPath  dónde colgar la <Signature> (p.ej. el nodo raíz).
 */
export function firmarElementoPorId(
  xml: string,
  elementId: string,
  containerXPath: string,
  cert: CertMaterial,
): string {
  const sig = nuevoFirmador(cert);
  // El SII espera EXACTAMENTE UN <Transform>, y que sea C14N (no enveloped).
  // La <Signature> es hermana del <Documento> (no está dentro), así que el digest
  // es la C14N del elemento referenciado sin necesidad de enveloped-signature.
  // Confirmado contra el ejemplo oficial F60T33-ejemplo.xml del SII.
  sig.addReference({
    xpath: `//*[@ID='${elementId}']`,
    transforms: [C14N],
    digestAlgorithm: SHA1,
  });
  sig.computeSignature(xml, {
    location: { reference: containerXPath, action: "append" },
  });
  return sig.getSignedXml();
}

/**
 * Firma envolvente de todo el documento (Reference URI="" sobre el elemento raíz).
 * La usa el getToken del SII: firma el <getToken> completo con enveloped-signature.
 * KeyInfo con X509Certificate (lo que lee la función getCertificado del SII).
 */
export function firmarDocumentoEnvolvente(xml: string, cert: CertMaterial): string {
  const sig = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: RSA_SHA1,
    canonicalizationAlgorithm: C14N,
  });
  sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${cert.certDerB64}</X509Certificate></X509Data>`;
  sig.addReference({
    xpath: "/*",
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: SHA1,
  });
  sig.computeSignature(xml, { location: { reference: "/*", action: "append" } });
  return sig.getSignedXml();
}

/** Verifica una firma XML-DSig (para pruebas locales de ida y vuelta). */
export function verificarFirma(signedXml: string, cert: CertMaterial): { ok: boolean; error?: string } {
  try {
    const sig = new SignedXml({ publicCert: cert.certPem });
    // Localiza el nodo <Signature>
    const match = signedXml.match(/<Signature[\s\S]*?<\/Signature>/);
    if (!match) return { ok: false, error: "No se encontró <Signature>." };
    sig.loadSignature(match[0]);
    const ok = sig.checkSignature(signedXml);
    return { ok };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
