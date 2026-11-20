/**
 * Boleta 39/41: totales con IVA incluido, receptor anónimo, firmas y (con XML_OUT) EnvioBOLETA para validar contra EnvioBOLETA_v11.xsd.
 */
import fs from "fs";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { parseCaf } from "../src/lib/sii/caf";
import { loadP12, type CertMaterial } from "../src/lib/sii/cert";
import { generarBoletaFirmada, generarEnvioBoleta, totalesBoleta } from "../src/lib/sii/boleta";
import { verificarTed } from "../src/lib/sii/ted";

let fail = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? "  — " + extra : ""}`);
  if (!cond) fail++;
};
function firmasOk(xml: string, cert: CertMaterial) {
  const sigs = xml.match(/<Signature[ >][\s\S]*?<\/Signature>/g) || [];
  return sigs.length > 0 && sigs.every((s) => { const v = new SignedXml({ publicCert: cert.certPem }); v.loadSignature(s); return v.checkSignature(xml); });
}
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

// ---- 2) CAF sintético ----
function makeCaf(): string {
  const k = forge.pki.rsa.generateKeyPair(1024);
  const sk = forge.pki.privateKeyToPem(k.privateKey);
  const pub = forge.pki.publicKeyToPem(k.publicKey);
  return (
    `<AUTORIZACION>` +
    `<CAF version="1.0">` +
    `<DA><RE>76192083-9</RE><RS>EMPRESA TEST SPA</RS><TD>39</TD>` +
    `<RNG><D>1</D><H>100</H></RNG><FA>2026-01-01</FA>` +
    `<RSAPK><M>AKxx</M><E>Aw==</E></RSAPK><IDK>300</IDK></DA>` +
    `<FRMA algoritmo="SHA1withRSA">ZmFrZQ==</FRMA>` +
    `</CAF>` +
    `<RSASK>${sk}</RSASK>` +
    `<RSAPUBK>${pub}</RSAPUBK>` +
    `</AUTORIZACION>`
  );
}


const cert = loadP12(makeP12("11111111-1", "1234"), "1234");
const caf = parseCaf(makeCaf());
const emisor = { rut: "76192083-9", razonSocial: "EMPRESA TEST SPA", giro: "Comercio", direccion: "Calle 1", comuna: "Santiago" };

const t = totalesBoleta([{ nombre: "Café", cantidad: 2, precio: 1190 }, { nombre: "Libro", cantidad: 1, precio: 5000, exento: true }], 39);
check("Totales: neto e IVA despejados del bruto", t.neto === 2000 && t.iva === 380 && t.exento === 5000 && t.total === 7380, JSON.stringify(t));
check("41: todo exento", totalesBoleta([{ nombre: "x", cantidad: 1, precio: 1000 }], 41).exento === 1000);

const b1 = generarBoletaFirmada({ tipoDte: 39, folio: 1, fechaEmision: "2026-11-19", emisor, caf, casoSet: "CASO-1",
  items: [{ nombre: "Café", cantidad: 2, precio: 1190 }, { nombre: "Libro", cantidad: 1, precio: 5000, exento: true }] }, cert);
check("Receptor anónimo 66666666-6", /<RUTRecep>66666666-6<\/RUTRecep>/.test(b1.xml));
check("IndServicio 3 y etiquetas de emisor de boleta", /<IndServicio>3<\/IndServicio>/.test(b1.xml) && /<RznSocEmisor>/.test(b1.xml) && !/<RznSoc>/.test(b1.xml));
check("Referencia del set (CodRef SET)", /<CodRef>SET<\/CodRef>\s*<RazonRef>CASO-1<\/RazonRef>/.test(b1.xml));
const dd = b1.xml.match(/<DD>[\s\S]*?<\/DD>/)![0]; const frmt = b1.xml.match(/<FRMT[^>]*>([^<]*)<\/FRMT>/)![1];
check("Timbre (TED) verifica con el CAF", verificarTed(dd.replace(/>\s+</g, "><"), frmt, caf));
const b2 = generarBoletaFirmada({ tipoDte: 39, folio: 2, fechaEmision: "2026-11-19", emisor, caf, items: [{ nombre: "Pan", cantidad: 3, precio: 300 }] }, cert);
const envio = generarEnvioBoleta([b1, b2], { rutEmisor: emisor.rut, rutEnvia: "11111111-1", fechaResolucion: "2026-01-01", nroResolucion: 0 }, cert);
check("EnvioBOLETA: 3 firmas válidas (2 boletas + set)", (envio.match(/<Signature[ >]/g) || []).length === 3 && firmasOk(envio, cert));
check("EnvioBOLETA: SubTotDTE 39 x2", /<TpoDTE>39<\/TpoDTE>\s*<NroDTE>2<\/NroDTE>/.test(envio));
if (process.env.XML_OUT) fs.writeFileSync(`${process.env.XML_OUT}/EnvioBOLETA.xml`, envio, "latin1");
if (fail) { console.log(`\n${fail} fallas`); process.exit(1); }
console.log("\n🎉 OK");
