/**
 * Lee un catálogo pegado desde Excel o un .csv: una fila por producto.
 * Columnas por nombre de encabezado (nombre, precio, codigo, unidad, exento) o, sin encabezado,
 * en ese orden. Separador ; , o tabulador (Excel en Chile exporta con ;).
 * shortcut: no soporta comillas con separadores adentro; usar un parser CSV real si aparecen.
 */
export type FilaProducto = { nombre: string; precio: number; codigo: string; unidad: string; exento: boolean };

const COLUMNAS = ["nombre", "precio", "codigo", "unidad", "exento"] as const;

function norm(s: string) {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "$ 12.990" → 12990. Los puntos son miles en CLP; una coma decimal se descarta. */
function parsePrecio(s: string): number {
  const limpio = s.replace(/[$\s]/g, "").split(",")[0].replace(/\./g, "");
  return limpio === "" ? NaN : Number(limpio);
}

export function parseCsvProductos(texto: string): FilaProducto[] {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return [];
  const sep = lineas[0].includes("\t") ? "\t" : lineas[0].includes(";") ? ";" : ",";
  const celdas = lineas.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));

  const head = celdas[0].map(norm);
  const conEncabezado = head.includes("nombre") || head.includes("precio");
  const idx = COLUMNAS.map((c, i) => (conEncabezado ? head.indexOf(c) : i));
  const datos = conEncabezado ? celdas.slice(1) : celdas;

  return datos.map((c) => {
    const get = (k: number) => (idx[k] >= 0 ? c[idx[k]] ?? "" : "");
    return {
      nombre: get(0),
      precio: parsePrecio(get(1)),
      codigo: get(2),
      unidad: get(3).toUpperCase() || "UN",
      exento: ["si", "sí", "s", "x", "1", "true", "exento"].includes(norm(get(4))),
    };
  });
}
