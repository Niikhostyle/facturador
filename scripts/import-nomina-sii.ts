/**
 * Importa la nómina pública de personas jurídicas del SII a MySQL.
 * Descarga (desde https://www.sii.cl/sobre_el_sii/nominapersonasjuridicas.html):
 *   PUB_NOMBRES_PJ.zip y PUB_NOM_ACTECOS.zip
 * Uso: npx tsx scripts/import-nomina-sii.ts <carpeta-con-los-zip>
 * Carga en tablas _new y las intercambia al final (sin cortar el servicio).
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { spawn } from "child_process";

const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// Las nóminas vienen en UTF-8, separadas por tabulador, con encabezado.
async function* filas(zip: string, entry: string) {
  const unzip = spawn("unzip", ["-p", zip, entry]);
  const rl = readline.createInterface({ input: unzip.stdout.setEncoding("utf8"), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    if (line.trim()) yield line.split("\t");
  }
}

function fecha(s: string | undefined): string | null {
  const m = s?.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Uso: tsx scripts/import-nomina-sii.ts <carpeta>");
  const { pool } = await import("../src/lib/persist");
  const p = pool();

  await p.query("DROP TABLE IF EXISTS sii_nomina_nombre_new, sii_nomina_acteco_new");
  await p.query(`CREATE TABLE sii_nomina_nombre_new (
    rut INT UNSIGNED NOT NULL PRIMARY KEY, dv CHAR(1) NOT NULL, razon_social VARCHAR(300) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await p.query(`CREATE TABLE sii_nomina_acteco_new (
    rut INT UNSIGNED NOT NULL, codigo INT UNSIGNED NOT NULL, glosa VARCHAR(300) NOT NULL, fecha DATE NULL,
    PRIMARY KEY (rut, codigo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  async function cargar(sql: string, rows: AsyncIterable<unknown[] | null>) {
    let batch: unknown[][] = [];
    let total = 0;
    for await (const r of rows) {
      if (!r) continue;
      batch.push(r);
      if (batch.length === 5000) { await p.query(sql, [batch]); total += batch.length; batch = []; }
    }
    if (batch.length) { await p.query(sql, [batch]); total += batch.length; }
    return total;
  }

  // RUT DV COD_SUBTIPO RAZON_SOCIAL FECHA_INICIO_VIG FECHA_TG_VIG — solo la razón social vigente.
  const nNombres = await cargar(
    "INSERT INTO sii_nomina_nombre_new (rut, dv, razon_social) VALUES ? ON DUPLICATE KEY UPDATE dv = VALUES(dv), razon_social = VALUES(razon_social)",
    (async function* () {
      for await (const c of filas(path.join(dir, "PUB_NOMBRES_PJ.zip"), "PUB_NOMBRES_PJ.txt")) {
        const rut = Number(c[0]);
        if (!rut || c[5]?.trim() || !c[3]?.trim()) continue;
        yield [rut, c[1].trim().toUpperCase().slice(0, 1), c[3].trim().slice(0, 300)];
      }
    })(),
  );

  // RUT DV CODIGO GLOSA FECHA AFECTA_IVA CATEGORIA
  const nActecos = await cargar(
    "INSERT IGNORE INTO sii_nomina_acteco_new (rut, codigo, glosa, fecha) VALUES ?",
    (async function* () {
      for await (const c of filas(path.join(dir, "PUB_NOM_ACTECOS.zip"), "PUB_NOM_ACTECOS.txt")) {
        const rut = Number(c[0]);
        const codigo = Number(c[2]);
        if (!rut || !codigo) continue;
        yield [rut, codigo, (c[3] || "").trim().slice(0, 300), fecha(c[4]?.trim())];
      }
    })(),
  );

  if (nNombres < 100_000) throw new Error(`Muy pocas razones sociales (${nNombres}); no se reemplaza la nómina.`);

  await p.query("CREATE TABLE IF NOT EXISTS sii_nomina_nombre LIKE sii_nomina_nombre_new");
  await p.query("CREATE TABLE IF NOT EXISTS sii_nomina_acteco LIKE sii_nomina_acteco_new");
  await p.query(`RENAME TABLE sii_nomina_nombre TO sii_nomina_nombre_old, sii_nomina_nombre_new TO sii_nomina_nombre,
                 sii_nomina_acteco TO sii_nomina_acteco_old, sii_nomina_acteco_new TO sii_nomina_acteco`);
  await p.query("DROP TABLE sii_nomina_nombre_old, sii_nomina_acteco_old");

  // Autochequeo con un RUT de la propia nómina.
  const { buscarNomina } = await import("../src/lib/sii/nomina");
  const r = await buscarNomina(50009350);
  console.log(`✅ ${nNombres} razones sociales, ${nActecos} actividades. Ejemplo:`, JSON.stringify(r));
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
