import fs from "fs";
import path from "path";

export type SiiAmbiente = "certificacion" | "produccion";

export type SiiConfig = {
  enabled: boolean;
  ambiente: SiiAmbiente;
  rutEmpresa: string;
  rutCertificado: string;
  certPath: string;
  certPassword: string;
  nroResolucion: string;
  fechaResolucion: string;
  cafDir: string;
  endpoints: {
    seed: string;
    token: string;
    upload: string;
    status: string;
  };
};

function resolvePath(p: string) {
  if (!p) return "";
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

export function getSiiConfig(): SiiConfig {
  const ambiente = (process.env.SII_AMBIENTE || "certificacion") as SiiAmbiente;
  const host = ambiente === "produccion" ? "https://palena.sii.cl" : "https://maullin.sii.cl";

  return {
    enabled: process.env.SII_ENABLED === "true",
    ambiente,
    rutEmpresa: (process.env.SII_RUT_EMPRESA || "").trim(),
    rutCertificado: (process.env.SII_RUT_CERTIFICADO || "").trim(),
    certPath: resolvePath(process.env.SII_CERT_PATH || "./data/certs/empresa.p12"),
    certPassword: process.env.SII_CERT_PASSWORD || "",
    nroResolucion: process.env.SII_NRO_RESOLUCION || "0",
    fechaResolucion: process.env.SII_FECHA_RESOLUCION || "",
    cafDir: resolvePath(process.env.SII_CAF_DIR || "./data/caf"),
    endpoints: {
      seed: `${host}/DTEWS/CrSeed.jws`,
      token: `${host}/DTEWS/GetTokenFromSeed.jws`,
      upload: `${host}/cgi_dte/UPL/DTEUpload`,
      status: `${host}/DTEWS/QueryEstUp.jws`,
    },
  };
}

export type SiiRequirement = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  how: string;
};

export function siiReadiness(cfg = getSiiConfig()) {
  const certExists = Boolean(cfg.certPath && fs.existsSync(cfg.certPath));
  const cafFiles = fs.existsSync(cfg.cafDir)
    ? fs.readdirSync(cfg.cafDir).filter((f) => f.toLowerCase().endsWith(".xml"))
    : [];

  const requirements: SiiRequirement[] = [
    {
      key: "enabled",
      label: "SII_ENABLED=true",
      ok: cfg.enabled,
      detail: cfg.enabled ? "Modo SII activo" : "Aún en simulación local",
      how: "Pon SII_ENABLED=true en .env.local cuando entregues el certificado",
    },
    {
      key: "ambiente",
      label: "Ambiente SII",
      ok: cfg.ambiente === "certificacion" || cfg.ambiente === "produccion",
      detail: cfg.ambiente === "produccion" ? "palena.sii.cl" : "maullin.sii.cl (certificación)",
      how: "SII_AMBIENTE=certificacion | produccion",
    },
    {
      key: "rut_empresa",
      label: "RUT empresa emisora",
      ok: /^\d{7,8}-[\dkK]$/.test(cfg.rutEmpresa),
      detail: cfg.rutEmpresa || "Falta SII_RUT_EMPRESA",
      how: "Ej: 78533567-8",
    },
    {
      key: "rut_cert",
      label: "RUT titular certificado",
      ok: /^\d{7,8}-[\dkK]$/.test(cfg.rutCertificado),
      detail: cfg.rutCertificado || "Falta SII_RUT_CERTIFICADO",
      how: "RUT de la persona/empresa dueña del .p12",
    },
    {
      key: "cert_file",
      label: "Archivo certificado .p12/.pfx",
      ok: certExists,
      detail: certExists ? cfg.certPath : `No existe: ${cfg.certPath}`,
      how: "Copia el .p12 a data/certs/empresa.p12 o ajusta SII_CERT_PATH",
    },
    {
      key: "cert_pass",
      label: "Clave del certificado",
      ok: Boolean(cfg.certPassword),
      detail: cfg.certPassword ? "Configurada (no se muestra)" : "Falta SII_CERT_PASSWORD",
      how: "La contraseña que definiste al emitir el certificado",
    },
    {
      key: "resolucion",
      label: "Resolución SII",
      ok: Boolean(cfg.nroResolucion && cfg.fechaResolucion),
      detail:
        cfg.nroResolucion && cfg.fechaResolucion
          ? `N° ${cfg.nroResolucion} · ${cfg.fechaResolucion}`
          : "Falta SII_NRO_RESOLUCION / SII_FECHA_RESOLUCION",
      how: "En certificación suele ser 0 y la fecha de postulación",
    },
    {
      key: "caf",
      label: "CAF XML cargados",
      ok: cafFiles.length > 0,
      detail: cafFiles.length ? `${cafFiles.length} archivo(s) en data/caf` : "Sin CAF en data/caf",
      how: "Descarga CAF desde el SII (folios) y súbelos o cópialos a data/caf/",
    },
  ];

  const missing = requirements.filter((r) => !r.ok);
  const ready = missing.length === 0;

  return {
    ready,
    missing_count: missing.length,
    requirements,
    endpoints: cfg.endpoints,
    ambiente: cfg.ambiente,
    enabled: cfg.enabled,
    can_request_token: certExists && Boolean(cfg.certPassword) && Boolean(cfg.rutCertificado),
  };
}
