/** Escapa texto para contenido de elementos XML (&, <, >). */
export function esc(v: string | number | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Recorta a un máximo de caracteres (varios campos del SII tienen tope de 40). */
export function trunc(v: string | null | undefined, max: number): string {
  const s = String(v ?? "");
  return s.length > max ? s.slice(0, max) : s;
}

/** Timestamp local sin zona: YYYY-MM-DDTHH:MM:SS (formato TSTED / TmstFirma del SII). */
export function timestampSii(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}
