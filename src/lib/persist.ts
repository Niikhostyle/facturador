import mysql from "mysql2/promise";
import { ensureAdminBootstrap, getPlatform, replacePlatform, serializePlatform } from "./platform";

/**
 * Persistencia en MySQL/MariaDB: el estado completo de la plataforma (multi-tenant)
 * se guarda como JSON en `app_state` (id = 1).
 */

const g = globalThis as typeof globalThis & {
  __facturadorPool?: mysql.Pool;
  __facturadorLoaded?: Promise<void>;
};

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
  const [rows] = await p.query<mysql.RowDataPacket[]>("SELECT data FROM app_state WHERE id = 1");
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

export async function save(): Promise<void> {
  await pool().query(
    "INSERT INTO app_state (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
    [JSON.stringify(serializePlatform())],
  );
}
