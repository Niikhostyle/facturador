import fs from "fs";
import path from "path";
import { cafDirAmbiente, ensureCafDirs, getSiiConfig } from "./config";
import { loadP12FromPath, type CertMaterial } from "./cert";
import { parseCaf, folioEnRango, type CafParsed } from "./caf";
import { emitirEnvioCompleto } from "./envio";
import type { Emisor, Receptor, Item, FormaPago, CuotaPago, ReferenciaDte } from "./dte";
import { getToken } from "./client";
import { enviarEnvioDte, consultarEstadoEnvio } from "./upload";

/**
 * Orquestador de alto nivel: toma el certificado de .env.local y un CAF real de
 * data/caf/, arma la Factura 33 firmada + EnvioDTE y guarda el XML en disco.
 *
 * Folios: aquí el folio se recibe explícito y se valida contra el rango del CAF.
 * La asignación/persistencia del "próximo folio" es responsabilidad del store
 * (hay que llevar un contador por CAF para no repetir ni saltar folios).
 */

export function cargarCertDesdeEnv(): CertMaterial {
  const cfg = getSiiConfig();
  return loadP12FromPath(cfg.certPath, cfg.certPassword);
}

/** Busca en data/caf/<ambiente>/ un CAF del tipo pedido que contenga el folio. */
export function cargarCafParaFolio(tipoDte: number, folio: number): CafParsed {
  ensureCafDirs();
  const cfg = getSiiConfig();
  const dir = cafDirAmbiente(cfg.ambiente, cfg);
  if (!fs.existsSync(dir)) throw new Error(`No existe la carpeta de CAF: ${dir}`);
  const archivos = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xml"));
  if (archivos.length === 0) {
    throw new Error(`No hay archivos CAF (.xml) en ${dir} (${cfg.ambiente}).`);
  }

  for (const f of archivos) {
    try {
      const caf = parseCaf(fs.readFileSync(path.join(dir, f), "latin1"));
      if (caf.tipoDte === tipoDte && folioEnRango(caf, folio)) return caf;
    } catch {
      /* ignora CAF ilegibles, prueba el siguiente */
    }
  }
  throw new Error(
    `Ningún CAF de ${cfg.ambiente} cubre el folio ${folio} para el tipo ${tipoDte}. ` +
      `Verifica el rango autorizado en /caf.`,
  );
}

/** Primer CAF del tipo pedido en el ambiente SII activo. */
export function cargarCafActivo(tipoDte: number): CafParsed {
  ensureCafDirs();
  const cfg = getSiiConfig();
  const dir = cafDirAmbiente(cfg.ambiente, cfg);
  if (!fs.existsSync(dir)) throw new Error(`No existe la carpeta de CAF: ${dir}`);
  const archivos = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xml"));
  for (const f of archivos) {
    try {
      const caf = parseCaf(fs.readFileSync(path.join(dir, f), "latin1"));
      if (caf.tipoDte === tipoDte) return caf;
    } catch {
      /* siguiente */
    }
  }
  throw new Error(`No hay CAF para el tipo ${tipoDte} en ${cfg.ambiente} (${dir}).`);
}

export type EmitirInput = {
  tipoDte?: number; // default 33
  folio: number;
  fechaEmision?: string; // default hoy
  emisor: Emisor;
  receptor: Receptor;
  items: Item[];
  formaPago?: FormaPago;
  cuotas?: CuotaPago[];
  referencias?: ReferenciaDte[];
  guardarXml?: boolean; // default true
};

export function emitirFactura(input: EmitirInput) {
  const cfg = getSiiConfig();
  const tipoDte = input.tipoDte ?? 33;
  const fechaEmision = input.fechaEmision ?? new Date().toISOString().slice(0, 10);

  const cert = cargarCertDesdeEnv();
  const caf = cargarCafParaFolio(tipoDte, input.folio);

  const out = emitirEnvioCompleto({
    caf,
    cert,
    dte: {
      tipoDte,
      folio: input.folio,
      fechaEmision,
      emisor: input.emisor,
      receptor: input.receptor,
      items: input.items,
      formaPago: input.formaPago,
      cuotas: input.cuotas,
      referencias: input.referencias,
      caf,
    },
    caratula: {
      rutEmisor: cfg.rutEmpresa || input.emisor.rut,
      rutEnvia: cfg.rutCertificado || cert.rutTitular || input.emisor.rut,
      fechaResolucion: cfg.fechaResolucion,
      nroResolucion: cfg.nroResolucion,
    },
  });

  let rutaXml: string | null = null;
  if (input.guardarXml !== false) {
    const dir = path.join(process.cwd(), "data", "emitidos");
    fs.mkdirSync(dir, { recursive: true });
    rutaXml = path.join(dir, `EnvioDTE_T${tipoDte}_F${input.folio}.xml`);
    fs.writeFileSync(rutaXml, out.envioXml, "latin1");
  }

  return { ...out, ambiente: cfg.ambiente, fechaEmision, rutaXml };
}

/**
 * Emite Y transmite al SII en un solo paso: genera el DTE firmado, obtiene token,
 * sube el EnvioDTE y opcionalmente consulta el estado por track-id.
 *
 * Requiere SII_ENABLED=true y certificado/CAF/resolución configurados.
 */
export async function emitirYEnviar(
  input: EmitirInput,
  opts: { consultarEstado?: boolean } = {},
) {
  const cfg = getSiiConfig();
  const emitido = emitirFactura(input);
  const { token } = await getToken();

  const envio = await enviarEnvioDte({
    envioXml: emitido.envioXml,
    token,
    rutEnvia: cfg.rutCertificado,
    rutEmpresa: cfg.rutEmpresa,
  });

  let estado = null;
  if (opts.consultarEstado && envio.ok && envio.trackId) {
    // El SII tarda en procesar; esta consulta inmediata suele devolver "en proceso".
    estado = await consultarEstadoEnvio({
      trackId: envio.trackId,
      rutEmpresa: cfg.rutEmpresa,
      token,
    });
  }

  return { emitido, envio, estado, trackId: envio.trackId };
}
