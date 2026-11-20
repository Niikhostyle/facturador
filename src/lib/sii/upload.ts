import { getSiiConfig } from "./config";
import { partesRut } from "./rut";

/**
 * Transmisión del EnvioDTE al SII y consulta de estado.
 *
 * 1) DTEUpload: POST multipart/form-data con el XML + cookie TOKEN.
 *    Respuesta: <RECEPCIONDTE><TRACKID>..</TRACKID><STATUS>0</STATUS>..</RECEPCIONDTE>
 *    STATUS 0 = recibido. El track-id sirve para consultar el estado.
 *
 * 2) getEstUp (QueryEstUp.jws): consulta el estado del envío por track-id.
 *    ESTADO_ENVIO: EPR = procesado, RCT/RFR = rechazado, SOK/REC = en proceso, etc.
 *
 * El SII exige un User-Agent o rechaza la subida. Usamos uno genérico (no incluir
 * datos personales del usuario en la cabecera).
 */

// El DTEUpload del SII exige este patrón de User-Agent o rechaza con un error genérico.
export const USER_AGENT = "Mozilla/4.0 (compatible; PROG 1.0; Facturador DTE)";

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : null;
}

export type UploadResult = {
  ok: boolean;
  status: string | null; // STATUS del SII ("0" = recibido)
  trackId: string | null;
  glosa: string | null;
  raw: string;
};

export function parseUploadResponse(xml: string): UploadResult {
  const status = tag(xml, "STATUS");
  const trackId = tag(xml, "TRACKID");
  return {
    ok: status === "0" && Boolean(trackId),
    status,
    trackId,
    glosa: tag(xml, "DETAIL") || tag(xml, "GLOSA") || tag(xml, "ERROR"),
    raw: xml,
  };
}

/**
 * Sube el EnvioDTE firmado al SII.
 * @param envioXml  XML del EnvioDTE (string; se envía como ISO-8859-1).
 * @param token     token SII vigente (de getToken()).
 * @param rutEnvia  RUT del titular del certificado (quien envía).
 * @param rutEmpresa RUT del emisor (empresa).
 */
export async function enviarEnvioDte(opts: {
  envioXml: string;
  token: string;
  rutEnvia: string;
  rutEmpresa: string;
}): Promise<UploadResult> {
  const cfg = getSiiConfig();
  const sender = partesRut(opts.rutEnvia);
  const company = partesRut(opts.rutEmpresa);

  // El XML declara ISO-8859-1: enviamos los bytes EXACTOS.
  // Ojo: FormData+Blob en Node puede alterar el cuerpo (el SII lo veía distinto
  // al archivo en disco → STATUS 7 "must be terminated"). Multipart manual = curl.
  const bytes = Buffer.from(opts.envioXml, "latin1");
  const filename = `envio_${company.cuerpo}.xml`;
  const body = buildMultipart(
    [
      ["rutSender", sender.cuerpo],
      ["dvSender", sender.dv],
      ["rutCompany", company.cuerpo],
      ["dvCompany", company.dv],
    ],
    { name: "archivo", filename, contentType: "application/xml", data: bytes },
  );

  // El SII devuelve 503 intermitentes: reintentamos los 5xx.
  let text = "";
  let status = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(cfg.endpoints.upload, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        Cookie: `TOKEN=${opts.token}`,
        "Content-Type": `multipart/form-data; boundary=${body.boundary}`,
      },
      body: body.buffer,
    });
    status = res.status;
    text = await res.text();
    if (res.ok) return parseUploadResponse(text);
    if (status < 500) break;
    await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  throw new Error(`DTEUpload HTTP ${status}: ${text.slice(0, 200)}`);
}

/** Arma multipart/form-data binario (bytes del archivo sin recodificar). */
export function buildMultipart(
  fields: [string, string][],
  file: { name: string; filename: string; contentType: string; data: Buffer },
): { boundary: string; buffer: Buffer } {
  const boundary = `----FacturadorBoundary${Date.now().toString(16)}`;
  const chunks: Buffer[] = [];
  const push = (s: string | Buffer) => {
    chunks.push(typeof s === "string" ? Buffer.from(s, "utf8") : s);
  };
  for (const [name, value] of fields) {
    push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  }
  push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n`,
  );
  push(file.data);
  push(`\r\n--${boundary}--\r\n`);
  return { boundary, buffer: Buffer.concat(chunks) };
}

export type EstadoEnvio = {
  estado: string | null; // ESTADO_ENVIO (EPR, RCT, SOK, ...)
  glosa: string | null;
  aceptados: string | null;
  rechazados: string | null;
  raw: string;
};

/** Consulta el estado de un envío por track-id (getEstUp / QueryEstUp.jws). */
export async function consultarEstadoEnvio(opts: {
  trackId: string;
  rutEmpresa: string;
  token: string;
}): Promise<EstadoEnvio> {
  const cfg = getSiiConfig();
  const { cuerpo, dv } = partesRut(opts.rutEmpresa);

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:def="http://DefaultNamespace">` +
    `<soapenv:Header/><soapenv:Body>` +
    `<def:getEstUp>` +
    `<Rut>${cuerpo}</Rut><Dv>${dv}</Dv>` +
    `<TrackId>${opts.trackId}</TrackId>` +
    `<Token>${opts.token}</Token>` +
    `</def:getEstUp>` +
    `</soapenv:Body></soapenv:Envelope>`;

  const res = await fetch(cfg.endpoints.status, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""', "User-Agent": USER_AGENT },
    body,
  });
  let text = await res.text();
  if (!res.ok) throw new Error(`getEstUp HTTP ${res.status}: ${text.slice(0, 300)}`);

  // La respuesta suele venir escapada dentro de getEstUpReturn.
  const ret = tag(text, "getEstUpReturn");
  if (ret) text = ret.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

  return {
    estado: tag(text, "ESTADO_ENVIO") || tag(text, "ESTADO"),
    glosa: tag(text, "GLOSA_ESTADO") || tag(text, "GLOSA") || tag(text, "GLOSA_ERR"),
    aceptados: tag(text, "ACEPTADOS"),
    rechazados: tag(text, "RECHAZADOS"),
    raw: text,
  };
}
