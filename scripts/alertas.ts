/**
 * Alertas diarias por correo a cada empresa activa: folios (CAF) bajos/agotados/vencidos y certificado por vencer.
 * No repite el mismo aviso: guarda lo último enviado en data/alertas-estado.json.
 * Uso: npx tsx scripts/alertas.ts [--dry-run]   (lo corre scripts/tareas-diarias.sh)
 */
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const ESTADO = path.join(process.cwd(), "data", "alertas-estado.json");
// Avisos del certificado en estos días restantes (y una vez vencido).
const HITOS_CERT = [30, 15, 7, 1, 0];

async function main() {
  const { ensureLoaded } = await import("../src/lib/persist");
  const { getPlatform, runWithTenant } = await import("../src/lib/platform");
  const { cafEstado, certificadoEstado, getDb } = await import("../src/lib/store");
  const { enviarCorreo, plantillaCorreo, appUrl } = await import("../src/lib/mail");
  await ensureLoaded();
  const prev: Record<string, string> = fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, "utf8")) : {};
  const next: Record<string, string> = { ...prev };
  let enviados = 0;

  for (const t of getPlatform().tenantsMeta.filter((x) => x.estado !== "suspendida")) {
    await runWithTenant(t.id, async () => {
      const emp = getDb().empresa;
      const to = t.email_contacto || emp.email;
      if (!to) return;
      const avisos: string[] = [];

      const caf = cafEstado(emp.ambiente).data.resumen.alertas;
      const firmaCaf = caf.map((a) => `${a.tipo_dte}:${a.alerta}`).sort().join(",");
      if (firmaCaf && firmaCaf !== prev[`caf:${t.id}`]) {
        const txt = { bajo: "quedan pocos folios", agotado: "se acabaron los folios", vencido: "el CAF venció" } as Record<string, string>;
        for (const a of caf) avisos.push(`Documento tipo ${a.tipo_dte}: ${txt[a.alerta] ?? a.alerta}. Pide un CAF nuevo en el SII y cárgalo en ${appUrl()}/caf.`);
      }
      next[`caf:${t.id}`] = firmaCaf;

      const cert = certificadoEstado().data as { dias_restantes?: number; vence_el?: string } | undefined;
      if (cert?.dias_restantes !== undefined) {
        const hito = HITOS_CERT.find((h) => cert.dias_restantes! <= h && (h === 0 || cert.dias_restantes! > (HITOS_CERT[HITOS_CERT.indexOf(h) + 1] ?? -1)));
        const clave = hito === undefined ? "" : String(hito);
        if (clave && clave !== prev[`cert:${t.id}`]) {
          avisos.push(
            cert.dias_restantes! < 0
              ? `Tu certificado digital venció el ${cert.vence_el}. Sin él no puedes emitir: súbelo en ${appUrl()}/certificado.`
              : `Tu certificado digital vence en ${cert.dias_restantes} día(s) (${cert.vence_el}). Renuévalo y súbelo en ${appUrl()}/certificado.`,
          );
        }
        next[`cert:${t.id}`] = clave;
      }

      if (!avisos.length) return;
      if (process.argv.includes("--dry-run")) {
        console.log(`[dry-run] ${emp.razon_social} → ${to}\n  - ${avisos.join("\n  - ")}`);
        return;
      }
      const { html, text } = plantillaCorreo(`Avisos de ${emp.razon_social}`, avisos, { texto: "Abrir el facturador", url: `${appUrl()}/dashboard` });
      try {
        await enviarCorreo({ to, subject: `Aviso del facturador: ${emp.razon_social}`, html, text });
        enviados++;
      } catch (e) {
        // Si no salió, no se marca como enviado: se reintenta mañana.
        next[`caf:${t.id}`] = prev[`caf:${t.id}`] ?? "";
        next[`cert:${t.id}`] = prev[`cert:${t.id}`] ?? "";
        console.error(`❌ ${emp.razon_social}:`, e instanceof Error ? e.message : e);
      }
    });
  }
  if (!process.argv.includes("--dry-run")) {
    fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
    fs.writeFileSync(ESTADO, JSON.stringify(next, null, 2));
  }
  console.log(`${new Date().toISOString()} alertas: ${enviados} correo(s) enviado(s)`);
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
