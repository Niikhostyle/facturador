-- Esquema de la base (MariaDB/MySQL). La app lo crea sola al arrancar (src/lib/persist.ts);
-- este archivo sirve para crearlo a mano. Sin datos: no versionar dumps (hashes, datos de empresas).
CREATE TABLE IF NOT EXISTS app_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  data LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
