"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { setAuth } from "@/lib/api";
import type { AuthState } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("nfigueroa@gdtdevsur.cl");
  const [password, setPassword] = useState("devsur");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "No se pudo iniciar sesión");
      setAuth(body as AuthState);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de acceso");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#f7e6dc,transparent_40%),radial-gradient(circle_at_bottom_right,#dbe7f5,transparent_35%),#eef1f5]">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
        <div className="card w-full p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-amber-500 font-bold text-white">
              GDT
            </span>
            <div>
              <p className="font-display text-lg font-semibold text-ink-900">Facturador GDT DevSur</p>
              <p className="text-xs uppercase tracking-[0.16em] text-brand-600">Local · SII</p>
            </div>
          </div>

          <h1 className="font-display text-2xl font-semibold text-ink-900">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-slate-500">
            Accede a tu cuenta para emitir y gestionar tus documentos tributarios.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">Correo electrónico</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none ring-brand-600/30 focus:ring"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@empresa.cl"
                type="email"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">Contraseña</span>
              <div className="relative">
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-10 outline-none ring-brand-600/30 focus:ring"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={show ? "text" : "password"}
                  required
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500"
                  onClick={() => setShow((v) => !v)}
                  aria-label="Mostrar contraseña"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              disabled={loading}
              className="w-full rounded-xl bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            Demo local: <span className="font-medium">nfigueroa@gdtdevsur.cl</span> / cualquier clave
          </p>
        </div>
      </div>
    </div>
  );
}
