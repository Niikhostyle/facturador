import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import type { Cotizacion } from "./types";
import { getDb } from "./store";
import { formatRutPuntos } from "./sii/rut";
import { logoParaDocumentos, mimeDeLogo } from "./logo";

const RED = "#C41E3A";
const INK = "#111111";
const MUTED = "#444444";

function esc(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clpPlain(n: number) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n || 0);
}

function fechaCl(iso: string): string {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Data-URI del logo para embeber en HTML (si existe y está activo). */
function logoDataUri(usarLogo: boolean): string | null {
  const file = logoParaDocumentos(usarLogo);
  if (!file) return null;
  try {
    const buf = fs.readFileSync(file);
    return `data:${mimeDeLogo(file)};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function renderHtml(cot: Cotizacion): string {
  const emp = getDb().empresa;
  const fantasia = emp.nombre_fantasia || "DEVSUR";
  const unidad = (emp.unidad_sii || emp.comuna || "").toUpperCase();
  const logoUri = logoDataUri(Boolean(emp.usar_logo));
  const filas = cot.items
    .map(
      (it, i) =>
        `<tr>
          <td>${i + 1}</td>
          <td>${esc(it.nombre)}${it.exento ? " <em>(exento)</em>" : ""}</td>
          <td class="num">${it.cantidad}</td>
          <td class="num">$${clpPlain(it.precio)}</td>
          <td class="num">$${clpPlain(Math.round(it.cantidad * it.precio))}</td>
        </tr>`,
    )
    .join("");

  const contacto = [
    emp.telefono ? `Tel: ${esc(emp.telefono)}` : "",
    emp.email ? `Email: ${esc(emp.email)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const brandBlock = logoUri
    ? `<img src="${logoUri}" alt="${esc(fantasia)}" style="max-height:52px;max-width:180px;object-fit:contain;display:block;margin-bottom:8px"/>`
    : `<p class="brand">${esc(fantasia)}</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${esc(cot.numero)} — Cotización</title>
<style>
  @page { size: A4; margin: 14mm; }
  body{font-family:Helvetica,Arial,sans-serif;color:#111;max-width:860px;margin:24px auto;padding:0 16px;line-height:1.35}
  .aviso{color:#C41E3A;font-weight:700;text-align:center;border-top:1px solid #C41E3A;border-bottom:1px solid #C41E3A;padding:6px;margin-bottom:16px;font-size:.85rem}
  .top{display:grid;grid-template-columns:1fr 220px;gap:16px;align-items:start}
  .brand{font-size:1.35rem;font-weight:700;margin:0 0 4px}
  .box{border:2px solid #C41E3A;padding:10px;text-align:center;color:#C41E3A;font-weight:700}
  .box .folio{font-size:1.35rem;margin-top:6px}
  .unidad{color:#C41E3A;text-align:center;font-weight:700;margin-top:4px;font-size:.9rem}
  hr{border:none;border-top:1px solid #111;margin:12px 0}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border-bottom:1px solid #ddd;padding:7px 4px;font-size:.85rem;text-align:left}
  th{color:#555;font-size:.75rem}
  .num{text-align:right;white-space:nowrap}
  .totales{width:240px;margin:14px 0 0 auto}
  .totales div{display:flex;justify-content:space-between;padding:2px 0;font-size:.9rem}
  .totales .total{font-weight:700;border-top:1px solid #111;border-bottom:1px solid #111;margin-top:4px;padding:6px 0;font-size:1.05rem}
  .notas{margin-top:18px;font-size:.85rem;color:#444}
  .foot{margin-top:28px;font-size:.7rem;color:#666;text-align:center}
  @media print{body{margin:0;max-width:none}}
</style>
</head>
<body>
  <div class="aviso">COTIZACIÓN COMERCIAL — NO CONSTITUYE DTE NI BOLETA TRIBUTARIA</div>
  <div class="top">
    <div>
      ${brandBlock}
      <strong>${esc(emp.razon_social)}</strong><br/>
      R.U.T.: ${esc(formatRutPuntos(emp.rut_formateado || `${emp.rut}-${emp.dv}`))}<br/>
      ${emp.giro ? `Giro: ${esc(emp.giro)}<br/>` : ""}
      ${esc([emp.direccion, emp.comuna, emp.ciudad].filter(Boolean).join(", "))}<br/>
      ${contacto ? `${contacto}<br/>` : ""}
    </div>
    <div>
      <div class="box">
        R.U.T.: ${esc(formatRutPuntos(emp.rut_formateado || `${emp.rut}-${emp.dv}`))}<br/>
        COTIZACIÓN
        <div class="folio">${esc(cot.numero)}</div>
      </div>
      ${unidad ? `<div class="unidad">${esc(unidad)}</div>` : ""}
    </div>
  </div>
  <hr/>
  <p>
    <strong>SEÑOR(ES):</strong> ${esc(cot.receptor_razon_social)}
    &nbsp;&nbsp; <strong>FECHA:</strong> ${esc(fechaCl(cot.fecha))}<br/>
    <strong>R.U.T.:</strong> ${esc(formatRutPuntos(cot.receptor_rut))}
    &nbsp;&nbsp; <strong>VÁLIDA:</strong> ${cot.validez_dias} días
    &nbsp;&nbsp; <strong>ESTADO:</strong> ${esc(cot.estado)}<br/>
    ${cot.receptor_giro ? `<strong>GIRO:</strong> ${esc(cot.receptor_giro)} &nbsp;&nbsp; ` : ""}
    ${cot.receptor_direccion ? `<strong>DIRECCIÓN:</strong> ${esc(cot.receptor_direccion)} &nbsp;&nbsp; ` : ""}
    ${cot.receptor_comuna ? `<strong>COMUNA:</strong> ${esc(cot.receptor_comuna)}` : ""}
    ${cot.receptor_email ? `<br/><strong>EMAIL:</strong> ${esc(cot.receptor_email)}` : ""}
  </p>
  <hr/>
  <table>
    <thead>
      <tr>
        <th>Nº</th>
        <th>DESCRIPCIÓN</th>
        <th class="num">CANT.</th>
        <th class="num">PRECIO UNIT.</th>
        <th class="num">MONTO</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>
  <div class="totales">
    <div><span>NETO $</span><span>${clpPlain(cot.neto)}</span></div>
    ${cot.exento ? `<div><span>EXENTO $</span><span>${clpPlain(cot.exento)}</span></div>` : ""}
    <div><span>I.V.A. (19%) $</span><span>${clpPlain(cot.iva)}</span></div>
    <div class="total"><span>TOTAL $</span><span>${clpPlain(cot.total)}</span></div>
  </div>
  ${cot.notas ? `<div class="notas"><strong>Notas:</strong> ${esc(cot.notas)}</div>` : ""}
  <p class="notas">Los precios están expresados en pesos chilenos. Esta cotización no es un documento tributario electrónico.</p>
  <p class="foot">Cotización generada por Facturador GDT DevSur · ${esc(fechaCl(cot.fecha))}</p>
</body>
</html>`;
}

/** Genera y guarda un HTML imprimible de la cotización (mismo estilo visual que la factura). */
export function guardarDocumentoCotizacion(cot: Cotizacion): string {
  const html = renderHtml(cot);
  const dir = path.join(process.cwd(), "data", "cotizaciones");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${cot.numero}.html`);
  fs.writeFileSync(file, html, "utf8");
  return file;
}

/** PDF de cotización (1 página, estilo factura comercial, sin TED/cedible). */
export async function pdfCotizacion(cot: Cotizacion): Promise<Buffer> {
  const emp = getDb().empresa;
  const fantasia = emp.nombre_fantasia || "DEVSUR";
  const unidad = (emp.unidad_sii || emp.comuna || "").toUpperCase();
  const rutEmp = formatRutPuntos(emp.rut_formateado || `${emp.rut}-${emp.dv}`);

  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "A4",
      margins: { top: 0, left: 0, right: 0, bottom: 0 },
      autoFirstPage: true,
    });
    const chunks: Buffer[] = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    pdf.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    const pageW = pdf.page.width;
    const pageH = pdf.page.height;
    const L = 36;
    const R = pageW - 36;
    const usable = R - L;
    let y = 28;

    // Aviso comercial
    pdf.strokeColor(RED).lineWidth(1);
    pdf.moveTo(L + 60, y).lineTo(R - 60, y).stroke();
    pdf.font("Helvetica-Bold").fontSize(9).fillColor(RED);
    pdf.text("COTIZACIÓN COMERCIAL — NO CONSTITUYE DTE NI BOLETA TRIBUTARIA", L, y + 4, {
      width: usable,
      align: "center",
      lineBreak: false,
    });
    const y2 = y + 18;
    pdf.moveTo(L + 60, y2).lineTo(R - 60, y2).stroke();
    y = y2 + 12;

    // Caja derecha
    const boxW = 196;
    const boxH = 78;
    const boxX = R - boxW;
    pdf.lineWidth(2).strokeColor(RED).rect(boxX, y, boxW, boxH).stroke();
    pdf.font("Helvetica-Bold").fontSize(11).fillColor(RED);
    pdf.text(`R.U.T.: ${rutEmp}`, boxX, y + 10, { width: boxW, align: "center", lineBreak: false });
    pdf.fontSize(10).text("COTIZACIÓN", boxX + 6, y + 30, { width: boxW - 12, align: "center", lineBreak: false });
    pdf.fontSize(14).text(cot.numero, boxX, y + 50, { width: boxW, align: "center", lineBreak: false });
    if (unidad) {
      pdf.fontSize(10).text(unidad, boxX, y + boxH + 4, { width: boxW, align: "center", lineBreak: false });
    }

    // Emisor
    const leftW = boxX - L - 16;
    let ey = y;
    const logo = logoParaDocumentos(Boolean(emp.usar_logo));
    if (logo) {
      try {
        pdf.image(logo, L, ey, { fit: [110, 42] });
        ey += 48;
      } catch {
        pdf.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(fantasia, L, ey, { width: leftW, lineBreak: false });
        ey += 20;
      }
    } else {
      pdf.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(fantasia, L, ey, { width: leftW, lineBreak: false });
      ey += 20;
    }
    pdf.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(emp.razon_social || "", L, ey, { width: leftW });
    ey = pdf.y + 2;
    pdf.font("Helvetica").fontSize(8);
    pdf.text(`R.U.T.: ${rutEmp}`, L, ey, { width: leftW, lineBreak: false });
    ey += 11;
    if (emp.giro) {
      pdf.text(`Giro: ${emp.giro}`, L, ey, { width: leftW });
      ey = pdf.y + 1;
    }
    const dir = [emp.direccion, emp.comuna, emp.ciudad].filter(Boolean).join(", ");
    if (dir) {
      pdf.text(dir, L, ey, { width: leftW });
      ey = pdf.y + 1;
    }
    const contacto = [emp.telefono ? `Tel: ${emp.telefono}` : "", emp.email ? `Email: ${emp.email}` : ""]
      .filter(Boolean)
      .join("  ·  ");
    if (contacto) {
      pdf.text(contacto, L, ey, { width: leftW, lineBreak: false });
      ey += 11;
    }

    y = Math.max(ey, y + boxH + 22) + 8;
    pdf.strokeColor(INK).lineWidth(1).moveTo(L, y).lineTo(R, y).stroke();
    y += 8;

    const colMid = L + usable * 0.55;
    const leftRows: [string, string][] = [
      ["SEÑOR(ES)", cot.receptor_razon_social || ""],
      ["R.U.T.", formatRutPuntos(cot.receptor_rut)],
    ];
    if (cot.receptor_direccion) leftRows.push(["DIRECCIÓN", cot.receptor_direccion]);
    if (cot.receptor_comuna) leftRows.push(["COMUNA", cot.receptor_comuna]);

    const rightRows: [string, string][] = [
      ["FECHA", fechaCl(cot.fecha)],
      ["VÁLIDA", `${cot.validez_dias} días`],
      ["ESTADO", cot.estado],
    ];
    if (cot.receptor_giro) rightRows.splice(1, 0, ["GIRO", cot.receptor_giro]);

    pdf.fontSize(8);
    for (let i = 0; i < Math.max(leftRows.length, rightRows.length); i++) {
      const yy = y + i * 13;
      if (leftRows[i]) {
        pdf.font("Helvetica-Bold").fillColor(INK).text(`${leftRows[i][0]}:`, L, yy, { continued: true, lineBreak: false });
        pdf.font("Helvetica").text(` ${leftRows[i][1]}`, { width: colMid - L - 8, lineBreak: false });
      }
      if (rightRows[i]) {
        pdf.font("Helvetica-Bold").fillColor(INK).text(`${rightRows[i][0]}:`, colMid, yy, {
          continued: true,
          lineBreak: false,
        });
        pdf.font("Helvetica").text(` ${rightRows[i][1]}`, { width: R - colMid - 4, lineBreak: false });
      }
    }
    y += Math.max(leftRows.length, rightRows.length) * 13 + 6;
    pdf.moveTo(L, y).lineTo(R, y).stroke();
    y += 10;

    // Tabla
    const cols = { n: L, desc: L + 28, cant: L + usable * 0.58, punit: L + usable * 0.72, monto: L + usable * 0.86 };
    pdf.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
    pdf.text("Nº", cols.n, y, { width: 24, lineBreak: false });
    pdf.text("DESCRIPCIÓN", cols.desc, y, { width: cols.cant - cols.desc - 4, lineBreak: false });
    pdf.text("CANT.", cols.cant, y, { width: 50, align: "right", lineBreak: false });
    pdf.text("PRECIO UNIT.", cols.punit, y, { width: 70, align: "right", lineBreak: false });
    pdf.text("MONTO", cols.monto, y, { width: R - cols.monto, align: "right", lineBreak: false });
    y += 12;
    pdf.moveTo(L, y).lineTo(R, y).strokeColor("#bbbbbb").lineWidth(0.6).stroke();
    y += 6;

    pdf.font("Helvetica").fontSize(9).fillColor(INK);
    cot.items.forEach((it, idx) => {
      const yy = y;
      const nombre = it.exento ? `${it.nombre} (exento)` : it.nombre;
      pdf.text(String(idx + 1), cols.n, yy, { width: 24, lineBreak: false });
      pdf.text(nombre || "", cols.desc, yy, { width: cols.cant - cols.desc - 4 });
      const after = pdf.y;
      pdf.text(String(it.cantidad), cols.cant, yy, { width: 50, align: "right", lineBreak: false });
      pdf.text(`$${clpPlain(it.precio)}`, cols.punit, yy, { width: 70, align: "right", lineBreak: false });
      pdf.text(`$${clpPlain(Math.round(it.cantidad * it.precio))}`, cols.monto, yy, {
        width: R - cols.monto,
        align: "right",
        lineBreak: false,
      });
      y = Math.max(after, yy + 12) + 4;
    });

    y = Math.min(Math.max(y + 12, pageH - 200), pageH - 160);
    const totX = R - 200;
    const line = (label: string, value: string, bold = false) => {
      pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 9).fillColor(INK);
      pdf.text(label, totX, y, { width: 110, lineBreak: false });
      pdf.text(value, totX + 100, y, { width: 100, align: "right", lineBreak: false });
      y += bold ? 15 : 13;
    };
    if (cot.neto) line("NETO $", clpPlain(cot.neto));
    if (cot.exento) line("EXENTO $", clpPlain(cot.exento));
    line("I.V.A. (19%) $", clpPlain(cot.iva));
    pdf.moveTo(totX, y).lineTo(R, y).strokeColor(INK).lineWidth(1).stroke();
    y += 3;
    line("TOTAL $", clpPlain(cot.total), true);
    pdf.moveTo(totX, y - 2).lineTo(R, y - 2).strokeColor(INK).lineWidth(1).stroke();

    if (cot.notas) {
      y += 10;
      pdf.font("Helvetica-Bold").fontSize(8).fillColor(INK).text("Notas:", L, y, { lineBreak: false });
      pdf.font("Helvetica").fontSize(8).fillColor(MUTED).text(cot.notas, L + 40, y, { width: usable - 40 });
    }

    pdf.font("Helvetica").fontSize(7).fillColor(MUTED);
    pdf.text(
      "Documento comercial. No constituye DTE ni boleta tributaria.",
      L,
      pageH - 36,
      { width: usable, align: "center", lineBreak: false },
    );
    pdf.text(`Cotización generada · ${fechaCl(cot.fecha)}`, L, pageH - 22, {
      width: usable,
      align: "center",
      lineBreak: false,
    });

    pdf.end();
  });
}
