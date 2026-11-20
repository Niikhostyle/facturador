/** Tasa de IVA en Chile. Único lugar donde se define: cambiarla aquí afecta a todo (DTE, cotizaciones, contable). */
export const TASA_IVA = 19;
export const IVA = TASA_IVA / 100;

/** IVA de un neto, con el mismo redondeo en todas las pantallas y en el XML del DTE. */
export const ivaDe = (neto: number) => Math.round(neto * IVA);
