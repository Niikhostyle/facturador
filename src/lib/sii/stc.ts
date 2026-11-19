/**
 * Consulta pública de Situación Tributaria de Terceros (STC) del SII.
 * Endpoint: POST /app/stc/recurso/v1/consulta/getConsultaData/
 *
 * Nota: el front del SII usa reCAPTCHA; si el backend exige token válido
 * (`captchaInvalido: true`) no es posible completar la consulta desde aquí.
 */

import { partesRut, rutValido, rutSii, calcularDv, formatRutPuntos } from "./rut";

const STC_URL = "https://www2.sii.cl/app/stc/recurso/v1/consulta/getConsultaData/";
const STC_UI = "https://www2.sii.cl/stc/noauthz/consulta";

export type GiroStc = {
  codigo: string;
  glosa: string;
  categoria?: string;
  afecto_iva?: boolean;
};

export type ConsultaStcOk = {
  ok: true;
  rut: string;
  rut_formateado: string;
  razon_social: string;
  registrado: boolean;
  inicio_actividades: boolean;
  fecha_inicio_actividades?: string;
  con_tegi: boolean;
  giros: GiroStc[];
  fuente: "sii_stc";
};

export type ConsultaStcErr = {
  ok: false;
  codigo: "rut" | "captcha" | "no_registrado" | "sii" | "red";
  message: string;
  url_sii?: string;
};

export type ConsultaStcResult = ConsultaStcOk | ConsultaStcErr;

type SiiGiro = {
  codigo?: string;
  descripcion?: string;
  categoriaTributaria?: string;
  indicadorAfectoIva?: string;
};

type SiiPayload = {
  captchaInvalido?: boolean;
  registrado?: boolean;
  nombre?: string;
  inicioActividades?: boolean;
  fechaInicioActividades?: string;
  conTegi?: boolean;
  tieneGirosNegocio?: boolean;
  girosNegocio?: SiiGiro[];
};

export async function consultarStc(rutInput: string): Promise<ConsultaStcResult> {
  const { cuerpo, dv } = partesRut(rutInput);
  const fmt = rutSii(`${cuerpo}-${dv}`);
  if (!cuerpo || !dv || !rutValido(fmt)) {
    const esperado = cuerpo ? calcularDv(cuerpo) : "?";
    return {
      ok: false,
      codigo: "rut",
      message: `RUT inválido: ${formatRutPuntos(fmt) || "(vacío)"}. DV esperado: ${esperado}.`,
    };
  }

  let res: Response;
  try {
    res = await fetch(STC_URL, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: "https://www2.sii.cl",
        Referer: STC_UI,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        rut: cuerpo,
        dv: dv.toUpperCase(),
        reAction: "consultaSTC",
        reToken: " ",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return {
      ok: false,
      codigo: "red",
      message:
        e instanceof Error && e.name === "TimeoutError"
          ? "El SII no respondió a tiempo. Intenta de nuevo."
          : "No se pudo conectar con el SII. Revisa la red e intenta de nuevo.",
      url_sii: STC_UI,
    };
  }

  if (res.status === 403 || res.status === 429) {
    return {
      ok: false,
      codigo: "captcha",
      message:
        "El SII bloqueó la consulta automática (reCAPTCHA / rate limit). Ábrela en el sitio del SII y copia razón social y giros.",
      url_sii: STC_UI,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      codigo: "sii",
      message: `El SII respondió con error HTTP ${res.status}.`,
      url_sii: STC_UI,
    };
  }

  let data: SiiPayload;
  try {
    data = (await res.json()) as SiiPayload;
  } catch {
    return {
      ok: false,
      codigo: "sii",
      message: "Respuesta inválida del SII.",
      url_sii: STC_UI,
    };
  }

  if (data.captchaInvalido) {
    return {
      ok: false,
      codigo: "captcha",
      message:
        "El SII exige reCAPTCHA para esta consulta. Ábrela en su sitio y copia razón social y giros.",
      url_sii: STC_UI,
    };
  }

  if (data.registrado === false) {
    return {
      ok: false,
      codigo: "no_registrado",
      message: "El RUT no figura registrado en el SII.",
      url_sii: STC_UI,
    };
  }

  const giros: GiroStc[] = (data.girosNegocio || [])
    .filter((g) => g?.codigo || g?.descripcion)
    .map((g) => ({
      codigo: String(g.codigo || "").trim(),
      glosa: String(g.descripcion || "").trim(),
      categoria: g.categoriaTributaria ? String(g.categoriaTributaria) : undefined,
      afecto_iva: String(g.indicadorAfectoIva || "").toUpperCase() === "S",
    }));

  return {
    ok: true,
    rut: `${cuerpo}-${dv.toUpperCase()}`,
    rut_formateado: formatRutPuntos(fmt),
    razon_social: String(data.nombre || "").trim(),
    registrado: Boolean(data.registrado),
    inicio_actividades: Boolean(data.inicioActividades),
    fecha_inicio_actividades: data.fechaInicioActividades || undefined,
    con_tegi: Boolean(data.conTegi),
    giros,
    fuente: "sii_stc",
  };
}
