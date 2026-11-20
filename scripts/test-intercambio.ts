/**
 * Intercambio: a partir de un EnvioDTE recibido genera acuse, recibos (Ley 19.983) y resultado comercial.
 * Verifica todas las firmas; con XML_OUT deja los archivos para validar contra el XSD oficial.
 */
import fs from "fs";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { parseCaf } from "../src/lib/sii/caf";
import { loadP12, type CertMaterial } from "../src/lib/sii/cert";
import { emitirEnvioCompleto } from "../src/lib/sii/envio";
import { leerEnvioDte, generarRecepcionEnvio, generarEnvioRecibos, generarResultadoDte } from "../src/lib/sii/intercambio";

let fail = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${extra ? "  — " + extra : ""}`);
  if (!cond) fail++;
};
/** Verifica cada <Signature> del documento (no solo la primera). */
function firmasOk(xml: string, cert: CertMaterial) {
  const sigs = xml.match(/<Signature[\s\S]*?<\/Signature>/g) || [];
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
    `<DA><RE>76192083-9</RE><RS>EMPRESA TEST SPA</RS><TD>33</TD>` +
    `<RNG><D>1</D><H>100</H></RNG><FA>2026-01-01</FA>` +
    `<RSAPK><M>AKxx</M><E>Aw==</E></RSAPK><IDK>300</IDK></DA>` +
    `<FRMA algoritmo="SHA1withRSA">ZmFrZQ==</FRMA>` +
    `</CAF>` +
    `<RSASK>${sk}</RSASK>` +
    `<RSAPUBK>${pub}</RSAPUBK>` +
    `</AUTORIZACION>`
  );
}


const emisorCert = loadP12(makeP12("11111111-1", "1234"), "1234");
const nuestroCert = loadP12(makeP12("22222222-2", "1234"), "1234");
const caf = parseCaf(makeCaf());
const NUESTRO_RUT = "55666777-8";
const emisor = { rut: "76192083-9", razonSocial: "PROVEEDOR SII", giro: "Servicios", acteco: "620100", direccion: "Calle 1", comuna: "Santiago" };
const mk2 = (folio: number, rutRecep: string) => emitirEnvioCompleto({
  caf, cert: emisorCert,
  dte: { tipoDte: 33, folio, fechaEmision: "2026-11-19", caf, emisor, receptor: { rut: rutRecep, razonSocial: "NOSOTROS SPA", giro: "Comercio", direccion: "X", comuna: "Ñuñoa" }, items: [{ nombre: "Item", cantidad: 1, precio: 1000 * folio }] },
  caratula: { rutEmisor: emisor.rut, rutEnvia: "11111111-1", fechaResolucion: "2026-01-01", nroResolucion: 0 },
}).envioXml;

// En el intercambio real la carátula trae como receptor a nuestra empresa (no al SII).
const paraNosotros = (x: string) => x.replace(/<RutReceptor>[^<]*<\/RutReceptor>/, `<RutReceptor>${NUESTRO_RUT}</RutReceptor>`);
const env = leerEnvioDte(paraNosotros(mk2(7, NUESTRO_RUT)));
check("Lee carátula y DTE", env.setId === "SetDoc" && env.dtes.length === 1 && env.dtes[0].folio === 7 && env.dtes[0].mntTotal === 8330, JSON.stringify(env.dtes[0]));
const otro = leerEnvioDte(mk2(8, "99999999-9"));

const r = { rutResponde: NUESTRO_RUT, contacto: { nombre: "Contacto", mail: "a@b.cl" }, tstamp: new Date("2026-11-19T10:00:00") };
const acuse = generarRecepcionEnvio(env, { ...r, nombreArchivo: "envio.xml" }, nuestroCert);
check("Acuse: envío conforme y DTE OK", /<EstadoRecepEnv>0<\/EstadoRecepEnv>/.test(acuse) && /<EstadoRecepDTE>0<\/EstadoRecepDTE>/.test(acuse));
check("Acuse: firma", firmasOk(acuse, nuestroCert));
const acuseMal = generarRecepcionEnvio(otro, { ...r, nombreArchivo: "otro.xml" }, nuestroCert);
check("Acuse: RUT receptor ajeno → estado 3", /<EstadoRecepEnv>3<\/EstadoRecepEnv>/.test(acuseMal) && /<EstadoRecepDTE>3<\/EstadoRecepDTE>/.test(acuseMal));

const recibos = generarEnvioRecibos(env, { ...r, recinto: "Oficina central", rutFirma: "22222222-2" }, nuestroCert);
check("Recibos: declaración Ley 19.983 y recinto", /Ley 19\.983/.test(recibos) && /<Recinto>Oficina central<\/Recinto>/.test(recibos));
check("Recibos: firma del recibo y del set (2)", (recibos.match(/<Signature[ >]/g) || []).length === 2 && firmasOk(recibos, nuestroCert));

const resultado = generarResultadoDte(env, r, () => ({ estado: 2, glosa: "Monto no corresponde" }), nuestroCert);
check("Resultado: rechazo con CodRchDsc", /<EstadoDTE>2<\/EstadoDTE><EstadoDTEGlosa>Monto no corresponde<\/EstadoDTEGlosa><CodRchDsc>-1<\/CodRchDsc>/.test(resultado.replace(/\n/g, "")));
check("Resultado: firma", firmasOk(resultado, nuestroCert));
let err = "";
try { leerEnvioDte("<foo/>"); } catch (e) { err = String(e); }
check("Archivo que no es EnvioDTE se rechaza", /no es un EnvioDTE/.test(err));

if (process.env.XML_OUT) {
  for (const [n, x] of [["Acuse", acuse], ["Recibos", recibos], ["Resultado", resultado]] as const) fs.writeFileSync(`${process.env.XML_OUT}/${n}.xml`, x, "latin1");
}
if (fail) { console.log(`\n${fail} fallas`); process.exit(1); }
console.log("\n🎉 OK");
