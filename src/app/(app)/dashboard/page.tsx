"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, getAuth } from "@/lib/api";
import { cn, formatCLP, monthRange } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";

type Me = {
  tenant: { razon_social: string; rut_formateado: string; plan: string; max_dte_mes: number };
};
type Onboarding = {
  completas: number;
  total: number;
  progreso_pct: number;
  fases: { key: string; label: string; completa: boolean }[];
};
type Stats = {
  aceptados: number;
  suma_total: number;
  total_documentos: number;
  consumo_plan: { emitidos: number; limite: number; ilimitado?: boolean };
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
type DteList = {
  data: {
    id: number;
    tipo_nombre: string;
    folio: number;
    receptor_razon_social: string;
    monto_total: number;
    estado: string;
    fecha_emision: string;
  }[];
};

function faseHref(key: string) {
  if (key === "datos_empresa") return "/empresa";
  if (key === "certificado") return "/certificado";
  if (key === "folios_certificacion" || key === "folios_palena") return "/caf";
  if (key === "prueba_certificacion" || key === "emitiendo_produccion") return "/dte/nuevo?tipo=33";
  if (key === "inscripcion_sii") return "/documentos-autorizados";
  return "/suscripcion";
}

function fasePorQue(key: string) {
  if (key === "datos_empresa") return "Sin RUT, giro y dirección no puedes emitir.";
  if (key === "certificado") return "El .p12 firma el XML ante el SII.";
  if (key === "folios_certificacion" || key === "folios_palena") return "Sin CAF no hay folios autorizados.";
  if (key === "prueba_certificacion") return "Debes probar el envío a maullín.";
  if (key === "emitiendo_produccion") return "Confirma que ya emites en producción.";
  if (key === "inscripcion_sii") return "Verifica los documentos autorizados en el SII.";
  return "Completa este paso para desbloquear la operación.";
}

function labelEstado(estado: string) {
  const e = estado.toLowerCase();
  if (e.includes("rechaz")) return { text: "Rechazado", className: "text-[var(--danger)]" };
  if (e.includes("acept")) return { text: "Aceptado", className: "text-[var(--ok)]" };
  if (e.includes("enviad")) return { text: "Enviado", className: "text-fiscal" };
  if (e.includes("anul")) return { text: "Anulado", className: "text-[var(--ink-muted)]" };
  return { text: estado, className: "text-[var(--warn)]" };
}

const linkFocus =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 rounded-[var(--radius-md)]";

export default function DashboardPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [caf, setCaf] = useState<Caf | null>(null);
  const [cert, setCert] = useState<Cert | null>(null);
  const [dtes, setDtes] = useState<DteList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAllFases, setShowAllFases] = useState(false);

  function load() {
    setLoading(true);
    setError("");
    const { desde, hasta } = monthRange();
    Promise.all([
      api<Me>("/auth/me"),
      api<Onboarding>("/onboarding/estado"),
      api<Stats>(`/dte/stats?desde=${desde}&hasta=${hasta}`),
      api<Caf>("/caf/estado"),
      api<Cert>("/certificado/estado"),
      api<DteList>("/dte?per_page=5"),
    ])
      .then(([a, b, c, d, e, f]) => {
        setMe(a);
        setOnboarding(b);
        setStats(c);
        setCaf(d);
        setCert(e);
        setDtes(f);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "No se pudo cargar el dashboard");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const emitidos = stats?.consumo_plan.emitidos ?? 0;
  const rawLimite = stats?.consumo_plan.limite ?? me?.tenant.max_dte_mes ?? 50;
  const ilimitado =
    stats?.consumo_plan.ilimitado === true || !rawLimite || rawLimite >= 999999;
  const limite = ilimitado ? 0 : rawLimite;
  const consumoPct = ilimitado ? 0 : Math.min(100, Math.round((emitidos / Math.max(limite, 1)) * 100));
  const avisos = caf?.data.resumen.tipos_en_alerta ?? 0;
  const tiposActivos = caf?.data.resumen.tipos_activos ?? 0;
  const certOk = Boolean(cert?.tiene_certificado && cert.data?.vigente);

  const operativa = (onboarding?.progreso_pct ?? 0) >= 100;
  const siguiente = useMemo(
    () => onboarding?.fases.find((f) => !f.completa) ?? null,
    [onboarding],
  );
  const pendientes = onboarding?.fases.filter((f) => !f.completa) ?? [];
  const authTenant = getAuth()?.tenant;
  const showCertHint = !certOk && siguiente?.key !== "certificado";

  const empresaNombre = me?.tenant?.razon_social || authTenant?.razon_social || "Tu empresa";
  const empresaMeta = `RUT ${me?.tenant?.rut_formateado || authTenant?.rut_formateado || "—"} · Plan ${
    me?.tenant?.plan || authTenant?.plan || "—"
  }`;

  return (
    <AppShell
      title={loading ? "Dashboard" : empresaNombre}
      subtitle={
        loading
          ? "Cargando…"
          : operativa
            ? `${empresaMeta} · Centro del día`
            : `${empresaMeta} · Completa la habilitación para emitir`
      }
    >
      <div className="mx-auto max-w-5xl space-y-6">
        {error ? (
          <div
            role="alert"
            className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
          >
            <p className="font-medium">{error}</p>
            <button
              type="button"
              onClick={load}
              className={cn("mt-2 text-sm font-semibold underline underline-offset-2", linkFocus)}
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunken)]"
              />
            ))}
          </div>
        ) : !operativa ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[var(--warn-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--warn)]">
                Aún no operativa
              </span>
              <span className="text-xs text-[var(--ink-muted)]">Prueba · sin valor tributario</span>
            </div>

            <section className="space-y-5 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <h2 className="font-display text-lg font-semibold text-ink-900">
                    Habilitación pendiente
                  </h2>
                  <p className="max-w-prose text-sm text-[var(--ink-muted)]">
                    Sin completar estos pasos no puedes emitir al SII.
                  </p>
                </div>
                <p
                  className="shrink-0 font-display text-3xl font-semibold tabular-nums text-[var(--pulso)]"
                  role="progressbar"
                  aria-valuenow={onboarding?.progreso_pct ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuetext={`${onboarding?.progreso_pct ?? 0} por ciento`}
                >
                  {onboarding?.progreso_pct ?? 0}%
                </p>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div
                  className="h-full rounded-full bg-[var(--pulso)] transition-[width] duration-300"
                  style={{ width: `${onboarding?.progreso_pct ?? 0}%` }}
                />
              </div>

              {siguiente ? (
                <div className="space-y-3 border-t border-[var(--line)] pt-5">
                  <div>
                    <h3 className="font-display text-base font-semibold text-ink-900">
                      {siguiente.label}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--ink-muted)]">{fasePorQue(siguiente.key)}</p>
                  </div>
                  <Link
                    href={faseHref(siguiente.key)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-md)] bg-[var(--pulso)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110",
                      linkFocus,
                    )}
                  >
                    Continuar
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              ) : null}

              <div className="border-t border-[var(--line)] pt-4">
                <button
                  type="button"
                  onClick={() => setShowAllFases((v) => !v)}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-fiscal",
                    linkFocus,
                  )}
                  aria-expanded={showAllFases}
                >
                  {showAllFases ? "Ocultar pasos" : `Ver ${pendientes.length} pendientes`}
                  <ChevronDown className={cn("h-4 w-4 transition", showAllFases && "rotate-180")} aria-hidden />
                </button>
                {showAllFases ? (
                  <ul className="mt-3 divide-y divide-[var(--line)]">
                    {onboarding?.fases.map((f) => (
                      <li key={f.key}>
                        <Link
                          href={faseHref(f.key)}
                          className={cn(
                            "flex items-start gap-3 py-3 text-sm hover:text-[var(--pulso)]",
                            linkFocus,
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white",
                              f.completa ? "bg-[var(--ok)]" : "bg-slate-300",
                            )}
                            aria-label={f.completa ? "Completa" : "Pendiente"}
                          >
                            {f.completa ? "✓" : ""}
                          </span>
                          <span className="min-w-0">
                            <span className={cn("font-medium", !f.completa && "text-[var(--ink-muted)]")}>
                              {f.label}
                            </span>
                            {!f.completa ? (
                              <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">
                                {fasePorQue(f.key)}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {showCertHint ? (
                <p className="text-sm text-[var(--warn)]">
                  Falta certificado vigente.{" "}
                  <Link
                    href="/certificado"
                    className={cn("font-semibold underline underline-offset-2", linkFocus)}
                  >
                    Cargarlo
                  </Link>
                </p>
              ) : null}
            </section>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] pb-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--ok)_30%,transparent)] bg-[var(--ok-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ok)]">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Operativa
              </span>
              <span className="text-xs text-[var(--ink-muted)]">Prueba · sin valor tributario</span>
              {!certOk ? (
                <Link
                  href="/certificado"
                  className={cn(
                    "rounded-full border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[var(--warn-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--warn)]",
                    linkFocus,
                  )}
                >
                  Revisar certificado
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => setShowAllFases((v) => !v)}
                className={cn(
                  "ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--ink-muted)] hover:text-fiscal",
                  linkFocus,
                )}
                aria-expanded={showAllFases}
              >
                Habilitación
                <ChevronDown className={cn("h-3.5 w-3.5 transition", showAllFases && "rotate-180")} aria-hidden />
              </button>
              {showAllFases ? (
                <ul className="w-full space-y-1.5 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-3 py-3 text-sm text-[var(--ink-muted)]">
                  {onboarding?.fases.map((f) => (
                    <li key={f.key} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ok)]" aria-hidden />
                      {f.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {avisos > 0 ? (
              <Link
                href="/caf"
                className={cn("banner-folios", linkFocus)}
                aria-label={`${avisos} avisos de folios. Ir a CAF`}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--danger)]">
                    {avisos} aviso{avisos === 1 ? "" : "s"} de folios
                  </p>
                  <p className="text-[12px] text-[color-mix(in_srgb,var(--danger)_75%,black)]">
                    Puede frenar tu emisión.
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--danger)]" aria-hidden />
              </Link>
            ) : (
              <p className="text-sm text-[var(--ink-muted)]">
                Folios en orden
                {tiposActivos > 0
                  ? ` · ${tiposActivos} tipo${tiposActivos === 1 ? "" : "s"} activo${tiposActivos === 1 ? "" : "s"}`
                  : ""}
                .{" "}
                <Link href="/caf" className={cn("font-semibold text-fiscal", linkFocus)}>
                  CAF
                </Link>
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Link
                href="/dte/nuevo?tipo=33"
                className={cn(
                  "inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--pulso)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110",
                  linkFocus,
                )}
              >
                Emitir factura
              </Link>
              <Link
                href="/dte"
                className={cn(
                  "inline-flex min-h-11 items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium text-ink-900",
                  linkFocus,
                )}
              >
                Ver documentos
              </Link>
            </div>

            <dl className="grid grid-cols-1 divide-y divide-[var(--line)] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="px-4 py-4">
                <dt className="text-xs font-medium text-[var(--ink-muted)]">Documentos del mes</dt>
                <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink-900">
                  {ilimitado ? `${emitidos} / ∞` : `${emitidos} / ${limite}`}
                </dd>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  {ilimitado ? "Sin tope" : `Quedan ${Math.max(0, limite - emitidos)}`}
                </p>
                {consumoPct > 0 ? (
                  <div
                    className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
                    role="progressbar"
                    aria-valuenow={consumoPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Consumo del plan"
                  >
                    <div className="h-full rounded-full bg-fiscal" style={{ width: `${consumoPct}%` }} />
                  </div>
                ) : null}
              </div>
              <div className="px-4 py-4">
                <dt className="text-xs font-medium text-[var(--ink-muted)]">Aceptados SII</dt>
                <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink-900">
                  {stats?.aceptados ?? 0}
                </dd>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  De {stats?.total_documentos ?? 0} del mes
                </p>
              </div>
              <div className="px-4 py-4">
                <dt className="text-xs font-medium text-[var(--ink-muted)]">Ventas del mes</dt>
                <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink-900">
                  {formatCLP(stats?.suma_total ?? 0)}
                </dd>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">Aceptadas, menos NC</p>
              </div>
            </dl>

            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-base font-semibold text-ink-900">Documentos recientes</h2>
                <Link href="/dte" className={cn("text-sm font-semibold text-[var(--pulso)]", linkFocus)}>
                  Ver todos
                </Link>
              </div>
              {(dtes?.data.length ?? 0) === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--line)] px-4 py-8 text-center">
                  <p className="text-sm font-medium text-ink-900">Aún no hay emisiones</p>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">Empieza con una factura electrónica.</p>
                  <Link
                    href="/dte/nuevo?tipo=33"
                    className={cn(
                      "mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--pulso)] px-4 py-2 text-sm font-semibold text-white",
                      linkFocus,
                    )}
                  >
                    Emitir factura
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--line)] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)]">
                  {dtes?.data.map((d) => {
                    const st = labelEstado(d.estado);
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <div className="min-w-0">
                          <Link
                            href={`/dte/${d.id}`}
                            className={cn("font-semibold text-fiscal hover:underline", linkFocus)}
                          >
                            {d.tipo_nombre} #{d.folio}
                          </Link>
                          <p className="truncate text-xs text-[var(--ink-muted)]">
                            {d.receptor_razon_social} · {d.fecha_emision}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold tabular-nums">{formatCLP(d.monto_total)}</p>
                          <p className={cn("text-xs", st.className)}>{st.text}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
