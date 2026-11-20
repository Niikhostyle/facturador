"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { BrandMark } from "@/components/motion/BrandMark";

const input =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 pr-11 text-base text-slate-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30";

function Formulario() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 8) return setMsg({ ok: false, text: "La contraseña debe tener al menos 8 caracteres." });
    if (password !== repetir) return setMsg({ ok: false, text: "Las contraseñas no coinciden." });
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/restablecer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      setMsg({ ok: res.ok, text: body.message || (res.ok ? "Contraseña actualizada." : "No se pudo actualizar.") });
    } catch {
      setMsg({ ok: false, text: "Sin conexión. Intenta de nuevo." });
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
        Falta el enlace del correo. <Link href="/recuperar" className="font-semibold underline">Pide uno nuevo</Link>.
      </p>
    );
  }
  if (msg?.ok) {
    return (
      <div className="mt-6 space-y-4">
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">{msg.text}</p>
        <Link href="/login" className="inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          Iniciar sesión
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">Nueva contraseña (mín. 8)</label>
        <div className="relative">
          <input id="password" type={show ? "text" : "password"} autoComplete="new-password" minLength={8} required className={input} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-500 hover:text-slate-700"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={show}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="repetir" className="text-sm font-medium text-slate-700">Repite la contraseña</label>
        <input id="repetir" type={show ? "text" : "password"} autoComplete="new-password" required className={input} value={repetir} onChange={(e) => setRepetir(e.target.value)} />
      </div>
      {msg ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{msg.text}{msg.text.includes("venció") ? <> <Link href="/recuperar" className="font-semibold underline">Pedir otro</Link></> : null}</div> : null}
      <button disabled={loading} className="inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60">
        {loading ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}

export default function RestablecerPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-8 shadow-pop">
        <BrandMark />
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-slate-900">Nueva contraseña</h1>
        <Suspense fallback={null}>
          <Formulario />
        </Suspense>
      </div>
    </main>
  );
}
