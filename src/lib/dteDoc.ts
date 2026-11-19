import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import bwipjs from "bwip-js/node";
import type { Ambiente, DteItem } from "./types";
import { getDb } from "./store";
import { formatRutPuntos } from "./sii/rut";
import { aplanarXml } from "./sii/ted";
import { getSiiConfig } from "./sii/config";
import { logoParaDocumentos } from "./logo";

export type DteDocItem = {
  nombre: string;
  cantidad: number;
  precio: number;
  monto: number;
  unidad?: string;
};

export type DteDocParsed = {
  tipoDte: number;
  folio: number;
  fecha: string;
  emisor: {
    rut: string;
    razon: string;
    giro: string;
    direccion: string;
    comuna: string;
    ciudad?: string;
    telefono?: string;
    email?: string;
    unidad_sii?: string;
  };
  receptor: {
    rut: string;
    razon: string;
    giro: string;
    direccion: string;
    comuna: string;
    ciudad?: string;
  };
  items: DteDocItem[];
  neto: number;
  iva: number;
  exento: number;
  total: number;
  formaPago?: 1 | 2 | 3 | null;
  nroResol?: string;
  fchResol?: string;
  tedPresent: boolean;
  tedXml?: string | null;
  ambiente?: Ambiente;
};

export type DtePdfMeta = {
  tipoNombre?: string;
  estado?: string;
  ambiente?: Ambiente;
  trackId?: string | null;
};

const RED_SII = "#C41E3A";
const INK = "#111111";
const MUTED = "#444444";

const TIPO_NOMBRE: Record<number, string> = {
  33: "FACTURA ELECTRÓNICA",
  34: "FACTURA NO AFECTA O EXENTA ELECTRÓNICA",
  39: "BOLETA ELECTRÓNICA",
  41: "BOLETA NO AFECTA O EXENTA ELECTRÓNICA",
  46: "FACTURA DE COMPRA ELECTRÓNICA",
  52: "GUÍA DE DESPACHO ELECTRÓNICA",
  56: "NOTA DE DÉBITO ELECTRÓNICA",
  61: "NOTA DE CRÉDITO ELECTRÓNICA",
};

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : "";
}

function clp(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function clpPlain(n: number) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n || 0);
}

function esc(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fechaCl(iso: string): string {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formaPagoLabel(f?: 1 | 2 | 3 | null): string {
  if (f === 1) return "Contado";
  if (f === 2) return "Crédito";
  if (f === 3) return "Sin costo";
  return "";
}

function tipoNombreOf(tipo: number, fallback?: string) {
  return TIPO_NOMBRE[tipo] || fallback || `DTE ${tipo}`;
}

/** Ruta del EnvioDTE en disco a partir de tipo + folio. */
export function rutaXmlDte(tipoDte: number, folio: number): string | null {
  const file = path.join(process.cwd(), "data", "emitidos", `EnvioDTE_T${tipoDte}_F${folio}.xml`);
  return fs.existsSync(file) ? file : null;
}

export function parseEnvioDteXml(xml: string): DteDocParsed {
  const doc = xml.match(/<Documento[\s\S]*?<\/Documento>/i)?.[0] || xml;
  const caratula = xml.match(/<Caratula[\s\S]*?<\/Caratula>/i)?.[0] || "";
  const detalles = [...doc.matchAll(/<Detalle>([\s\S]*?)<\/Detalle>/gi)].map((m) => m[1]);
  const items = detalles.map((d) => ({
    nombre: tag(d, "NmbItem") || "Ítem",
    cantidad: Number(tag(d, "QtyItem") || 1),
    precio: Number(tag(d, "PrcItem") || 0),
    monto: Number(tag(d, "MontoItem") || 0),
    unidad: tag(d, "UnmdItem") || "",
  }));
  const tedMatch = doc.match(/<TED[\s\S]*?<\/TED>/i);
  const fma = Number(tag(doc, "FmaPago") || 0);
  const emp = getDb().empresa;
  return {
    tipoDte: Number(tag(doc, "TipoDTE") || 0),
    folio: Number(tag(doc, "Folio") || 0),
    fecha: tag(doc, "FchEmis"),
    emisor: {
      rut: tag(doc, "RUTEmisor"),
      razon: tag(doc, "RznSoc"),
      giro: tag(doc, "GiroEmis"),
      direccion: tag(doc, "DirOrigen"),
      comuna: tag(doc, "CmnaOrigen"),
      ciudad: tag(doc, "CiudadOrigen") || emp.ciudad || tag(doc, "CmnaOrigen"),
      telefono: emp.telefono || "",
      email: emp.email || "",
      unidad_sii: emp.unidad_sii || emp.comuna || tag(doc, "CmnaOrigen"),
    },
    receptor: {
      rut: tag(doc, "RUTRecep"),
      razon: tag(doc, "RznSocRecep"),
      giro: tag(doc, "GiroRecep"),
      direccion: tag(doc, "DirRecep"),
      comuna: tag(doc, "CmnaRecep"),
      ciudad: tag(doc, "CiudadRecep") || tag(doc, "CmnaRecep"),
    },
    items,
    neto: Number(tag(doc, "MntNeto") || 0),
    iva: Number(tag(doc, "IVA") || 0),
    exento: Number(tag(doc, "MntExe") || 0),
    total: Number(tag(doc, "MntTotal") || 0),
    formaPago: fma === 1 || fma === 2 || fma === 3 ? (fma as 1 | 2 | 3) : null,
    nroResol: tag(caratula, "NroResol") || tag(doc, "NroResol") || "0",
    fchResol: tag(caratula, "FchResol") || tag(doc, "FchResol") || "",
    tedPresent: Boolean(tedMatch),
    tedXml: tedMatch ? tedMatch[0] : null,
  };
}

/** Arma datos del documento: XML si existe; si no, desde el registro del store. */
export function cargarDteDoc(dte: DteItem): DteDocParsed {
  const xmlPath = rutaXmlDte(dte.tipo_dte, dte.folio);
  const emp = getDb().empresa;
  if (xmlPath) {
    const xml = fs.readFileSync(xmlPath, "latin1");
    const parsed = parseEnvioDteXml(xml);
    parsed.ambiente = dte.ambiente;
    parsed.emisor.telefono = parsed.emisor.telefono || emp.telefono || "";
    parsed.emisor.email = parsed.emisor.email || emp.email || "";
    parsed.emisor.unidad_sii = parsed.emisor.unidad_sii || emp.unidad_sii || emp.comuna || "";
    parsed.emisor.ciudad = parsed.emisor.ciudad || emp.ciudad || emp.comuna || "";
    return parsed;
  }
  return {
    tipoDte: dte.tipo_dte,
    folio: dte.folio,
    fecha: dte.fecha_emision,
    emisor: {
      rut: `${emp.rut}-${emp.dv}`,
      razon: emp.razon_social,
      giro: emp.giro || "",
      direccion: emp.direccion || "",
      comuna: emp.comuna || "",
      ciudad: emp.ciudad || emp.comuna || "",
      telefono: emp.telefono || "",
      email: emp.email || "",
      unidad_sii: emp.unidad_sii || emp.comuna || "",
    },
    receptor: {
      rut: dte.receptor_rut,
      razon: dte.receptor_razon_social,
      giro: "",
      direccion: "",
      comuna: "",
    },
    items: [{ nombre: "Detalle no disponible (sin XML)", cantidad: 1, precio: dte.monto_total, monto: dte.monto_total }],
    neto: Math.round(dte.monto_total / 1.19),
    iva: dte.monto_total - Math.round(dte.monto_total / 1.19),
    exento: 0,
    total: dte.monto_total,
    tedPresent: false,
    tedXml: null,
    ambiente: dte.ambiente,
  };
}

async function pdf417Png(tedXml: string): Promise<Buffer | null> {
  try {
    const text = aplanarXml(tedXml).slice(0, 900);
    return await bwipjs.toBuffer({
      bcid: "pdf417",
      text,
      scale: 2,
      height: 12,
      includetext: false,
      paddingwidth: 0,
      paddingheight: 0,
    });
  } catch {
    return null;
  }
}

function drawPage(
  pdf: PDFKit.PDFDocument,
  doc: DteDocParsed,
  opts: {
    tipoNombre: string;
    copia: "original" | "cedible";
    esPrueba: boolean;
    barcode: Buffer | null;
    estado?: string;
    trackId?: string | null;
    generado: string;
  },
) {
  // Márgenes 0: el layout es fijo (1 página por copia). Si no, pdfkit inserta hojas vacías.
  pdf.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };

  const pageW = pdf.page.width;
  const pageH = pdf.page.height;
  const L = 36;
  const R = pageW - 36;
  const usable = R - L;
  let y = 28;

  // Banner de prueba (certificación / maullín)
  if (opts.esPrueba) {
    pdf.save();
    pdf.strokeColor(RED_SII).lineWidth(1.2);
    pdf.moveTo(L + 80, y).lineTo(R - 80, y).stroke();
    pdf.font("Helvetica-Bold").fontSize(9).fillColor(RED_SII);
    pdf.text("DOCUMENTO DE PRUEBA — SIN VALIDEZ TRIBUTARIA", L, y + 4, {
      width: usable,
      align: "center",
    });
    const y2 = pdf.y + 2;
    pdf.moveTo(L + 80, y2).lineTo(R - 80, y2).stroke();
    pdf.restore();
    y = y2 + 10;
  }

  // Caja RUT / tipo / folio (derecha)
  const boxW = 196;
  const boxH = 78;
  const boxX = R - boxW;
  const boxY = y;
  pdf.save();
  pdf.lineWidth(2).strokeColor(RED_SII).rect(boxX, boxY, boxW, boxH).stroke();
  pdf.font("Helvetica-Bold").fontSize(11).fillColor(RED_SII);
  pdf.text(`R.U.T.: ${formatRutPuntos(doc.emisor.rut)}`, boxX, boxY + 10, {
    width: boxW,
    align: "center",
  });
  pdf.font("Helvetica-Bold").fontSize(10).fillColor(RED_SII);
  pdf.text(opts.tipoNombre, boxX + 6, boxY + 28, { width: boxW - 12, align: "center" });
  pdf.font("Helvetica-Bold").fontSize(16).fillColor(RED_SII);
  pdf.text(`Nº ${doc.folio}`, boxX, boxY + 50, { width: boxW, align: "center" });
  pdf.restore();

  const unidad = (doc.emisor.unidad_sii || doc.emisor.comuna || "").toUpperCase();
  if (unidad) {
    pdf.font("Helvetica-Bold").fontSize(10).fillColor(RED_SII);
    pdf.text(unidad, boxX, boxY + boxH + 4, { width: boxW, align: "center" });
  }

  // Emisor (izquierda)
  const leftW = boxX - L - 16;
  let ey = y;
  const logo = logoParaDocumentos(Boolean(getDb().empresa.usar_logo));
  if (logo) {
    try {
      pdf.image(logo, L, ey, { fit: [110, 42] });
      ey += 48;
    } catch {
      /* ignore bad logo */
    }
  } else {
    const fantasia = getDb().empresa.nombre_fantasia || "DEVSUR";
    pdf.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(fantasia, L, ey, { width: leftW });
    ey = pdf.y + 4;
  }

  pdf.font("Helvetica-Bold").fontSize(9).fillColor(INK);
  pdf.text(doc.emisor.razon || "", L, ey, { width: leftW });
  ey = pdf.y + 2;
  pdf.font("Helvetica").fontSize(8).fillColor(INK);
  pdf.text(`R.U.T.: ${formatRutPuntos(doc.emisor.rut)}`, L, ey, { width: leftW });
  ey = pdf.y + 1;
  if (doc.emisor.giro) {
    pdf.text(`Giro: ${doc.emisor.giro}`, L, ey, { width: leftW });
    ey = pdf.y + 1;
  }
  const dirLine = [doc.emisor.direccion, doc.emisor.comuna, doc.emisor.ciudad]
    .filter(Boolean)
    .join(", ");
  if (dirLine) {
    pdf.text(dirLine, L, ey, { width: leftW });
    ey = pdf.y + 1;
  }
  const contacto = [
    doc.emisor.telefono ? `Tel: ${doc.emisor.telefono}` : "",
    doc.emisor.email ? `Email: ${doc.emisor.email}` : "",
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (contacto) {
    pdf.text(contacto, L, ey, { width: leftW });
    ey = pdf.y;
  }

  y = Math.max(ey, boxY + boxH + 22) + 8;

  // Receptor
  pdf.save();
  pdf.strokeColor(INK).lineWidth(1);
  pdf.moveTo(L, y).lineTo(R, y).stroke();
  pdf.restore();
  y += 8;

  const colMid = L + usable * 0.58;
  const giroTrunc =
    (doc.receptor.giro || "").length > 48
      ? `${doc.receptor.giro.slice(0, 47)}…`
      : doc.receptor.giro || "";

  const leftRows: [string, string][] = [
    ["SEÑOR(ES)", doc.receptor.razon || ""],
    ["R.U.T.", formatRutPuntos(doc.receptor.rut)],
    ["DIRECCIÓN", doc.receptor.direccion || ""],
  ];
  if (formaPagoLabel(doc.formaPago)) {
    leftRows.push(["FORMA DE PAGO", formaPagoLabel(doc.formaPago)]);
  }

  const rightRows: [string, string][] = [
    ["FECHA EMISIÓN", fechaCl(doc.fecha)],
    ["GIRO", giroTrunc],
    ["COMUNA", doc.receptor.comuna || ""],
  ];

  const rowH = 13;
  pdf.fontSize(8);
  for (let i = 0; i < Math.max(leftRows.length, rightRows.length); i++) {
    const yy = y + i * rowH;
    if (leftRows[i]) {
      pdf.font("Helvetica-Bold").fillColor(INK).text(`${leftRows[i][0]}:`, L, yy, { continued: true });
      pdf.font("Helvetica").text(` ${leftRows[i][1]}`, { width: colMid - L - 8 });
    }
    if (rightRows[i]) {
      pdf.font("Helvetica-Bold").fillColor(INK).text(`${rightRows[i][0]}:`, colMid, yy, {
        continued: true,
      });
      pdf.font("Helvetica").text(` ${rightRows[i][1]}`, { width: R - colMid - 4 });
    }
  }
  y += Math.max(leftRows.length, rightRows.length) * rowH + 6;

  pdf.save();
  pdf.strokeColor(INK).lineWidth(1);
  pdf.moveTo(L, y).lineTo(R, y).stroke();
  pdf.restore();
  y += 10;

  // Tabla ítems
  const cols = {
    n: L,
    desc: L + 28,
    cant: L + usable * 0.55,
    und: L + usable * 0.64,
    punit: L + usable * 0.74,
    monto: L + usable * 0.88,
  };
  const widths = {
    n: 24,
    desc: cols.cant - cols.desc - 4,
    cant: cols.und - cols.cant - 4,
    und: cols.punit - cols.und - 4,
    punit: cols.monto - cols.punit - 4,
    monto: R - cols.monto,
  };

  pdf.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
  pdf.text("Nº", cols.n, y, { width: widths.n });
  pdf.text("DESCRIPCIÓN", cols.desc, y, { width: widths.desc });
  pdf.text("CANT.", cols.cant, y, { width: widths.cant, align: "right" });
  pdf.text("UNIDAD", cols.und, y, { width: widths.und, align: "center" });
  pdf.text("PRECIO UNIT.", cols.punit, y, { width: widths.punit, align: "right" });
  pdf.text("MONTO", cols.monto, y, { width: widths.monto, align: "right" });
  y += 12;
  pdf.moveTo(L, y).lineTo(R, y).strokeColor("#bbbbbb").lineWidth(0.6).stroke();
  y += 6;

  pdf.font("Helvetica").fontSize(9).fillColor(INK);
  doc.items.forEach((it, idx) => {
    const yy = y;
    pdf.text(String(idx + 1), cols.n, yy, { width: widths.n });
    pdf.text(it.nombre || "", cols.desc, yy, { width: widths.desc });
    const afterDesc = pdf.y;
    pdf.text(String(it.cantidad), cols.cant, yy, { width: widths.cant, align: "right" });
    pdf.text(it.unidad || "", cols.und, yy, { width: widths.und, align: "center" });
    pdf.text(`$${clpPlain(it.precio)}`, cols.punit, yy, { width: widths.punit, align: "right" });
    pdf.text(`$${clpPlain(it.monto)}`, cols.monto, yy, { width: widths.monto, align: "right" });
    y = Math.max(afterDesc, yy + 12) + 4;
  });

  // Totales (anclados sobre el pie fijo)
  const footTop = pageH - 195;
  y = Math.min(Math.max(y + 10, footTop - 90), footTop - 70);
  const totX = R - 200;
  const line = (label: string, value: string, bold = false) => {
    pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9).fillColor(INK);
    pdf.text(label, totX, y, { width: 110, lineBreak: false });
    pdf.text(value, totX + 100, y, { width: 100, align: "right", lineBreak: false });
    y += bold ? 15 : 13;
  };
  pdf.moveTo(totX, y).lineTo(R, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
  y += 5;
  if (doc.neto) line("NETO $", clpPlain(doc.neto));
  if (doc.exento) line("EXENTO $", clpPlain(doc.exento));
  if (doc.iva) line("I.V.A. (19%) $", clpPlain(doc.iva));
  pdf.moveTo(totX, y).lineTo(R, y).strokeColor(INK).lineWidth(1).stroke();
  y += 3;
  line("TOTAL $", clpPlain(doc.total), true);
  pdf.moveTo(totX, y - 2).lineTo(R, y - 2).strokeColor(INK).lineWidth(1).stroke();

  if (opts.estado || opts.trackId) {
    y += 4;
    pdf.font("Helvetica").fontSize(7).fillColor(MUTED);
    const bits = [
      opts.estado ? `SII: ${opts.estado}` : "",
      opts.trackId ? `Track ID: ${opts.trackId}` : "",
    ].filter(Boolean);
    pdf.text(bits.join(" · "), L, y, { width: usable, lineBreak: false });
  }

  // Pie fijo: timbre + acuse (siempre en la misma hoja)
  y = footTop;
  const tedW = 210;
  const tedH = 78;
  if (opts.barcode) {
    try {
      pdf.image(opts.barcode, L, y, { fit: [tedW, tedH] });
    } catch {
      pdf.rect(L, y, tedW, tedH).strokeColor("#999").stroke();
    }
  } else {
    pdf.rect(L, y, tedW, tedH).strokeColor("#999").lineWidth(0.8).stroke();
    pdf.font("Helvetica").fontSize(8).fillColor(MUTED);
    pdf.text(doc.tedPresent ? "Timbre no renderizado" : "Sin TED en el XML", L, y + tedH / 2 - 6, {
      width: tedW,
      align: "center",
      lineBreak: false,
    });
  }

  const yearResol = (doc.fchResol || doc.fecha || "").slice(0, 4) || new Date().getFullYear();
  pdf.font("Helvetica").fontSize(7).fillColor(INK);
  pdf.text("Timbre Electrónico SII", L, y + tedH + 3, { width: tedW, align: "center", lineBreak: false });
  pdf.text(`Res. Nº ${doc.nroResol || "0"} del ${yearResol}`, L, y + tedH + 13, {
    width: tedW,
    align: "center",
    lineBreak: false,
  });
  pdf.font("Helvetica-Bold").fontSize(7);
  pdf.text("Verifique documento: www.sii.cl", L, y + tedH + 23, {
    width: tedW,
    align: "center",
    lineBreak: false,
  });

  const acuseX = L + tedW + 18;
  const acuseW = R - acuseX;
  const acuseH = 110;
  pdf.save();
  pdf.lineWidth(1).strokeColor(INK).rect(acuseX, y, acuseW, acuseH).stroke();
  pdf.font("Helvetica-Bold").fontSize(8).fillColor(INK);
  pdf.text("Acuse de Recibo", acuseX, y + 5, { width: acuseW, align: "center", lineBreak: false });
  pdf.font("Helvetica").fontSize(6.5).fillColor(MUTED);
  const campos = ["Nombre", "R.U.T.", "Fecha", "Recinto", "Firma"];
  campos.forEach((c, i) => {
    pdf.text(`${c} _______________________________`, acuseX + 10, y + 20 + i * 11, {
      width: acuseW - 20,
      lineBreak: false,
    });
  });
  pdf.font("Helvetica").fontSize(5.2).fillColor(MUTED);
  pdf.text(
    "El acuse de recibo que se declara en este acto, de acuerdo a lo dispuesto en la letra b) del Art. 4° y la letra c) del Art. 5° de la Ley 19.983, acredita que la entrega de mercaderías o servicio(s) prestado(s) ha(n) sido recibido(s).",
    acuseX + 8,
    y + acuseH - 26,
    { width: acuseW - 16, align: "justify", height: 22, ellipsis: true },
  );
  pdf.restore();

  pdf.font("Helvetica-Bold").fontSize(11).fillColor(INK);
  pdf.text(opts.copia === "cedible" ? "CEDIBLE" : "ORIGINAL", R - 90, y + acuseH + 6, {
    width: 90,
    align: "right",
    lineBreak: false,
  });

  pdf.font("Helvetica").fontSize(6.5).fillColor(MUTED);
  pdf.text(
    `Representación Impresa de Documento Tributario Electrónico - Generado ${opts.generado}`,
    L,
    pageH - 22,
    { width: usable, align: "center", lineBreak: false },
  );
}

export function htmlDte(doc: DteDocParsed, meta?: DtePdfMeta): string {
  const tipoNombre = tipoNombreOf(doc.tipoDte, meta?.tipoNombre);
  const esPrueba = (meta?.ambiente || doc.ambiente || getSiiConfig().ambiente) === "certificacion";
  const filas = doc.items
    .map(
      (it, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(it.nombre)}</td>
      <td class="num">${it.cantidad}</td>
      <td>${esc(it.unidad || "")}</td>
      <td class="num">${clp(it.precio)}</td>
      <td class="num">${clp(it.monto)}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${esc(tipoNombre)} ${doc.folio}</title>
<style>
  body{font-family:Helvetica,Arial,sans-serif;color:#111;max-width:860px;margin:24px auto;padding:0 16px;line-height:1.35}
  .prueba{color:#C41E3A;font-weight:700;text-align:center;border-top:1px solid #C41E3A;border-bottom:1px solid #C41E3A;padding:6px;margin-bottom:16px;font-size:.85rem}
  .top{display:grid;grid-template-columns:1fr 220px;gap:16px}
  .box{border:2px solid #C41E3A;padding:10px;text-align:center;color:#C41E3A;font-weight:700}
  .box .folio{font-size:1.35rem;margin-top:6px}
  .unidad{color:#C41E3A;text-align:center;font-weight:700;margin-top:4px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border-bottom:1px solid #ddd;padding:6px 4px;font-size:.85rem;text-align:left}
  .num{text-align:right;white-space:nowrap}
  .totales{width:240px;margin:12px 0 0 auto}
  .totales div{display:flex;justify-content:space-between;padding:2px 0}
  .totales .total{font-weight:700;border-top:1px solid #111;border-bottom:1px solid #111;margin-top:4px;padding:6px 0}
  .foot{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:28px}
  .acuse{border:1px solid #111;padding:10px;font-size:.75rem;min-height:120px}
  .copia{text-align:right;font-weight:700;margin-top:8px}
</style>
</head>
<body>
  ${esPrueba ? `<div class="prueba">DOCUMENTO DE PRUEBA — SIN VALIDEZ TRIBUTARIA</div>` : ""}
  <div class="top">
    <div>
      <strong>${esc(doc.emisor.razon)}</strong><br/>
      R.U.T.: ${esc(formatRutPuntos(doc.emisor.rut))}<br/>
      ${esc(doc.emisor.giro)}<br/>
      ${esc([doc.emisor.direccion, doc.emisor.comuna, doc.emisor.ciudad].filter(Boolean).join(", "))}
    </div>
    <div>
      <div class="box">
        R.U.T.: ${esc(formatRutPuntos(doc.emisor.rut))}<br/>
        ${esc(tipoNombre)}
        <div class="folio">Nº ${doc.folio}</div>
      </div>
      <div class="unidad">${esc((doc.emisor.unidad_sii || doc.emisor.comuna || "").toUpperCase())}</div>
    </div>
  </div>
  <hr/>
  <p><strong>SEÑOR(ES):</strong> ${esc(doc.receptor.razon)} &nbsp;&nbsp; <strong>FECHA EMISIÓN:</strong> ${esc(fechaCl(doc.fecha))}<br/>
  <strong>R.U.T.:</strong> ${esc(formatRutPuntos(doc.receptor.rut))} &nbsp;&nbsp; <strong>GIRO:</strong> ${esc(doc.receptor.giro)}<br/>
  <strong>DIRECCIÓN:</strong> ${esc(doc.receptor.direccion)} &nbsp;&nbsp; <strong>COMUNA:</strong> ${esc(doc.receptor.comuna)}
  ${formaPagoLabel(doc.formaPago) ? `<br/><strong>FORMA DE PAGO:</strong> ${esc(formaPagoLabel(doc.formaPago))}` : ""}</p>
  <hr/>
  <table>
    <thead><tr><th>Nº</th><th>DESCRIPCIÓN</th><th class="num">CANT.</th><th>UNIDAD</th><th class="num">PRECIO UNIT.</th><th class="num">MONTO</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="totales">
    <div><span>NETO $</span><span>${clpPlain(doc.neto)}</span></div>
    ${doc.exento ? `<div><span>EXENTO $</span><span>${clpPlain(doc.exento)}</span></div>` : ""}
    <div><span>I.V.A. (19%) $</span><span>${clpPlain(doc.iva)}</span></div>
    <div class="total"><span>TOTAL $</span><span>${clpPlain(doc.total)}</span></div>
  </div>
  <div class="foot">
    <div>
      <div>${doc.tedPresent ? "Timbre Electrónico SII (ver PDF)" : "Sin TED"}</div>
      <small>Res. Nº ${esc(doc.nroResol || "0")} · Verifique en www.sii.cl</small>
    </div>
    <div class="acuse">
      <strong>Acuse de Recibo</strong><br/>
      Nombre ____________ R.U.T. ____________<br/>
      Fecha _____________ Recinto ___________<br/>
      Firma ________________________________
    </div>
  </div>
  <div class="copia">ORIGINAL / CEDIBLE</div>
</body>
</html>`;
}

export async function pdfDte(doc: DteDocParsed, meta?: DtePdfMeta): Promise<Buffer> {
  const tipoNombre = tipoNombreOf(doc.tipoDte, meta?.tipoNombre);
  const ambiente = meta?.ambiente || doc.ambiente || getSiiConfig().ambiente;
  const esPrueba = ambiente === "certificacion";
  const barcode = doc.tedXml ? await pdf417Png(doc.tedXml) : null;
  const ahora = new Date();
  const generado = `${String(ahora.getDate()).padStart(2, "0")}/${String(ahora.getMonth() + 1).padStart(2, "0")}/${ahora.getFullYear()} ${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;

  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "A4",
      autoFirstPage: false,
      margins: { top: 0, left: 0, right: 0, bottom: 0 },
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    const common = {
      tipoNombre,
      esPrueba,
      barcode,
      estado: meta?.estado,
      trackId: meta?.trackId,
      generado,
    } as const;

    pdf.addPage();
    drawPage(pdf, doc, { ...common, copia: "original" });
    pdf.addPage();
    drawPage(pdf, doc, { ...common, copia: "cedible" });
    pdf.end();
  });
}
