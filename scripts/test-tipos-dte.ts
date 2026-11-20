/**
 * Reglas por tipo de DTE (34, 61, 56, 52) sin tocar el SII: XML correcto y firma válida.
 * Usa los mismos fixtures sintéticos que test-dte.ts.
 */
import fs from "fs";
import forge from "node-forge";
import { parseCaf } from "../src/lib/sii/caf";
import { loadP12, type CertMaterial } from "../src/lib/sii/cert";
import { construirTed, verificarTed } from "../src/lib/sii/ted";
import { construirDocumento } from "../src/lib/sii/dte";
import { verificarFirma } from "../src/lib/sii/sign";
import { emitirEnvioCompleto } from "../src/lib/sii/envio";

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

const emisor = { rut: "76192083-9", razonSocial: "EMPRESA TEST SPA", giro: "Servicios", acteco: "620100", direccion: "Calle 1", comuna: "Santiago" };
const receptor = { rut: "55666777-8", razonSocial: "CLIENTE SPA", giro: "Comercio", direccion: "Calle 2", comuna: "Ñuñoa" };
const cert: CertMaterial = loadP12(makeP12("11111111-1", "1234"), "1234");
const caf = parseCaf(makeCaf());
const caratula = { rutEmisor: emisor.rut, rutEnvia: "11111111-1", fechaResolucion: "2026-01-01", nroResolucion: 0 };
const firmar = (dte: Parameters<typeof construirDocumento>[0]) => {
  const out = emitirEnvioCompleto({ caf, cert, dte, caratula });
  return { out, ok: verificarFirma(out.envioXml, cert).ok };
};
const base = { folio: 5, fechaEmision: "2026-11-19", caf, emisor, receptor };

// 34: todo exento, sin IVA aunque el ítem no venga marcado
{
  const d = construirDocumento({ ...base, tipoDte: 34, items: [{ nombre: "Asesoría", cantidad: 2, precio: 50000 }] });
  check("34: MntExe = total, sin IVA ni neto", /<MntExe>100000<\/MntExe>/.test(d.documento) && !/<IVA>|<MntNeto>/.test(d.documento) && d.totales.total === 100000);
  check("34: ítem con IndExe", /<IndExe>1<\/IndExe>/.test(d.documento));
}
// 61 anula factura: referencia completa
{
  const refs = [{ tipoDoc: "33", folio: "40", fecha: "2026-11-17", codigoRef: 1 as const, razon: "Anula factura" }];
  const d = construirDocumento({ ...base, tipoDte: 61, items: [{ nombre: "Servicio", cantidad: 1, precio: 100000 }], referencias: refs });
  check("61: Referencia con CodRef 1", /<Referencia><NroLinRef>1<\/NroLinRef><TpoDocRef>33<\/TpoDocRef><FolioRef>40<\/FolioRef><FchRef>2026-11-17<\/FchRef><CodRef>1<\/CodRef>/.test(d.documento));
  check("61: IVA 19% y total", d.totales.iva === 19000 && d.totales.total === 119000);
}
// 61 corrige texto: línea sin precio, total 0
{
  const refs = [{ tipoDoc: "33", folio: "40", fecha: "2026-11-17", codigoRef: 2 as const, razon: "Corrige giro" }];
  const d = construirDocumento({ ...base, tipoDte: 61, items: [{ nombre: "CORRIGE GIRO DEL RECEPTOR", cantidad: 1, precio: 0 }], referencias: refs });
  check("61 texto: sin QtyItem/PrcItem, MontoItem 0", !/<PrcItem>|<QtyItem>/.test(d.documento) && /<MontoItem>0<\/MontoItem>/.test(d.documento));
  check("61 texto: MntTotal 0", /<MntTotal>0<\/MntTotal>/.test(d.documento));
}
// 52 guía: IndTraslado, sin FmaPago
{
  const d = construirDocumento({ ...base, tipoDte: 52, indTraslado: 5, items: [{ nombre: "Traslado bodega", cantidad: 3, precio: 0 }] });
  check("52: IndTraslado después de FchEmis", /<FchEmis>2026-11-19<\/FchEmis><IndTraslado>5<\/IndTraslado>/.test(d.documento));
  check("52: sin FmaPago", !/<FmaPago>/.test(d.documento));
}
// 56 y firma de cada tipo dentro del EnvioDTE
for (const [tipo, extra] of [
  [34, {}],
  [33, { items: [{ nombre: "Afecto", cantidad: 1, precio: 1000 }, { nombre: "Exento", cantidad: 1, precio: 500, exento: true }] }],
  [56, { referencias: [{ tipoDoc: "33", folio: "40", fecha: "2026-11-17", codigoRef: 3 as const, razon: "Intereses" }] }],
  [52, { indTraslado: 1 as const }],
  [61, { referencias: [{ tipoDoc: "33", folio: "40", fecha: "2026-11-17", codigoRef: 1 as const, razon: "Anula" }] }],
] as const) {
  const r = firmar({ ...base, tipoDte: tipo, items: [{ nombre: "Item", cantidad: 1, precio: 1000 }], ...(extra as object) } as Parameters<typeof construirDocumento>[0]);
  check(`${tipo}: EnvioDTE firmado verifica`, r.ok);
  // Para validar contra el XSD oficial: XML_OUT=<carpeta> npx tsx scripts/test-tipos-dte.ts
  if (process.env.XML_OUT) fs.writeFileSync(`${process.env.XML_OUT}/EnvioDTE_T${tipo}.xml`, r.out.envioXml, "latin1");
}
if (fail) { console.log(`\n${fail} fallas`); process.exit(1); }
console.log("\n🎉 OK");
