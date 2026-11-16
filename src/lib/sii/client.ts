import fs from "fs";
import forge from "node-forge";
import { getSiiConfig, siiReadiness } from "./config";

function soapEnvelope(bodyInner: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:dte="http://DefaultNamespace">
  <soapenv:Header/>
  <soapenv:Body>
    ${bodyInner}
  </soapenv:Body>
</soapenv:Envelope>`;
}

function extractTag(xml: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() || null;
}

async function postSoap(url: string, bodyInner: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '""',
    },
    body: soapEnvelope(bodyInner),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SII HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return text;
}

/** Obtiene semilla CrSeed del SII (no requiere certificado). */
export async function getSeed() {
  const cfg = getSiiConfig();
  const xml = await postSoap(cfg.endpoints.seed, "<dte:getSeed/>");
  const seed = extractTag(xml, "SEMILLA") || extractTag(xml, "SII:SEMILLA");
  if (!seed) {
    // a veces viene escapado dentro de getSeedReturn
    const ret = extractTag(xml, "getSeedReturn");
    const unescaped = ret?.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"') || "";
    const seed2 = extractTag(unescaped, "SEMILLA");
    if (!seed2) throw new Error("No se pudo leer SEMILLA del SII");
    return { seed: seed2, raw: xml };
  }
  return { seed, raw: xml };
}

function loadP12(certPath: string, password: string) {
  const der = fs.readFileSync(certPath);
  const asn1 = forge.asn1.fromDer(der.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
    forge.pki.oids.pkcs8ShroudedKeyBag
  ];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
  const key = keyBags?.[0]?.key;
  const cert = certBags?.[0]?.cert;
  if (!key || !cert) throw new Error("No se pudo leer clave/certificado del .p12 (¿clave incorrecta?)");
  return { key, cert };
}

function signSeedXml(seed: string, certPath: string, password: string) {
  const { key, cert } = loadP12(certPath, password);
  const seedXml = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;

  // Firma XMLDSig enveloping simplificada compatible con GetTokenFromSeed
  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="">` +
    `<Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<DigestValue></DigestValue>` +
    `</Reference></SignedInfo>`;

  // Digest del documento a firmar (seedXml)
  const md = forge.md.sha1.create();
  md.update(seedXml, "utf8");
  const digestValue = forge.util.encode64(md.digest().getBytes());

  const signedInfoFilled = signedInfo.replace(
    "<DigestValue></DigestValue>",
    `<DigestValue>${digestValue}</DigestValue>`,
  );

  const md2 = forge.md.sha1.create();
  md2.update(signedInfoFilled, "utf8");
  const signature = forge.util.encode64(key.sign(md2));
  const certB64 = forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());

  return (
    seedXml.replace(
      "</getToken>",
      `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
        signedInfoFilled +
        `<SignatureValue>${signature}</SignatureValue>` +
        `<KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo>` +
        `</Signature></getToken>`,
    )
  );
}

/** Solicita token SII firmando la semilla con el .p12. */
export async function getToken() {
  const cfg = getSiiConfig();
  const ready = siiReadiness(cfg);
  if (!ready.can_request_token) {
    throw new Error(
      "Falta certificado o clave. Completa SII_CERT_PATH, SII_CERT_PASSWORD y SII_RUT_CERTIFICADO.",
    );
  }

  const { seed } = await getSeed();
  const signed = signSeedXml(seed, cfg.certPath, cfg.certPassword);
  // escapar para SOAP
  const escaped = signed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const xml = await postSoap(
    cfg.endpoints.token,
    `<dte:getToken><pszXml>${escaped}</pszXml></dte:getToken>`,
  );

  let token = extractTag(xml, "TOKEN");
  if (!token) {
    const ret = extractTag(xml, "getTokenReturn");
    const unescaped = ret?.replace(/&lt;/g, "<").replace(/&gt;/g, ">") || "";
    token = extractTag(unescaped, "TOKEN");
  }
  if (!token) throw new Error(`SII no devolvió TOKEN. Respuesta: ${xml.slice(0, 400)}`);

  return {
    token,
    seed,
    ambiente: cfg.ambiente,
    endpoints: cfg.endpoints,
    obtained_at: new Date().toISOString(),
  };
}

export async function probeSii() {
  const cfg = getSiiConfig();
  const readiness = siiReadiness(cfg);
  const result: {
    readiness: ReturnType<typeof siiReadiness>;
    seed?: { ok: boolean; value?: string; error?: string };
    token?: { ok: boolean; value?: string; error?: string };
  } = { readiness };

  try {
    const { seed } = await getSeed();
    result.seed = { ok: true, value: seed };
  } catch (e) {
    result.seed = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (readiness.can_request_token && cfg.enabled) {
    try {
      const t = await getToken();
      result.token = { ok: true, value: `${t.token.slice(0, 8)}…` };
    } catch (e) {
      result.token = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  } else if (!cfg.enabled) {
    result.token = {
      ok: false,
      error: "SII_ENABLED=false. Actívalo cuando entregues el .p12 y la clave.",
    };
  } else {
    result.token = {
      ok: false,
      error: "Aún no se puede pedir token: falta certificado/clave/RUT.",
    };
  }

  return result;
}

export function listPendingFromUser() {
  return [
    {
      item: "Certificado digital tributario (.p12 / .pfx)",
      why: "Firma XML y obtiene token SII",
      where: "E-Certchile, e-Sign, Acepta u otro PSC autorizado",
    },
    {
      item: "Contraseña del certificado",
      why: "Abrir el .p12 y firmar la semilla",
      where: "La definiste al emitir el certificado",
    },
    {
      item: "RUT del titular del certificado",
      why: "Identifica al firmante ante el SII",
      where: "Cédula / ficha del certificado",
    },
    {
      item: "CAF XML por tipo de DTE (33, 39, 61…)",
      why: "Autoriza folios y timbre TED",
      where: "Portal SII → Factura electrónica → Folios / CAF (maullin en cert)",
    },
    {
      item: "Confirmación de postulación / resolución",
      why: "Carátula del DTE (nro y fecha resolución)",
      where: "Correo o portal SII de certificación",
    },
  ];
}
