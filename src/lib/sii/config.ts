import fs from "fs";
import path from "path";
import { getSiiSettings } from "../store";
import { descifrarClave } from "./certSecret";

/** Clave ilegible (AUTH_SECRET rotado) = sin clave: la UI lo muestra como faltante. */
function claveCert(enc: string) {
  try {
    return descifrarClave(enc);
  } catch {
    return "";
  }
}

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
  // Config editable desde la UI (BD) con prioridad sobre las variables de entorno.
  let s: ReturnType<typeof getSiiSettings> = {};
  try {
    s = getSiiSettings();
  } catch {
    /* store aún no cargado: se usa solo el entorno */
  }

  const ambiente = (s.ambiente || process.env.SII_AMBIENTE || "certificacion") as SiiAmbiente;
  const host = ambiente === "produccion" ? "https://palena.sii.cl" : "https://maullin.sii.cl";

  const cafBase = resolvePath(process.env.SII_CAF_DIR || "./data/caf");
  return {
    // Por defecto activo: emisión real a maullin/palena. Solo se apaga con enabled=false explícito.
    enabled: s.enabled ?? process.env.SII_ENABLED !== "false",
    ambiente,
    rutEmpresa: (s.rutEmpresa || process.env.SII_RUT_EMPRESA || "").trim(),
    rutCertificado: (s.rutCertificado || process.env.SII_RUT_CERTIFICADO || "").trim(),
    // shortcut: sin certificado propio la empresa cae al del entorno (instalaciones de una sola empresa); quitar el fallback cuando todas suban el suyo.
    certPath: resolvePath(s.certFile || process.env.SII_CERT_PATH || "./data/certs/empresa.p12"),
    certPassword: s.certPasswordEnc ? claveCert(s.certPasswordEnc) : process.env.SII_CERT_PASSWORD || "",
    nroResolucion: s.nroResolucion || process.env.SII_NRO_RESOLUCION || "0",
    fechaResolucion: s.fechaResolucion || process.env.SII_FECHA_RESOLUCION || "",
    /** Carpeta base; los XML viven en cafDir/<ambiente>/. */
    cafDir: cafBase,
    endpoints: {
      seed: `${host}/DTEWS/CrSeed.jws`,
      token: `${host}/DTEWS/GetTokenFromSeed.jws`,
      upload: `${host}/cgi_dte/UPL/DTEUpload`,
      status: `${host}/DTEWS/QueryEstUp.jws`,
    },
  };
}

/** Directorio de CAF del ambiente (maullin=certificacion, palena=produccion). */
export function cafDirAmbiente(ambiente?: SiiAmbiente, cfg = getSiiConfig()): string {
  const amb = ambiente ?? cfg.ambiente;
  return path.join(cfg.cafDir, amb);
}

/** Migra CAF sueltos en data/caf/*.xml → data/caf/certificacion/ (una sola vez). */
export function ensureCafDirs(): void {
  const cfg = getSiiConfig();
  const base = cfg.cafDir;
  const certDir = path.join(base, "certificacion");
  const prodDir = path.join(base, "produccion");
  fs.mkdirSync(certDir, { recursive: true });
  fs.mkdirSync(prodDir, { recursive: true });
  if (!fs.existsSync(base)) return;
  for (const f of fs.readdirSync(base)) {
    if (!f.toLowerCase().endsWith(".xml")) continue;
    const src = path.join(base, f);
    if (!fs.statSync(src).isFile()) continue;
    const dest = path.join(certDir, f);
    if (!fs.existsSync(dest)) fs.renameSync(src, dest);
    else fs.unlinkSync(src);
  }
}

export type SiiRequirement = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  how: string;
};

export function siiReadiness(cfg = getSiiConfig()) {
  ensureCafDirs();
  const certExists = Boolean(cfg.certPath && fs.existsSync(cfg.certPath));
  const dir = cafDirAmbiente(cfg.ambiente, cfg);
  const cafFiles = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xml"))
    : [];

  const requirements: SiiRequirement[] = [
    {
      key: "enabled",
      label: "Envío al SII activo",
      ok: cfg.enabled,
      detail: cfg.enabled
        ? cfg.ambiente === "produccion"
          ? "Activo · palena.sii.cl"
          : "Activo · maullin.sii.cl"
        : "Deshabilitado (no se transmite)",
      how: "SII_ENABLED=true en .env.local o actívalo en /sii",
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
      how: "Ej: 12345678-5",
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
      detail: certExists ? "Cargado" : "No hay certificado cargado",
      how: "Súbelo en Certificado digital",
    },
    {
      key: "cert_pass",
      label: "Clave del certificado",
      ok: Boolean(cfg.certPassword),
      detail: cfg.certPassword ? "Configurada (no se muestra)" : "Falta: vuelve a subir el certificado con su clave",
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
