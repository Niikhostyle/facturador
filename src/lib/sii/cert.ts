import fs from "fs";
import forge from "node-forge";

/**
 * Carga de un certificado digital tributario (.p12 / .pfx) y extracción de
 * la llave privada + certificado X509 en formato PEM, listos para xml-crypto.
 */

export type CertMaterial = {
  privateKeyPem: string;
  certPem: string;
  cert: forge.pki.Certificate;
  /** base64 DER del certificado, para el nodo <X509Certificate>. */
  certDerB64: string;
  /** Modulus y Exponent base64 para el <RSAKeyValue>. */
  modulusB64: string;
  exponentB64: string;
  /** RUT del titular (del subject serialNumber), si viene en el certificado. */
  rutTitular: string | null;
};

function b64FromBigInt(n: { toString(radix: number): string }): string {
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return forge.util.encode64(forge.util.hexToBytes(hex));
}

export function loadP12(buffer: Buffer | Uint8Array, password: string): CertMaterial {
  const der = forge.util.createBuffer(Buffer.from(buffer).toString("binary"));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ||
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ||
    [];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];

  const key = keyBags[0]?.key as forge.pki.rsa.PrivateKey | undefined;
  const cert = certBags[0]?.cert;
  if (!key || !cert) {
    throw new Error("No se pudo leer la llave/certificado del .p12 (¿contraseña incorrecta?).");
  }

  const pub = cert.publicKey as forge.pki.rsa.PublicKey;
  const rutAttr = cert.subject.getField({ name: "serialNumber" });

  return {
    privateKeyPem: forge.pki.privateKeyToPem(key),
    certPem: forge.pki.certificateToPem(cert),
    cert,
    certDerB64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()),
    modulusB64: b64FromBigInt(pub.n),
    exponentB64: b64FromBigInt(pub.e),
    rutTitular: rutAttr?.value ? String(rutAttr.value) : null,
  };
}

export function loadP12FromPath(certPath: string, password: string): CertMaterial {
  if (!certPath || !fs.existsSync(certPath)) {
    throw new Error(`No existe el certificado en: ${certPath}`);
  }
  return loadP12(fs.readFileSync(certPath), password);
}
