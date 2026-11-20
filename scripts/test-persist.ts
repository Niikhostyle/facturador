/** Autochequeo del control de versión de persist.ts (usa la base real, reescribe los mismos datos). */
import fs from "fs";
import { spawnSync } from "child_process";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
(async () => {
  const { ensureLoaded, save, ConflictoEstado } = await import("../src/lib/persist");
  if (process.argv[2] === "otro") { await ensureLoaded(); await save(); process.exit(0); }
  await ensureLoaded();
  await Promise.all([save(), save(), save()]); // mismo proceso: en fila, sin conflicto
  console.log("✅ guardados concurrentes del mismo proceso");
  const r = spawnSync("npx", ["tsx", "scripts/test-persist.ts", "otro"], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("falló el proceso 'otro'");
  try { await save(); throw new Error("❌ debió detectar conflicto"); }
  catch (e) { if (!(e instanceof ConflictoEstado)) throw e; console.log("✅ estado viejo rechazado (ConflictoEstado)"); }
  await ensureLoaded(); await save();
  console.log("✅ tras recargar vuelve a guardar");
  process.exit(0);
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
