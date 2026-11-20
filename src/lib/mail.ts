import nodemailer, { type Transporter } from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

/** Correo saliente por SMTP (variables SMTP_* en .env.local). */
const g = globalThis as typeof globalThis & { __facturadorMail?: Transporter };

function transporter(): Transporter {
  if (!g.__facturadorMail) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new Error("Correo no configurado (SMTP_HOST / SMTP_USER / SMTP_PASS).");
    const port = Number(SMTP_PORT || 465);
    g.__facturadorMail = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return g.__facturadorMail;
}

export const correoValido = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);

export async function enviarCorreo(msg: Pick<Mail.Options, "to" | "subject" | "html" | "text" | "attachments" | "replyTo">) {
  await transporter().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, ...msg });
}

/** URL pública de la app para links en correos. */
export const appUrl = () => (process.env.APP_URL || "https://cotizaciones.chanco.cl").replace(/\/$/, "");

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plantilla simple y legible en cualquier cliente de correo. */
export function plantillaCorreo(titulo: string, parrafos: string[], boton?: { texto: string; url: string }) {
  const cuerpo = parrafos.map((p) => `<p style="margin:0 0 12px">${escHtml(p)}</p>`).join("");
  const btn = boton
    ? `<p style="margin:20px 0"><a href="${escHtml(boton.url)}" style="background:#1a2b5c;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escHtml(boton.texto)}</a></p>`
    : "";
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f3f4f8;font-family:Arial,sans-serif;color:#1f2937">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;padding:28px">
<h1 style="font-size:18px;margin:0 0 16px;color:#1a2b5c">${escHtml(titulo)}</h1>${cuerpo}${btn}
<p style="margin:24px 0 0;font-size:12px;color:#525d77">Este correo fue enviado automáticamente; no lo respondas.</p>
</div></body></html>`;
  const text = [titulo, "", ...parrafos, ...(boton ? ["", `${boton.texto}: ${boton.url}`] : [])].join("\n");
  return { html, text };
}
