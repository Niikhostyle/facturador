"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Headset, MessageCircle, ShieldCheck } from "lucide-react";
import { setAuth } from "@/lib/api";
import type { AuthState } from "@/lib/types";
import { BrandMark } from "@/components/motion/BrandMark";
import { LoginSello } from "@/components/motion/LoginSello";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      if (body.is_platform && !body.tenantId) router.replace("/admin");
      else router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de acceso");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="pf-grid" aria-hidden />
        <div className="relative shrink-0 px-8 pt-8">
          <Link href="/" className="block w-fit">
            <BrandMark />
          </Link>
          <p className="mt-6 flex w-fit items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-fiscal">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            <span>Certificamos a tu empresa ante el SII</span>
          </p>
          <h1 className="mt-2 max-w-sm text-balance font-display text-[1.6rem] font-bold leading-[1.15] tracking-[-0.02em] text-fiscal">
            Entra y sigue facturando al SII.
          </h1>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-tinta-muted">
            Emisión, seguimiento, recepción y API. El mismo motor que habla con el SII cuando emites un
            documento.
          </p>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
          <LoginSello />
        </div>
      </aside>

      <div className="flex items-center justify-center bg-[var(--bg)] px-4 py-10">
        <div className="pf-rise w-full max-w-sm rounded-2xl border border-[var(--border)] bg-white p-8 shadow-pop" style={{ ["--i" as string]: 0 }}>
          <div className="lg:hidden">
            <BrandMark />
          </div>

          <h2 className="mt-6 font-display text-2xl font-bold tracking-tight text-slate-900 lg:mt-0">
            Iniciar sesión
          </h2>
          <p className="mt-1.5 text-base text-slate-500">
            Accede a tu cuenta para emitir y gestionar tus documentos tributarios.
          </p>

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" method="post" noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">
                Correo electrónico
              </label>
              <input
                id="email"
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 text-base text-slate-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@empresa.cl"
                type="email"
                name="email"
                autoComplete="username"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3.5 py-2.5 pr-11 text-base text-slate-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={show ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition hover:text-slate-600"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={show}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <a
                href="mailto:nfigueroa@gdtdevsur.cl?subject=Recuperar%20acceso%20Facturador"
                className="text-sm font-semibold text-brand-600 transition hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            {error ? (
              <div
                className="pf-calza flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <button
              disabled={loading}
              data-pf-magnet=""
              className="pf-magnet mt-1 inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>

          <p className="mt-5 text-sm text-slate-500">
            ¿No tienes cuenta?{" "}
            <a href="/registro" className="font-semibold text-brand-600 hover:underline">
              Registrar empresa
            </a>
          </p>
          <p className="mt-2 text-sm text-slate-500">
            ¿Problemas para entrar?{" "}
            <a
              href="mailto:nfigueroa@gdtdevsur.cl?subject=Soporte%20Facturador"
              className="inline-flex items-center gap-1 font-semibold text-fiscal transition hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Escríbenos
            </a>
          </p>
        </div>
      </div>

      <a
        href="mailto:nfigueroa@gdtdevsur.cl?subject=Soporte%20Facturador"
        data-pf-magnet=""
        className="pf-magnet pf-rise fixed bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-full border border-white/10 bg-fiscal-deep px-4 py-2.5 text-sm font-semibold text-white shadow-lift"
        style={{ ["--i" as string]: 2 }}
      >
        <Headset className="h-4 w-4" />
        Soporte
      </a>
    </div>
  );
}
