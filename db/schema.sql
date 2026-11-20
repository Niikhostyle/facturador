-- Esquema de la base (MariaDB/MySQL). La app lo crea sola al arrancar (src/lib/persist.ts);
-- este archivo sirve para crearlo a mano. Sin datos: no versionar dumps (hashes, datos de empresas).
CREATE TABLE IF NOT EXISTS app_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  data LONGTEXT NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0, -- control optimista: evita que un proceso con estado viejo pise al otro
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Nómina pública de personas jurídicas del SII (autocompletar /empresa).
-- Se llena con: npx tsx scripts/import-nomina-sii.ts <carpeta con PUB_NOMBRES_PJ.zip y PUB_NOM_ACTECOS.zip>
-- Descarga: https://www.sii.cl/sobre_el_sii/nominapersonasjuridicas.html
CREATE TABLE IF NOT EXISTS sii_nomina_nombre (
  rut INT UNSIGNED NOT NULL PRIMARY KEY,
  dv CHAR(1) NOT NULL,
  razon_social VARCHAR(300) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sii_nomina_acteco (
  rut INT UNSIGNED NOT NULL,
  codigo INT UNSIGNED NOT NULL,
  glosa VARCHAR(300) NOT NULL,
  fecha DATE NULL,
  PRIMARY KEY (rut, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
