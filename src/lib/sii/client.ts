import { getSiiConfig, siiReadiness } from "./config";
import { loadP12FromPath } from "./cert";
import { firmarDocumentoEnvolvente } from "./sign";

function soapEnvelope(bodyInner: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:dte="http://DefaultNamespace">
  <soapenv:Header/>
  <soapenv:Body>
    ${bodyInner}
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Extrae el contenido de un tag, tolerando prefijo de namespace (ns1:, SII:, etc.). */
function extractTag(xml: string, tag: string) {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() || null;
}

function unescapeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postSoap(url: string, bodyInner: string) {
  // El SII (maullin) devuelve 503 intermitentes: reintentamos los errores 5xx.
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""', "User-Agent": "Mozilla/5.0" },
        body: soapEnvelope(bodyInner),
      });
      const text = await res.text();
      if (res.ok) return text;
      last = `SII HTTP ${res.status}`;
      if (res.status < 500) throw new Error(`${last}: ${text.slice(0, 200)}`);
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      if (last.startsWith("SII HTTP") && !last.includes("5")) throw e;
    }
    await sleep(1200 * (attempt + 1));
  }
  throw new Error(`${last} (SII no disponible tras reintentos; es intermitente, vuelve a intentar).`);
}

/** Obtiene semilla CrSeed del SII (no requiere certificado). */
export async function getSeed() {
  const cfg = getSiiConfig();
  const xml = await postSoap(cfg.endpoints.seed, "<dte:getSeed/>");
  // La semilla viene dentro de <...:getSeedReturn> con el XML interno escapado.
  const ret = extractTag(xml, "getSeedReturn");
  const inner = ret ? unescapeXml(ret) : xml;
  const seed = extractTag(inner, "SEMILLA");
  if (!seed) throw new Error(`No se pudo leer SEMILLA del SII. Resp: ${xml.slice(0, 200)}`);
  return { seed, raw: xml };
}

/** Firma la semilla (documento getToken) con XML-DSig envolvente (xml-crypto). */
function signSeedXml(seed: string, certPath: string, password: string) {
  const cert = loadP12FromPath(certPath, password);
  const seedXml = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;
  return firmarDocumentoEnvolvente(seedXml, cert);
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

  const ret = extractTag(xml, "getTokenReturn");
  const inner = ret ? unescapeXml(ret) : xml;
  const token = extractTag(inner, "TOKEN");
  if (!token) {
    const glosa = extractTag(inner, "GLOSA") || extractTag(inner, "ESTADO");
    throw new Error(`SII no devolvió TOKEN${glosa ? " (" + glosa + ")" : ""}. Resp: ${inner.slice(0, 300)}`);
  }

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
      error: "Envío al SII deshabilitado. Actívalo en /sii o con SII_ENABLED=true.",
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
