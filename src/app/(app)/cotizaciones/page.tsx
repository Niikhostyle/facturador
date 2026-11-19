"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Search, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { cn, formatCLP } from "@/lib/utils";
import type { Cotizacion } from "@/lib/types";
import { formatRutPuntos } from "@/lib/sii/rut";

type Estado = Cotizacion["estado"];

const ESTADOS: { key: Estado | ""; label: string }[] = [
  { key: "", label: "Todas" },
  { key: "guardada", label: "Guardada" },
  { key: "enviada", label: "Enviada" },
  { key: "aceptada", label: "Aceptada" },
  { key: "rechazada", label: "Rechazada" },
  { key: "anulada", label: "Anulada" },
];

function formatFecha(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}-${m}-${y}`;
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysUntil(isoDate: string) {
  const end = new Date(`${isoDate}T12:00:00`);
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / 86_400_000);
}

function labelEstado(estado: string) {
  const map: Record<string, string> = {
    borrador: "Borrador",
    guardada: "Guardada",
    enviada: "Enviada",
    aceptada: "Aceptada",
    rechazada: "Rechazada",
    anulada: "Anulada",
  };
  return map[estado] || estado.charAt(0).toUpperCase() + estado.slice(1);
}

function estadoTone(estado: string) {
  if (estado === "aceptada") return "bg-[var(--ok-soft)] text-[var(--ok)] border-[color-mix(in_srgb,var(--ok)_20%,transparent)]";
  if (estado === "enviada") return "bg-[var(--fiscal-soft)] text-fiscal border-[color-mix(in_srgb,var(--fiscal)_18%,transparent)]";
  if (estado === "rechazada" || estado === "anulada")
    return "bg-[var(--danger-soft)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function validezMeta(c: Cotizacion) {
  const vence = addDays(c.fecha, c.validez_dias);
  const left = daysUntil(vence);
  const closed = c.estado === "aceptada" || c.estado === "rechazada" || c.estado === "anulada";
  if (closed) return { vence, left, label: "—", tone: "text-slate-500" };
  if (left < 0) return { vence, left, label: "Vencida", tone: "text-[var(--danger)] font-semibold" };
  if (left <= 7) return { vence, left, label: `${left}d`, tone: "text-[var(--warn)] font-semibold" };
  return { vence, left, label: `${left}d`, tone: "text-slate-600" };
}

export default function CotizacionesPage() {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [estado, setEstado] = useState<Estado | "">("");
  const [rows, setRows] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ per_page: "50" });
      if (qDebounced) params.set("q", qDebounced);
      if (estado) params.set("estado", estado);
      const r = await api<{ data: Cotizacion[] }>(`/cotizaciones?${params}`);
      setRows(r.data);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "No se pudo cargar el listado");
    } finally {
      setLoading(false);
    }
  }, [qDebounced, estado]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const filtersActive = Boolean(q.trim() || estado);
  const vencenPronto = useMemo(
    () =>
      rows.filter((c) => {
        const m = validezMeta(c);
        return m.left >= 0 && m.left <= 7 && c.estado !== "aceptada" && c.estado !== "anulada" && c.estado !== "rechazada";
      }).length,
    [rows],
  );

  return (
    <AppShell
      title="Cotizaciones"
      subtitle={
        loading
          ? "Cargando…"
          : error
            ? "No disponible"
            : `${rows.length} documento${rows.length === 1 ? "" : "s"} comerciales · no tributarios`
      }
      actions={
        <Link
          href="/cotizaciones/nueva"
          className="inline-flex h-9 items-center rounded-[10px] bg-[var(--fiscal)] px-3 text-sm font-semibold text-white sm:px-4"
        >
          Nueva cotización
        </Link>
      }
    >
      <div className="space-y-3">
        {error ? (
          <div
            role="alert"
            className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
          >
            <p className="font-medium">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-2 text-sm font-semibold underline underline-offset-2"
            >
              Reintentar
            </button>
          </div>
        ) : null}

        <section className="rounded-[16px] border border-[var(--line)] bg-white p-4 shadow-pf-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <label className="sr-only" htmlFor="cot-search">
                Buscar cotizaciones
              </label>
              <input
                id="cot-search"
                className="block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-brand-600/30"
                placeholder="Buscar por número, cliente o RUT…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {filtersActive ? (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setQDebounced("");
                  setEstado("");
                }}
                className="inline-flex h-10 items-center gap-1 self-start rounded-lg px-2 text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
                Limpiar
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {ESTADOS.map((e) => (
              <button
                key={e.key || "all"}
                type="button"
                onClick={() => setEstado(e.key)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  estado === e.key
                    ? "border border-brand-600/30 bg-brand-50 font-semibold text-brand-700"
                    : "border border-slate-200 text-slate-600 hover:border-brand-600/40 hover:text-brand-700",
                )}
              >
                {e.label}
              </button>
            ))}
          </div>

          {!loading && !error && vencenPronto > 0 ? (
            <p className="mt-3 text-xs text-[var(--warn)]">
              {vencenPronto} cotización{vencenPronto === 1 ? "" : "es"} vencen en 7 días o menos.
            </p>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-white shadow-pf-1">
          {loading ? (
            <div className="grid place-items-center py-16 text-sm text-slate-500" aria-live="polite" aria-busy="true">
              Cargando cotizaciones…
            </div>
          ) : error ? (
            <div className="grid place-items-center py-16 text-center">
              <p className="font-medium text-ink-900">No se pudo cargar el listado</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-4 inline-flex h-9 items-center rounded-[10px] bg-[var(--fiscal)] px-4 text-sm font-semibold text-white"
              >
                Reintentar
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="grid place-items-center px-4 py-16 text-center">
              {filtersActive ? (
                <>
                  <p className="font-medium text-ink-900">Sin resultados con estos filtros</p>
                  <p className="mt-1 text-sm text-slate-500">Prueba otro estado o limpia la búsqueda.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQ("");
                      setQDebounced("");
                      setEstado("");
                    }}
                    className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-white px-4 text-sm font-semibold text-slate-700"
                  >
                    <X className="h-4 w-4" />
                    Limpiar filtros
                  </button>
                </>
              ) : (
                <>
                  <p className="font-medium text-ink-900">Aún no hay cotizaciones</p>
                  <p className="mt-1 text-sm text-slate-500">Crea una oferta comercial (no se envía al SII).</p>
                  <Link
                    href="/cotizaciones/nueva"
                    className="mt-4 inline-flex h-9 items-center rounded-[10px] bg-[var(--fiscal)] px-4 text-sm font-semibold text-white"
                  >
                    Nueva cotización
                  </Link>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="divide-y divide-slate-100 sm:hidden">
                {rows.map((c) => {
                  const v = validezMeta(c);
                  return (
                    <li key={c.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/cotizaciones/${c.id}`} className="font-semibold text-brand-700">
                            {c.numero}
                          </Link>
                          <p className="truncate text-sm font-medium text-ink-900">{c.receptor_razon_social}</p>
                          <p className="text-xs text-slate-500">
                            {formatFecha(c.fecha)} · vence {formatFecha(v.vence)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold tabular-nums">{formatCLP(c.total)}</p>
                          <span
                            className={cn(
                              "mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              estadoTone(c.estado),
                            )}
                          >
                            {labelEstado(c.estado)}
                          </span>
                          <p className={cn("mt-1 text-xs", v.tone)}>{v.label}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Link
                          href={`/cotizaciones/${c.id}/editar`}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Validez</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => {
                      const v = validezMeta(c);
                      return (
                        <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <Link
                              href={`/cotizaciones/${c.id}`}
                              className="font-medium text-brand-700 hover:underline"
                            >
                              {c.numero}
                            </Link>
                          </td>
                          <td className="max-w-[220px] px-4 py-3">
                            <p className="truncate font-medium">{c.receptor_razon_social}</p>
                            <p className="text-xs text-slate-500">{formatRutPuntos(c.receptor_rut)}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                                estadoTone(c.estado),
                              )}
                            >
                              {labelEstado(c.estado)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatFecha(c.fecha)}</td>
                          <td className="px-4 py-3">
                            <p className={cn("tabular-nums", v.tone)}>{v.label}</p>
                            <p className="text-xs text-slate-500">{formatFecha(v.vence)}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {formatCLP(c.total)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/cotizaciones/${c.id}/editar`}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
