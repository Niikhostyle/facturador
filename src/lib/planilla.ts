/**
 * Lectura y validación de la planilla de carga masiva (CSV).
 * Módulo puro: sin DOM ni fetch, para que sea testeable y la página solo pinte.
 *
 * Las reglas siguen literalmente public/plantilla-documentos.csv: si cambias una,
 * cambia la otra.
 */
import { calcularDv, rutSii, rutValido } from "./sii/rut";
import { ivaDe } from "./iva";

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_DOCS = 1000;

/** Tipos que el motor de emisión arma hoy. Boletas (39/41) y guías (52) usan otro sobre/servicio del SII. */
export const TIPOS_PLANILLA: Record<number, string> = {
  33: "Factura",
  34: "Factura exenta",
  56: "Nota de débito",
  61: "Nota de crédito",
};
const TIPOS_NO_SOPORTADOS: Record<number, string> = {
  39: "boleta",
  41: "boleta exenta",
  52: "guía de despacho",
};

export const COLUMNAS_OBLIGATORIAS = ["id_documento", "tipo_dte", "rut_receptor", "razon_social_receptor", "item_nombre", "item_precio"];

/** Nombre humano de cada columna, para los mensajes de error. */
const NOMBRE_COLUMNA: Record<string, string> = {
  id_documento: "ID del documento",
  tipo_dte: "tipo de documento",
  fecha_emision: "fecha de emisión",
  rut_receptor: "RUT del cliente",
  razon_social_receptor: "razón social",
  giro_receptor: "giro",
  direccion_receptor: "dirección",
  comuna_receptor: "comuna",
  ciudad_receptor: "ciudad",
  email_receptor: "correo",
  forma_pago: "forma de pago",
  fecha_vencimiento: "fecha de vencimiento",
  item_nombre: "ítem",
  item_cantidad: "cantidad",
  item_unidad: "unidad",
  item_precio: "precio",
  item_exento: "exento",
  referencia_tipo: "tipo del documento referenciado",
  referencia_folio: "folio referenciado",
  referencia_fecha: "fecha del documento referenciado",
  referencia_codigo: "código de referencia",
  referencia_razon: "motivo de la referencia",
  monto_total: "monto total",
};

export type Issue = {
  fila: number;
  documento?: string;
  columna?: string;
  valor?: string;
  mensaje: string;
};

export type DocItem = { nombre: string; cantidad: number; precio: number; exento: boolean; unidad?: string };

export type Totales = { neto: number; exento: number; iva: number; total: number };

export type DocPlanilla = {
  id: string;
  tipo_dte: number;
  fecha_emision?: string;
  receptor: {
    rut: string;
    dv: string;
    razon_social: string;
    giro?: string;
    direccion?: string;
    comuna?: string;
    ciudad?: string;
    email?: string;
  };
  forma_pago?: 1 | 2 | 3;
  fecha_vencimiento?: string;
  referencias?: { tipo_doc: string; folio: string; fecha?: string; razon?: string; codigo_ref?: 1 | 2 | 3 }[];
  items: DocItem[];
  totales: Totales;
  filas: number[];
  /** Huella del contenido: detecta si el mismo documento ya se emitió en otra carga. */
  huella: string;
};

export type Revision = {
  archivo: string;
  bytes: number;
  filasDatos: number;
  documentos: DocPlanilla[];
  validos: DocPlanilla[];
  errores: Issue[];
  /** Errores que impiden leer el archivo entero (columnas, tamaño). */
  bloqueante: boolean;
};

function etiqueta(col: string) {
  return NOMBRE_COLUMNA[col] ?? col;
}

function splitCsvLine(line: string, sep: string) {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
      continue;
    }
    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

type Fila = { fila: number; cells: Record<string, string> };

export function leerCsv(text: string): { headers: string[]; filas: Fila[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.trim() && !l.trim().startsWith("#"));
  if (headerIdx < 0) return { headers: [], filas: [] };
  const headerLine = lines[headerIdx];
  const sep = headerLine.includes(";") ? ";" : ",";
  const headers = splitCsvLine(headerLine, sep).map((h) => h.toLowerCase());
  const filas: Fila[] = [];
  for (let idx = headerIdx + 1; idx < lines.length; idx++) {
    const raw = lines[idx].trim();
    // Las filas con # son ejemplos y ayuda: no se leen (así lo dice la plantilla).
    if (!raw || raw.startsWith("#")) continue;
    const parts = splitCsvLine(lines[idx], sep);
    if (parts.every((p) => !p)) continue;
    const cells: Record<string, string> = {};
    headers.forEach((h, i) => {
      cells[h] = (parts[i] ?? "").trim();
    });
    filas.push({ fila: idx + 1, cells });
  }
  return { headers, filas };
}

function numero(v: string): number {
  const s = v.replace(/\s/g, "").replace(/\$/g, "");
  if (!s) return NaN;
  // 1.234.567 o 1.234,5 (formato chileno) → 1234567 / 1234.5
  const normal = /,\d{1,}$/.test(s) || /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".");
  return Number(normal);
}

function fechaValida(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function calcularTotales(items: DocItem[]): Totales {
  let neto = 0;
  let exento = 0;
  for (const it of items) {
    const monto = Math.round(it.cantidad * it.precio);
    if (it.exento) exento += monto;
    else neto += monto;
  }
  const iva = ivaDe(neto);
  return { neto, exento, iva, total: neto + iva + exento };
}

const SI = ["si", "sí", "s", "1", "true", "x"];

export function revisarPlanilla(archivo: string, bytes: number, text: string): Revision {
  const errores: Issue[] = [];
  const base = { archivo, bytes, filasDatos: 0, documentos: [], validos: [] };

  if (bytes > MAX_BYTES) {
    return { ...base, bloqueante: true, errores: [{ fila: 0, mensaje: "El archivo pesa más de 10 MB. Divídelo en dos planillas." }] };
  }

  const { headers, filas } = leerCsv(text);
  if (!headers.length) {
    return { ...base, bloqueante: true, errores: [{ fila: 0, mensaje: "El archivo está vacío. Parte desde la plantilla." }] };
  }
  const faltan = COLUMNAS_OBLIGATORIAS.filter((c) => !headers.includes(c));
  if (faltan.length) {
    return {
      ...base,
      filasDatos: filas.length,
      bloqueante: true,
      errores: faltan.map((c) => ({
        fila: 1,
        columna: c,
        mensaje: `Falta la columna «${c}» en la primera fila. Copia los encabezados de la plantilla sin cambiarles el nombre.`,
      })),
    };
  }
  for (const col of ["item_descuento_pct", "direccion_destino", "comuna_destino", "indicador_traslado"]) {
    if (headers.includes(col) && filas.some((f) => f.cells[col])) {
      const f = filas.find((x) => x.cells[col])!;
      errores.push({
        fila: f.fila,
        documento: f.cells.id_documento,
        columna: col,
        valor: f.cells[col],
        mensaje:
          col === "item_descuento_pct"
            ? "Los descuentos por línea todavía no se emiten por planilla. Escribe el precio ya descontado y deja esta columna vacía."
            : "Las guías de despacho todavía no se emiten por planilla. Deja vacías las columnas de destino y traslado.",
      });
    }
  }

  // Agrupar filas por documento. La cabecera se lee de la PRIMERA fila de cada documento.
  const grupos = new Map<string, Fila[]>();
  for (const f of filas) {
    const id = f.cells.id_documento;
    if (!id) {
      errores.push({ fila: f.fila, columna: "id_documento", mensaje: "Falta el ID del documento. Cada fila debe decir a qué documento pertenece." });
      continue;
    }
    const g = grupos.get(id);
    if (g) g.push(f);
    else grupos.set(id, [f]);
  }
  if (grupos.size > MAX_DOCS) {
    errores.push({ fila: 0, mensaje: `La planilla trae ${grupos.size} documentos y el máximo es ${MAX_DOCS}. Divídela en varias.` });
  }

  const documentos: DocPlanilla[] = [];
  const conError = new Set<string>();
  const hoy = hoyIso();

  for (const [id, grupo] of grupos) {
    const err = (fila: number, columna: string | undefined, valor: string | undefined, mensaje: string) => {
      errores.push({ fila, documento: id, columna, valor, mensaje });
      conError.add(id);
    };
    const cab = grupo[0].cells;
    const f0 = grupo[0].fila;

    const tipoTxt = cab.tipo_dte;
    const tipo = Number(tipoTxt);
    if (!tipoTxt) err(f0, "tipo_dte", "", "Falta el tipo de documento en la primera fila (33, 34, 56 o 61).");
    else if (TIPOS_NO_SOPORTADOS[tipo])
      err(f0, "tipo_dte", tipoTxt, `La ${TIPOS_NO_SOPORTADOS[tipo]} (${tipo}) todavía no se emite por planilla. Emítela desde «Nuevo DTE» o por la API.`);
    else if (!TIPOS_PLANILLA[tipo]) err(f0, "tipo_dte", tipoTxt, "Tipo de documento desconocido. Usa 33, 34, 56 o 61.");

    // Filas siguientes que contradicen la cabecera.
    for (const f of grupo.slice(1)) {
      if (f.cells.tipo_dte && f.cells.tipo_dte !== tipoTxt)
        err(f.fila, "tipo_dte", f.cells.tipo_dte, `Este documento empezó como tipo ${tipoTxt || "?"} en la fila ${f0}. Un documento no puede mezclar tipos.`);
      if (f.cells.rut_receptor && rutSii(f.cells.rut_receptor) !== rutSii(cab.rut_receptor || ""))
        err(f.fila, "rut_receptor", f.cells.rut_receptor, `El RUT no coincide con el de la fila ${f0}. Si es otro cliente, usa otro ID de documento.`);
    }

    let fecha: string | undefined;
    if (cab.fecha_emision) {
      if (!fechaValida(cab.fecha_emision)) err(f0, "fecha_emision", cab.fecha_emision, "La fecha debe ir como AAAA-MM-DD, por ejemplo 2026-11-18.");
      else if (cab.fecha_emision > hoy) err(f0, "fecha_emision", cab.fecha_emision, "La fecha de emisión no puede ser futura.");
      else fecha = cab.fecha_emision;
    }

    const rutTxt = cab.rut_receptor || "";
    const rut = rutSii(rutTxt);
    if (!rutTxt) err(f0, "rut_receptor", "", "Falta el RUT del cliente en la primera fila.");
    else if (!rutValido(rut)) {
      const cuerpo = rut.split("-")[0];
      err(
        f0,
        "rut_receptor",
        rutTxt,
        cuerpo && cuerpo.length >= 7 ? `El dígito verificador no corresponde: para ${cuerpo} debería ser ${calcularDv(cuerpo)}.` : "RUT incompleto. Escríbelo con guion, por ejemplo 76.354.771-K.",
      );
    }
    const razon = cab.razon_social_receptor || "";
    if (!razon) err(f0, "razon_social_receptor", "", "Falta la razón social del cliente en la primera fila.");
    else if (razon.length > 100) err(f0, "razon_social_receptor", razon.slice(0, 30) + "…", "La razón social supera los 100 caracteres.");

    let formaPago: 1 | 2 | 3 | undefined;
    if (cab.forma_pago) {
      const fp = Number(cab.forma_pago);
      if (fp === 1 || fp === 2 || fp === 3) formaPago = fp;
      else err(f0, "forma_pago", cab.forma_pago, "Forma de pago: 1 contado, 2 crédito o 3 sin costo.");
    }
    let venc: string | undefined;
    if (cab.fecha_vencimiento) {
      if (!fechaValida(cab.fecha_vencimiento)) err(f0, "fecha_vencimiento", cab.fecha_vencimiento, "La fecha de vencimiento debe ir como AAAA-MM-DD.");
      else venc = cab.fecha_vencimiento;
    }

    // Referencias: obligatorias en notas de crédito/débito.
    let referencias: DocPlanilla["referencias"];
    const esNota = tipo === 56 || tipo === 61;
    if (cab.referencia_tipo || cab.referencia_folio || esNota) {
      if (!cab.referencia_tipo || !cab.referencia_folio) {
        if (esNota)
          err(f0, !cab.referencia_tipo ? "referencia_tipo" : "referencia_folio", "", "Una nota de crédito o débito debe indicar el tipo y el folio del documento que corrige.");
        else err(f0, "referencia_folio", cab.referencia_folio, "La referencia necesita tipo y folio del documento.");
      } else {
        let codigo: 1 | 2 | 3 | undefined;
        if (cab.referencia_codigo) {
          const c = Number(cab.referencia_codigo);
          if (c === 1 || c === 2 || c === 3) codigo = c;
          else err(f0, "referencia_codigo", cab.referencia_codigo, "Código de referencia: 1 anula, 2 corrige texto, 3 corrige montos.");
        } else if (esNota) codigo = tipo === 61 ? 1 : 3;
        if (cab.referencia_fecha && !fechaValida(cab.referencia_fecha))
          err(f0, "referencia_fecha", cab.referencia_fecha, "La fecha del documento referenciado debe ir como AAAA-MM-DD.");
        referencias = [
          {
            tipo_doc: cab.referencia_tipo,
            folio: cab.referencia_folio,
            fecha: cab.referencia_fecha || undefined,
            razon: cab.referencia_razon?.slice(0, 90) || undefined,
            codigo_ref: codigo,
          },
        ];
      }
    }

    // Líneas de detalle: una por fila.
    const items: DocItem[] = [];
    for (const f of grupo) {
      const c = f.cells;
      const nombre = c.item_nombre || "";
      if (!nombre) {
        err(f.fila, "item_nombre", "", "Falta qué vendiste en esta línea (columna ítem).");
        continue;
      }
      const cantidad = c.item_cantidad ? numero(c.item_cantidad) : 1;
      const precio = numero(c.item_precio || "");
      let ok = true;
      if (!(cantidad > 0)) {
        err(f.fila, "item_cantidad", c.item_cantidad, "La cantidad debe ser un número mayor que 0.");
        ok = false;
      }
      if (!c.item_precio) {
        err(f.fila, "item_precio", "", "Falta el precio unitario (neto, sin IVA).");
        ok = false;
      } else if (!(precio >= 0)) {
        err(f.fila, "item_precio", c.item_precio, "El precio debe ser un número, sin letras. Ejemplo: 45000.");
        ok = false;
      }
      if (c.item_unidad && c.item_unidad.length > 4) err(f.fila, "item_unidad", c.item_unidad, "La unidad admite hasta 4 caracteres: UN, KG, HR.");
      if (ok) {
        items.push({
          nombre: nombre.slice(0, 80),
          cantidad,
          precio,
          exento: tipo === 34 || SI.includes((c.item_exento || "").toLowerCase()),
          unidad: c.item_unidad || undefined,
        });
      }
    }

    const totales = calcularTotales(items);
    if (items.length && totales.total <= 0) err(f0, "item_precio", "", "El documento suma $0. Revisa los precios.");
    if (cab.monto_total) {
      const esperado = numero(cab.monto_total);
      if (Number.isNaN(esperado)) err(f0, "monto_total", cab.monto_total, "El monto total debe ser un número.");
      else if (Math.abs(esperado - totales.total) > 1)
        err(
          f0,
          "monto_total",
          cab.monto_total,
          `Tus ítems suman ${clp(totales.total)} con IVA y la planilla dice ${clp(esperado)}. ¿Pusiste precios con IVA? En factura van netos.`,
        );
    }

    const [rutCuerpo, dv] = rut.split("-");
    const doc: DocPlanilla = {
      id,
      tipo_dte: tipo,
      fecha_emision: fecha,
      receptor: {
        rut: rutCuerpo ?? "",
        dv: dv ?? "",
        razon_social: razon,
        giro: cab.giro_receptor?.slice(0, 40) || undefined,
        direccion: cab.direccion_receptor?.slice(0, 70) || undefined,
        comuna: cab.comuna_receptor?.slice(0, 20) || undefined,
        ciudad: cab.ciudad_receptor?.slice(0, 20) || undefined,
        email: cab.email_receptor?.slice(0, 80) || undefined,
      },
      forma_pago: formaPago,
      fecha_vencimiento: venc,
      referencias,
      items,
      totales,
      filas: grupo.map((g) => g.fila),
      huella: "",
    };
    doc.huella = huellaDoc(doc);
    documentos.push(doc);
  }

  // Ordenar errores por fila para que se lean como la planilla.
  errores.sort((a, b) => a.fila - b.fila);
  const docsConErrorGlobal = errores.some((e) => !e.documento && e.fila === 0);
  return {
    archivo,
    bytes,
    filasDatos: filas.length,
    documentos,
    validos: docsConErrorGlobal ? [] : documentos.filter((d) => !conError.has(d.id) && d.items.length > 0),
    errores,
    bloqueante: docsConErrorGlobal,
  };
}

/** Huella estable: tipo + receptor + fecha + líneas. Dos cargas del mismo documento dan la misma huella. */
export function huellaDoc(d: Pick<DocPlanilla, "id" | "tipo_dte" | "receptor" | "fecha_emision" | "items">) {
  const s = [d.id, d.tipo_dte, d.receptor.rut, d.fecha_emision ?? "", ...d.items.map((i) => `${i.nombre}|${i.cantidad}|${i.precio}|${i.exento ? 1 : 0}`)].join("§");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function clp(n: number) {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

export function nombreColumna(col?: string) {
  return col ? etiqueta(col) : "";
}

/** Cuerpo para POST /dte. */
export function payloadEmision(d: DocPlanilla) {
  return {
    tipo_dte: d.tipo_dte,
    fecha_emision: d.fecha_emision,
    receptor: d.receptor,
    items: d.items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, exento: i.exento, unidad: i.unidad })),
    forma_pago: d.forma_pago,
    cuotas: d.forma_pago === 2 && d.fecha_vencimiento ? [{ fecha: d.fecha_vencimiento, monto: d.totales.total }] : undefined,
    referencias: d.referencias,
  };
}

/** CSV de errores para corregir en Excel. */
export function erroresCsv(errores: Issue[]) {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = errores.map((e) => [String(e.fila || ""), e.documento ?? "", nombreColumna(e.columna), e.valor ?? "", e.mensaje].map(q).join(";"));
  return "﻿" + ["fila;documento;columna;valor;problema", ...rows].join("\r\n");
}
