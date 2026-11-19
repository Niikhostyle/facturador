"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { setAuth } from "@/lib/api";
import type { AuthState } from "@/lib/types";
import { BrandMark } from "@/components/motion/BrandMark";
import { formatCLP } from "@/lib/utils";

type Plan = {
  slug: string;
  nombre: string;
  precio: number;
  dte_mes: number;
  descripcion: string;
  features: string[];
};

export default function RegistroPage() {
  const router = useRouter();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [showPlan, setShowPlan] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    rut: "",
    dv: "",
    razon_social: "",
    name: "",
    email: "",
    password: "",
    email_contacto: "",
    plan: "free",
    terminos: false,
    privacidad: false,
    encargo: false,
  });

  useEffect(() => {
    fetch("/api/v1/planes")
      .then((r) => r.json())
      .then((j) => setPlanes(j.data || []))
      .catch(() => setPlanes([]));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.terminos || !form.privacidad || !form.encargo) {
      setError("Debes aceptar los consentimientos legales.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "No se pudo crear la cuenta");
      setAuth(body as AuthState);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-line bg-white lg:flex lg:flex-col">
        <div className="pf-grid" aria-hidden />
        <div className="relative px-10 pt-10">
          <Link href="/" className="block w-fit">
            <BrandMark />
          </Link>
          <p className="mt-8 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-fiscal">
            <ShieldCheck className="h-3.5 w-3.5" />
            Certificamos a tu empresa ante el SII
          </p>
          <h1 className="mt-3 max-w-md font-display text-3xl font-bold leading-tight tracking-tight text-fiscal">
            Crea tu cuenta en menos de 5 minutos
          </h1>
          <p className="mt-3 max-w-md text-sm text-tinta-muted">
            Cada cuenta es independiente: tu empresa, tus folios y tus usuarios. Con el plan Profesional
            te acompañamos en la certificación ante el SII.
          </p>
        </div>
        <div className="relative mt-auto px-10 pb-10">
          <div className="rounded-2xl border border-[var(--line)] bg-white/90 p-4 shadow-pf-1">
            <p className="text-xs font-semibold text-slate-500">Factura 33 · N° 1842</p>
            <div className="mt-3 flex gap-2 text-[11px] font-semibold">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Firmado</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Enviado</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">Aceptado SII</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex items-start justify-center bg-[var(--bg)] px-4 py-8">
        <form onSubmit={onSubmit} className="w-full max-w-lg space-y-5 rounded-2xl border border-[var(--line)] bg-white p-6 shadow-pf-1 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900">Crea tu cuenta</h2>
              <p className="mt-1 text-sm text-slate-500">Empresa independiente + usuario dueño.</p>
            </div>
            <Link href="/login" className="text-sm font-medium text-brand-700 hover:underline">
              Iniciar sesión
            </Link>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          ) : null}

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">Tu empresa</legend>
            <div className="grid grid-cols-[1fr_72px] gap-2">
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">RUT (sin DV)</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={form.rut}
                  onChange={(e) => set("rut", e.target.value.replace(/\D/g, ""))}
                  required
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">DV</span>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 uppercase"
                  maxLength={1}
                  value={form.dv}
                  onChange={(e) => set("dv", e.target.value.toUpperCase())}
                  required
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Razón social</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="Como aparece en el SII"
                value={form.razon_social}
                onChange={(e) => set("razon_social", e.target.value)}
                required
              />
            </label>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">Tu cuenta</legend>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Tu nombre</span>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Tu correo</span>
              <input
                type="email"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Contraseña (mín. 8)</span>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  minLength={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400"
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
          </fieldset>

          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-800">Correo de contacto</span>
            <input
              type="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Facturación y avisos (opcional)"
              value={form.email_contacto}
              onChange={(e) => set("email_contacto", e.target.value)}
            />
          </label>

          <div>
            <p className="text-sm font-semibold text-slate-800">Tu plan</p>
            <p className="text-xs text-slate-500">Puedes decidir después. Por defecto: Gratis.</p>
            <button
              type="button"
              className="mt-2 text-sm font-medium text-brand-700 hover:underline"
              onClick={() => setShowPlan((v) => !v)}
            >
              {showPlan ? "Ocultar planes" : "Elegir un plan ahora"}
            </button>
            {showPlan ? (
              <div className="mt-3 grid gap-2">
                {planes.map((p) => (
                  <label
                    key={p.slug}
                    className={`cursor-pointer rounded-xl border p-3 text-sm ${
                      form.plan === p.slug ? "border-[var(--pulso)] bg-orange-50/50" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      className="mr-2"
                      name="plan"
                      checked={form.plan === p.slug}
                      onChange={() => set("plan", p.slug)}
                    />
                    <strong>{p.nombre}</strong> ·{" "}
                    {p.precio === 0 ? "Gratis" : `${formatCLP(p.precio)} + IVA/mes`} ·{" "}
                    {p.dte_mes === 0 ? "DTE ilimitados" : `Hasta ${p.dte_mes} DTE/mes`}
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Consentimientos legales (Ley 21.719)
            </legend>
            {(
              [
                ["terminos", "Acepto los Términos y Condiciones"],
                ["privacidad", "Acepto la Política de Privacidad"],
                ["encargo", "Acepto el Acuerdo de Encargo de Tratamiento de Datos"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form[key]}
                  onChange={(e) => set(key, e.target.checked)}
                  required
                />
                {label}
              </label>
            ))}
          </fieldset>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[10px] bg-[var(--pulso)] py-2.5 text-sm font-semibold text-white shadow-pf-2 disabled:opacity-60"
          >
            {loading ? "Creando…" : "Crear cuenta →"}
          </button>
        </form>
      </div>
    </div>
  );
}
