/**
 * Libro de Compras y Ventas (IECV): totales, firma y (con XML_OUT) archivo para validar contra LibroCV_v10.xsd.
 */
import fs from "fs";
import forge from "node-forge";
import { loadP12 } from "../src/lib/sii/cert";
import { verificarFirma } from "../src/lib/sii/sign";
import { generarLibroCV, generarLibroGuias } from "../src/lib/sii/libro";

let fail = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? "  — " + extra : ""}`);
  if (!cond) fail++;
};
// ---- 1) Certificado digital sintético (.p12) ----
function makeP12(rut: string, pass: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 864e5);
  const attrs = [
    { name: "commonName", value: "EMPRESA TEST" },
    { name: "serialNumber", value: rut },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], pass, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
}


const cert = loadP12(makeP12("11111111-1", "1234"), "1234");
const base = { periodo: "2026-11", rutEmisor: "76192083-9", rutEnvia: "11111111-1", fchResol: "2026-01-01", nroResol: 0 } as const;

const ventas = generarLibroCV({
  ...base, operacion: "VENTA", tipoLibro: "ESPECIAL", folioNotificacion: 1,
  lineas: [
    { tpoDoc: 33, nroDoc: 1, fchDoc: "2026-11-02", rutDoc: "55666777-8", rznSoc: "CLIENTE SPA", mntNeto: 100000, mntIva: 19000, mntTotal: 119000 },
    { tpoDoc: 33, nroDoc: 2, fchDoc: "2026-11-03", rutDoc: "55666777-8", rznSoc: "CLIENTE SPA", mntNeto: 1000, mntExe: 500, mntIva: 190, mntTotal: 1690 },
    { tpoDoc: 33, nroDoc: 3, fchDoc: "2026-11-03", rutDoc: "55666777-8", rznSoc: "CLIENTE SPA", mntTotal: 0, anulado: true },
    { tpoDoc: 34, nroDoc: 1, fchDoc: "2026-11-04", rutDoc: "55666777-8", rznSoc: "CLIENTE SPA", mntExe: 50000, mntTotal: 50000 },
    { tpoDoc: 61, nroDoc: 1, fchDoc: "2026-11-05", rutDoc: "55666777-8", rznSoc: "CLIENTE SPA", mntNeto: 10000, mntIva: 1900, mntTotal: 11900 },
  ],
}, cert);
check("Ventas: firma verifica", verificarFirma(ventas, cert).ok);
check("Ventas: totales factura 33 (2 vivas, 1 anulada)", /<TpoDoc>33<\/TpoDoc><TotDoc>2<\/TotDoc><TotAnulado>1<\/TotAnulado><TotMntExe>500<\/TotMntExe><TotMntNeto>101000<\/TotMntNeto><TotMntIVA>19190<\/TotMntIVA><TotMntTotal>120690<\/TotMntTotal>/.test(ventas));
check("Ventas: NC con montos positivos", /<TpoDoc>61<\/TpoDoc><NroDoc>1<\/NroDoc><TasaImp>19<\/TasaImp>[\s\S]*?<MntTotal>11900<\/MntTotal>/.test(ventas));
check("Ventas: folio de notificación", /<TipoLibro>ESPECIAL<\/TipoLibro><TipoEnvio>TOTAL<\/TipoEnvio><FolioNotificacion>1<\/FolioNotificacion>/.test(ventas));

const compras = generarLibroCV({
  ...base, operacion: "COMPRA", tipoLibro: "MENSUAL", factorProporcionalidad: 0.6,
  lineas: [
    { tpoDoc: 33, nroDoc: 10, fchDoc: "2026-11-02", rutDoc: "77888999-0", rznSoc: "PROVEEDOR SPA", mntNeto: 100000, mntIva: 19000, mntTotal: 119000 },
    { tpoDoc: 33, nroDoc: 11, fchDoc: "2026-11-03", rutDoc: "77888999-0", rznSoc: "PROVEEDOR SPA", mntNeto: 10000, mntIva: 0, ivaNoRec: { cod: 4, monto: 1900 }, mntTotal: 11900 },
    { tpoDoc: 33, nroDoc: 12, fchDoc: "2026-11-03", rutDoc: "77888999-0", rznSoc: "PROVEEDOR SPA", mntNeto: 20000, mntIva: 0, ivaUsoComun: 3800, mntTotal: 23800 },
  ],
}, cert);
check("Compras: firma verifica", verificarFirma(compras, cert).ok);
check("Compras: IVA no recuperable y uso común", /<TotIVANoRec><CodIVANoRec>4<\/CodIVANoRec><TotOpIVANoRec>1<\/TotOpIVANoRec><TotMntIVANoRec>1900<\/TotMntIVANoRec><\/TotIVANoRec><TotOpIVAUsoComun>1<\/TotOpIVAUsoComun><TotIVAUsoComun>3800<\/TotIVAUsoComun><FctProp>0.60<\/FctProp><TotCredIVAUsoComun>2280<\/TotCredIVAUsoComun>/.test(compras));
let errEsp = "";
try { generarLibroCV({ ...base, operacion: "VENTA", tipoLibro: "ESPECIAL", lineas: [] }, cert); } catch (e) { errEsp = String(e); }
check("Especial sin folio de notificación se rechaza", /folio de notificaci/.test(errEsp));

const guias = generarLibroGuias({
  ...base, tipoLibro: "ESPECIAL", folioNotificacion: 2,
  lineas: [
    { folio: 1, tpoOper: 5, fchDoc: "2026-11-02", rutDoc: "76192083-9", rznSoc: "EMPRESA TEST SPA", mntTotal: 0 },
    { folio: 2, tpoOper: 1, fchDoc: "2026-11-03", rutDoc: "55666777-8", rznSoc: "CLIENTE SPA", mntNeto: 10000, mntIva: 1900, mntTotal: 11900, ref: { tipo: 33, folio: 9, fecha: "2026-11-04" } },
    { folio: 3, tpoOper: 1, fchDoc: "2026-11-03", rutDoc: "55666777-8", rznSoc: "CLIENTE SPA", mntNeto: 5000, mntIva: 950, mntTotal: 5950, anulado: 2 },
  ],
}, cert);
check("Guías: firma verifica", verificarFirma(guias, cert).ok);
check("Guías: resumen (1 anulada, 1 venta, 1 traslado interno)", /<TotGuiaAnulada>1<\/TotGuiaAnulada><TotGuiaVenta>1<\/TotGuiaVenta><TotMntGuiaVta>11900<\/TotMntGuiaVta><TotTraslado><TpoTraslado>5<\/TpoTraslado><CantGuia>1<\/CantGuia><MntGuia>0<\/MntGuia><\/TotTraslado>/.test(guias));
check("Guías: referencia a la factura", /<TpoDocRef>33<\/TpoDocRef><FolioDocRef>9<\/FolioDocRef><FchDocRef>2026-11-04<\/FchDocRef>/.test(guias));

if (process.env.XML_OUT) {
  fs.writeFileSync(`${process.env.XML_OUT}/LibroGuias.xml`, guias, "latin1");
  fs.writeFileSync(`${process.env.XML_OUT}/LibroVentas.xml`, ventas, "latin1");
  fs.writeFileSync(`${process.env.XML_OUT}/LibroCompras.xml`, compras, "latin1");
}
if (fail) { console.log(`\n${fail} fallas`); process.exit(1); }
console.log("\n🎉 OK");
