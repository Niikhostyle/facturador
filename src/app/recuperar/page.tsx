"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/motion/BrandMark";

const input =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 text-base text-slate-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30";

export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      setMsg({ ok: res.ok, text: body.message || (res.ok ? "Revisa tu correo." : "No se pudo enviar el correo.") });
    } catch {
      setMsg({ ok: false, text: "Sin conexión. Intenta de nuevo." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-8 shadow-pop">
        <BrandMark />
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-slate-900">Recuperar contraseña</h1>
        <p className="mt-1.5 text-base text-slate-500">Te enviaremos un enlace para crear una nueva. Vale por 1 hora.</p>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Correo de tu cuenta
            </label>
            <input id="email" type="email" autoComplete="email" required className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {msg ? (
            <div
              role={msg.ok ? "status" : "alert"}
              className={`rounded-lg border px-3.5 py-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}
            >
              {msg.text}
            </div>
          ) : null}
          <button
            disabled={loading}
            className="inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
        <p className="mt-5 text-sm text-slate-500">
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
