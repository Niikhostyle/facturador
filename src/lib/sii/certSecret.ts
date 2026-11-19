import crypto from "crypto";

/** Clave AES derivada de AUTH_SECRET: rotar AUTH_SECRET obliga a volver a subir los certificados. */
function llave() {
  const s = process.env.AUTH_SECRET || "";
  if (s.length < 32) throw new Error("AUTH_SECRET no configurado");
  return crypto.createHash("sha256").update(`cert-password:${s}`).digest();
}

export function cifrarClave(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", llave(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), ct].map((x) => (typeof x === "string" ? x : x.toString("base64url"))).join(":");
}

export function descifrarClave(enc: string) {
  const [v, iv, tag, ct] = enc.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Clave cifrada con formato desconocido");
  const d = crypto.createDecipheriv("aes-256-gcm", llave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
