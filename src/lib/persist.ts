import mysql from "mysql2/promise";
import { ensureAdminBootstrap, getPlatform, replacePlatform, serializePlatform } from "./platform";

/**
 * Persistencia en MySQL/MariaDB: el estado completo de la plataforma (multi-tenant)
 * se guarda como JSON en `app_state` (id = 1).
 */

const g = globalThis as typeof globalThis & {
  __facturadorPool?: mysql.Pool;
  __facturadorLoaded?: Promise<void>;
  __facturadorVersion?: number;
  __facturadorSaveChain?: Promise<void>;
};

/** Otro proceso (script, segundo servidor) guardó antes: este estado en memoria quedó viejo. */
export class ConflictoEstado extends Error {}

export function pool(): mysql.Pool {
  if (!g.__facturadorPool) {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SOCKET } = process.env;
    if (!DB_USER || !DB_NAME) throw new Error("Base de datos no configurada (DB_USER / DB_NAME).");
    g.__facturadorPool = mysql.createPool({
      ...(DB_SOCKET ? { socketPath: DB_SOCKET } : { host: DB_HOST || "localhost", port: Number(DB_PORT || 3306) }),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      connectionLimit: 5,
      charset: "utf8mb4",
    });
  }
  return g.__facturadorPool;
}

async function load(): Promise<void> {
  const p = pool();
  await p.query(
    `CREATE TABLE IF NOT EXISTS app_state (
       id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
       data LONGTEXT NOT NULL,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  try {
    await p.query("ALTER TABLE app_state ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 0");
  } catch (e) {
    if ((e as { code?: string }).code !== "ER_DUP_FIELDNAME") throw e;
  }
  const [rows] = await p.query<mysql.RowDataPacket[]>("SELECT data, version FROM app_state WHERE id = 1");
  g.__facturadorVersion = rows.length ? Number(rows[0].version) : 0;
  if (rows.length) {
    replacePlatform(JSON.parse(rows[0].data));
  } else {
    getPlatform();
  }
  ensureAdminBootstrap();
  if (!rows.length) await save();
}

export function ensureLoaded(): Promise<void> {
  if (!g.__facturadorLoaded) {
    g.__facturadorLoaded = load().catch((err) => {
      g.__facturadorLoaded = undefined;
      throw err;
    });
  }
  return g.__facturadorLoaded;
}

/**
 * Guarda con control de versión: si otro proceso guardó desde que cargamos, no se pisa su trabajo;
 * se lanza ConflictoEstado y la próxima petición recarga desde la base.
 * Los guardados de este proceso van en fila para no chocar entre sí.
 */
export function save(): Promise<void> {
  const run = async () => {
    const p = pool();
    const data = JSON.stringify(serializePlatform());
    const v = g.__facturadorVersion ?? 0;
    const [res] = await p.query<mysql.ResultSetHeader>(
      "UPDATE app_state SET data = ?, version = version + 1 WHERE id = 1 AND version = ?",
      [data, v],
    );
    if (res.affectedRows === 1) {
      g.__facturadorVersion = v + 1;
      return;
    }
    const [ins] = await p.query<mysql.ResultSetHeader>(
      "INSERT IGNORE INTO app_state (id, data, version) VALUES (1, ?, 1)",
      [data],
    );
    if (ins.affectedRows === 1) {
      g.__facturadorVersion = 1;
      return;
    }
    g.__facturadorLoaded = undefined; // fuerza recarga del estado bueno
    throw new ConflictoEstado("El estado cambió en otro proceso; se recargará desde la base.");
  };
  const next = (g.__facturadorSaveChain ?? Promise.resolve()).then(run, run);
  g.__facturadorSaveChain = next.catch(() => {});
  return next;
}
