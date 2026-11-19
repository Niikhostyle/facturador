/**
 * Utilidades de RUT chileno.
 * El SII exige el RUT sin puntos y con guión: 12345678-9 (DV en mayúscula).
 */

/** Limpia a solo dígitos + DV, sin puntos ni guión. Ej: "12.345.678-9" -> "123456789" */
export function rutLimpio(rut: string): string {
  return (rut || "").toUpperCase().replace(/[^0-9K]/g, "");
}

/** Calcula el dígito verificador de un cuerpo numérico. */
export function calcularDv(cuerpo: string | number): string {
  const num = String(cuerpo).replace(/\D/g, "");
  let suma = 0;
  let mul = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    suma += parseInt(num[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/** Separa cuerpo y DV de un RUT en cualquier formato. */
export function partesRut(rut: string): { cuerpo: string; dv: string } {
  const limpio = rutLimpio(rut);
  if (limpio.length < 2) return { cuerpo: limpio, dv: "" };
  return { cuerpo: limpio.slice(0, -1), dv: limpio.slice(-1) };
}

/** Formato SII: 12345678-9 (sin puntos, DV mayúscula). */
export function rutSii(rut: string): string {
  const { cuerpo, dv } = partesRut(rut);
  return cuerpo ? `${cuerpo}-${dv}` : "";
}

/** Formato visual chileno: 12.345.678-9 (puntos + guión). Útil al tipear. */
export function formatRutPuntos(rut: string): string {
  const limpio = rutLimpio(rut);
  if (!limpio) return "";
  if (limpio.length === 1) return limpio;
  const cuerpo = limpio.slice(0, -1).slice(0, 8);
  const dv = limpio.slice(-1);
  const cuerpoFmt = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpoFmt}-${dv}`;
}

/** Valida que el DV corresponda al cuerpo. */
export function rutValido(rut: string): boolean {
  const { cuerpo, dv } = partesRut(rut);
  if (!cuerpo || !dv) return false;
  return calcularDv(cuerpo) === dv.toUpperCase();
}
