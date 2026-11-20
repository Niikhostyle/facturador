import { getSiiConfig } from "./config";
import { signSeedXml } from "./client";
import { buildMultipart, USER_AGENT } from "./upload";
import { partesRut } from "./rut";

/**
 * API REST de boletas del SII (separada del envío de facturas).
 * shortcut: rutas tomadas de la documentación pública del SII (su página OAS estaba caída al escribir esto);
 * confirmar con el primer envío real en certificación y ajustar aquí si el SII responde 404.
 */
const HOSTS = {
  certificacion: { auth: "https://apicert.sii.cl", envio: "https://pangal.sii.cl" },
  produccion: { auth: "https://api.sii.cl", envio: "https://rahue.sii.cl" },
} as const;

const g = globalThis as typeof globalThis & { __boletaToken?: Map<string, { token: string; exp: number }> };
const val = (xml: string, t: string) => xml.match(new RegExp(`<(?:\\w+:)?${t}>([^<]*)</(?:\\w+:)?${t}>`, "i"))?.[1]?.trim() ?? null;

async function fetchReintentos(url: string, init: RequestInit) {
  let last = "";
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { ...init, headers: { "User-Agent": USER_AGENT, ...(init.headers || {}) } });
    const text = await res.text();
    if (res.ok) return text;
    last = `SII boletas HTTP ${res.status}: ${text.slice(0, 200)}`;
    if (res.status < 500) break; // el SII da 5xx intermitentes; los 4xx no se reintentan
    await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
  }
  throw new Error(last);
}

/** Token de la API de boletas (semilla firmada con el certificado). Se reutiliza ~50 minutos. */
export async function getTokenBoleta(): Promise<string> {
  const cfg = getSiiConfig();
  const key = `${cfg.ambiente}:${cfg.rutEmpresa}:${cfg.certPath}`;
  g.__boletaToken ??= new Map();
  const hit = g.__boletaToken.get(key);
  if (hit && hit.exp > Date.now()) return hit.token;
  const h = HOSTS[cfg.ambiente];
  const semillaXml = await fetchReintentos(`${h.auth}/recursos/v1/boleta.electronica.semilla`, { method: "GET", headers: { Accept: "application/xml" } });
  const semilla = val(semillaXml, "SEMILLA");
  if (!semilla) throw new Error(`El SII no entregó semilla de boletas. Resp: ${semillaXml.slice(0, 200)}`);
  const firmado = signSeedXml(semilla, cfg.certPath, cfg.certPassword);
  const tokenXml = await fetchReintentos(`${h.auth}/recursos/v1/boleta.electronica.token`, {
    method: "POST",
    headers: { "Content-Type": "application/xml", Accept: "application/xml" },
    body: firmado,
  });
  const token = val(tokenXml, "TOKEN");
  if (!token) throw new Error(`El SII no entregó token de boletas (${val(tokenXml, "GLOSA") ?? "sin glosa"}).`);
  g.__boletaToken.set(key, { token, exp: Date.now() + 50 * 60_000 });
  return token;
}

export type RespuestaEnvioBoleta = { ok: boolean; trackId: string | null; estado: string | null; glosa: string | null; raw: string };

export async function enviarEnvioBoleta(envioXml: string): Promise<RespuestaEnvioBoleta> {
  const cfg = getSiiConfig();
  const token = await getTokenBoleta();
  const sender = partesRut(cfg.rutCertificado);
  const company = partesRut(cfg.rutEmpresa);
  const body = buildMultipart(
    [
      ["rutSender", sender.cuerpo],
      ["dvSender", sender.dv],
      ["rutCompany", company.cuerpo],
      ["dvCompany", company.dv],
    ],
    { name: "archivo", filename: `boletas_${company.cuerpo}.xml`, contentType: "application/xml", data: Buffer.from(envioXml, "latin1") },
  );
  const text = await fetchReintentos(`${HOSTS[cfg.ambiente].envio}/recursos/v1/boleta.electronica.envio`, {
    method: "POST",
    headers: { Cookie: `TOKEN=${token}`, Accept: "application/json", "Content-Type": `multipart/form-data; boundary=${body.boundary}` },
    body: new Uint8Array(body.buffer),
  });
  return parseRespuestaEnvio(text);
}

/** Respuesta JSON del envío: { trackid, estado: "REC", ... }. */
export function parseRespuestaEnvio(text: string): RespuestaEnvioBoleta {
  try {
    const j = JSON.parse(text) as { trackid?: string | number; estado?: string; glosa?: string };
    const trackId = j.trackid != null ? String(j.trackid) : null;
    return { ok: Boolean(trackId) && j.estado !== "RCH", trackId, estado: j.estado ?? null, glosa: j.glosa ?? null, raw: text };
  } catch {
    return { ok: false, trackId: null, estado: null, glosa: text.slice(0, 200), raw: text };
  }
}

/** Estado de un envío de boletas por track-id. */
export async function consultarEstadoBoleta(trackId: string) {
  const cfg = getSiiConfig();
  const { cuerpo, dv } = partesRut(cfg.rutEmpresa);
  const token = await getTokenBoleta();
  const text = await fetchReintentos(`${HOSTS[cfg.ambiente].auth}/recursos/v1/boleta.electronica.envio/${cuerpo}-${dv}-${encodeURIComponent(trackId)}`, {
    method: "GET",
    headers: { Cookie: `TOKEN=${token}`, Accept: "application/json" },
  });
  const j = JSON.parse(text) as { estado?: string; estadistica?: { tipo: number; aceptados: number; rechazados: number; reparos: number }[] };
  return { estado: j.estado ?? null, estadistica: j.estadistica ?? [], raw: text };
}
