import fs from "fs";
import path from "path";

const LOGO_BASENAME = "logo";

export function logoDir(): string {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Ruta del logo en disco si existe (png/jpg/jpeg/webp). */
export function findLogoPath(): string | null {
  const dir = logoDir();
  const candidates = [".png", ".jpg", ".jpeg", ".webp"].map((ext) =>
    path.join(dir, `${LOGO_BASENAME}${ext}`),
  );
  return candidates.find((p) => fs.existsSync(p)) || null;
}

export function logoExiste(): boolean {
  return Boolean(findLogoPath());
}

/** Usa el archivo solo si `usarLogo` está activo. */
export function logoParaDocumentos(usarLogo: boolean): string | null {
  if (!usarLogo) return null;
  return findLogoPath();
}

export function mimeDeLogo(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function extDesdeMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("webp")) return ".webp";
  return ".png";
}

/** Borra cualquier logo previo (todas las extensiones). */
export function eliminarLogo(): void {
  const dir = logoDir();
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    const p = path.join(dir, `${LOGO_BASENAME}${ext}`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

/**
 * Guarda el logo desde base64 (con o sin prefijo data:image/...).
 * Máx ~2.5 MB decodificado.
 */
export function guardarLogoBase64(raw: string, mimeHint?: string): { path: string; mime: string } {
  let mime = mimeHint || "image/png";
  let b64 = raw.trim();
  const dataUrl = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(b64);
  if (dataUrl) {
    mime = dataUrl[1];
    b64 = dataUrl[2];
  }
  if (!/^image\/(png|jpe?g|webp)$/i.test(mime)) {
    throw new Error("Formato no soportado. Usa PNG, JPG o WebP.");
  }
  const buf = Buffer.from(b64.replace(/\s/g, ""), "base64");
  if (!buf.length) throw new Error("Archivo de logo vacío.");
  if (buf.length > 2.5 * 1024 * 1024) throw new Error("El logo supera 2,5 MB.");

  eliminarLogo();
  const ext = extDesdeMime(mime);
  const dest = path.join(logoDir(), `${LOGO_BASENAME}${ext}`);
  fs.writeFileSync(dest, buf);
  return { path: dest, mime };
}
