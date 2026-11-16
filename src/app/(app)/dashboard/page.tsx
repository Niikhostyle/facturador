"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, getAuth } from "@/lib/api";
import { formatCLP, monthRange } from "@/lib/utils";
import { CheckCircle2, ChevronRight } from "lucide-react";

type Me = {
  tenant: { razon_social: string; rut_formateado: string; plan: string; max_dte_mes: number };
};
type Onboarding = {
  completas: number;
  total: number;
  progreso_pct: number;
  fases: { key: string; label: string; completa: boolean }[];
  resolucion_documentos: string;
  sistema_gratuito: string;
};
type Stats = {
  aceptados: number;
  suma_total: number;
  total_documentos: number;
  consumo_plan: { emitidos: number; limite: number };
};
type Caf = {
  data: {
    resumen: { tipos_en_alerta: number; tipos_activos?: number };
    tipos: {
      tipo_dte: number;
      tipo_nombre: string;
      alerta: string;
      disponibles: number;
      caf_en_uso: { vence_el: string } | null;
    }[];
  };
};
type Cert = { tiene_certificado: boolean; data: { vigente: boolean; dias_restantes: number } | null };
type DteList = { data: { id: number; tipo_nombre: string; folio: number; receptor_razon_social: string; monto_total: number; estado: string; fecha_emision: string }[]; meta: { total: number } };

export default function DashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [caf, setCaf] = useState<Caf | null>(null);
  const [cert, setCert] = useState<Cert | null>(null);
  const [dtes, setDtes] = useState<DteList | null>(null);

  useEffect(() => {
    const { desde, hasta } = monthRange();
    Promise.all([
      api<Me>("/auth/me"),
      api<Onboarding>("/onboarding/estado"),
      api<Stats>(`/dte/stats?desde=${desde}&hasta=${hasta}`),
      api<Caf>("/caf/estado"),
      api<Cert>("/certificado/estado"),
      api<DteList>("/dte?per_page=5"),
    ]).then(([a, b, c, d, e, f]) => {
      setMe(a);
      setOnboarding(b);
      setStats(c);
      setCaf(d);
      setCert(e);
      setDtes(f);
    });
  }, []);

  return (
    <AppShell title="Dashboard" subtitle="Resumen de tu empresa">
      <div className="space-y-4">
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-900">
                {me?.tenant.razon_social || getAuth()?.tenant.razon_social}
              </p>
              <p className="text-sm text-slate-500">
                RUT {me?.tenant.rut_formateado || getAuth()?.tenant.rut_formateado} · Plan{" "}
                {me?.tenant.plan || getAuth()?.tenant.plan || "gratis"}
              </p>
            </div>
            {cert?.tiene_certificado && cert.data?.vigente ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Certificado vigente
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                Sin certificado
              </span>
            )}
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="font-medium text-ink-900">Certificación (maullin)</p>
            <p className="text-sm text-slate-500">Documentos de prueba, sin valor tributario.</p>
            <Link href="/documentos-autorizados" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
              Ver estado SII <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-ink-900">Habilitación en Facturador GDT DevSur</p>
              <p className="text-sm text-slate-500">
                {onboarding?.completas ?? 0} de {onboarding?.total ?? 9} pasos · Certificación
              </p>
            </div>
            <p className="font-display text-2xl font-semibold text-brand-700">
              {onboarding?.progreso_pct ?? 0}%
            </p>
          </div>
          <p className="mt-3 text-sm text-slate-600">{onboarding?.resolucion_documentos}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-600"
              style={{ width: `${onboarding?.progreso_pct ?? 0}%` }}
            />
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {onboarding?.fases.map((f) => {
              const href =
                f.key === "datos_empresa"
                  ? "/empresa"
                  : f.key === "certificado"
                    ? "/certificado"
                    : f.key === "folios_certificacion" || f.key === "folios_palena"
                      ? "/caf"
                      : f.key === "prueba_certificacion" || f.key === "emitiendo_produccion"
                        ? "/dte/nuevo?tipo=33"
                        : f.key === "inscripcion_sii"
                          ? "/documentos-autorizados"
                          : "/suscripcion";
              return (
                <li key={f.key}>
                  <Link href={href} className="flex items-center gap-2 text-sm text-slate-700 hover:text-brand-700">
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white ${
                        f.completa ? "bg-brand-600" : "bg-slate-300"
                      }`}
                    >
                      {f.completa ? "✓" : ""}
                    </span>
                    {f.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Documentos del mes",
              value: `${stats?.consumo_plan.emitidos ?? 0} / ${stats?.consumo_plan.limite ?? me?.tenant.max_dte_mes ?? 50}`,
              hint: `Te quedan ${(stats?.consumo_plan.limite ?? me?.tenant.max_dte_mes ?? 50) - (stats?.consumo_plan.emitidos ?? 0)} este mes`,
            },
            {
              label: "Aceptados por el SII",
              value: String(stats?.aceptados ?? 0),
              hint: `De ${stats?.total_documentos ?? 0} documentos del mes`,
            },
            {
              label: "Ventas del mes",
              value: formatCLP(stats?.suma_total ?? 0),
              hint: "Aceptadas, menos notas de crédito",
            },
            {
              label: "Folios",
              value: `${caf?.data.resumen.tipos_en_alerta ?? 0} avisos`,
              hint: `${caf?.data.resumen.tipos_activos ?? 0} tipos de documento activos`,
              href: "/caf",
            },
          ].map((card) => (
            <div key={card.label} className="card p-4">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-1 font-display text-2xl font-semibold text-ink-900">{card.value}</p>
              <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
              {"href" in card && card.href ? (
                <Link href={card.href} className="mt-2 inline-block text-sm font-medium text-brand-700">
                  Ver folios
                </Link>
              ) : null}
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Documentos recientes</h2>
              <Link href="/dte" className="text-sm font-medium text-brand-700">
                Ver todos
              </Link>
            </div>
            {(dtes?.data.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="font-medium text-ink-900">Aún no emites documentos</p>
                <p className="mt-1 text-sm text-slate-500">
                  Cuando emitas, los últimos cinco aparecen aquí. Usa <strong>Nuevo DTE</strong> arriba a la derecha.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {dtes?.data.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink-900">
                        {d.tipo_nombre} #{d.folio}
                      </p>
                      <p className="text-slate-500">
                        {d.receptor_razon_social} · {d.fecha_emision}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCLP(d.monto_total)}</p>
                      <p className="text-xs capitalize text-emerald-700">{d.estado}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Folios</h2>
              <Link href="/caf" className="text-sm font-medium text-brand-700">
                Gestionar
              </Link>
            </div>
            <p className="mb-3 text-sm text-slate-500">Certificación (maullin)</p>
            {(caf?.data.resumen.tipos_activos ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="font-medium text-ink-900">Sin folios cargados</p>
                <p className="mt-1 text-sm text-slate-500">
                  Sube un CAF en <Link href="/caf" className="font-medium text-brand-700">CAF / Folios</Link> para empezar a emitir.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {caf?.data.tipos
                  .filter((t) => t.disponibles > 0 || t.caf_en_uso)
                  .map((t) => (
                    <li
                      key={t.tipo_dte}
                      className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink-900">{t.tipo_nombre}</p>
                        <p className="text-xs text-slate-500">
                          {t.disponibles <= 0
                            ? "Sin folios · Sin folios para emitir"
                            : `Vence ${t.caf_en_uso?.vence_el ?? "—"}`}
                        </p>
                      </div>
                      <p className="text-sm font-semibold">
                        {t.disponibles} <span className="font-normal text-slate-500">folios</span>
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
