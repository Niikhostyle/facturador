import type { RowDataPacket } from "mysql2/promise";
import { pool } from "../persist";

/**
 * Búsqueda en la nómina pública de personas jurídicas del SII (importada con
 * scripts/import-nomina-sii.ts). shortcut: datos anuales y solo personas jurídicas;
 * si el SII publica una API sin captcha, cambiar a consulta en vivo.
 */
export type NominaSii = {
  rut: number;
  dv: string;
  razon_social: string;
  actividades: { codigo: string; glosa: string }[];
};

export async function buscarNomina(rut: number): Promise<NominaSii | null> {
  if (!Number.isInteger(rut) || rut <= 0 || rut > 99_999_999) return null;
  const p = pool();
  try {
    const [n] = await p.query<RowDataPacket[]>(
      "SELECT rut, dv, razon_social FROM sii_nomina_nombre WHERE rut = ?",
      [rut],
    );
    if (!n.length) return null;
    const [a] = await p.query<RowDataPacket[]>(
      "SELECT codigo, glosa FROM sii_nomina_acteco WHERE rut = ? ORDER BY fecha, codigo",
      [rut],
    );
    return {
      rut: n[0].rut,
      dv: n[0].dv,
      razon_social: n[0].razon_social,
      actividades: a.map((r) => ({ codigo: String(r.codigo).padStart(6, "0"), glosa: r.glosa })),
    };
  } catch (e) {
    // Tabla aún no importada: se comporta como "no encontrado".
    if ((e as { code?: string }).code === "ER_NO_SUCH_TABLE") return null;
    throw e;
  }
}
