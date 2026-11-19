"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  BookOpen,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api, getAuth } from "@/lib/api";
import { cn, formatCLP, monthRange } from "@/lib/utils";
import { TIPOS_DTE } from "@/lib/seed";

type Row = {
  id: number;
  tipo_dte: number;
  tipo_nombre: string;
  folio: number;
  fecha_emision: string;
  receptor_rut: string;
  receptor_razon_social: string;
  monto_total: number;
  estado: string;
};

type Meta = { current_page: number; last_page: number; per_page: number; total: number };

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function shiftDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function formatFecha(isoDate: string) {
  const [y, m, day] = isoDate.split("-");
  if (!y || !m || !day) return isoDate;
  return `${day}-${m}-${y}`;
}

function estadoTone(estado: string) {
  const e = estado.toLowerCase();
  if (e.includes("rechaz"))
    return "bg-[var(--danger-soft)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]";
  if (e.includes("acept"))
    return "bg-[var(--ok-soft)] text-[var(--ok)] border-[color-mix(in_srgb,var(--ok)_20%,transparent)]";
  if (e.includes("enviad"))
    return "bg-[var(--fiscal-soft)] text-fiscal border-[color-mix(in_srgb,var(--fiscal)_18%,transparent)]";
  if (e.includes("anul")) return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-[var(--warn-soft)] text-[var(--warn)] border-[color-mix(in_srgb,var(--warn)_22%,transparent)]";
}

function labelEstado(estado: string) {
  const e = estado.toLowerCase();
  if (e.includes("rechaz")) return "Rechazado";
  if (e.includes("acept")) return "Aceptado";
  if (e.includes("enviad")) return "Enviado";
  if (e.includes("anul")) return "Anulado";
  if (e.includes("pend")) return "Pendiente";
  return estado.charAt(0).toUpperCase() + estado.slice(1);
}

function downloadCsvBlob(filename: string, header: string[], rows: Row[]) {
  const lines = rows.map((r) =>
    [r.folio, r.tipo_nombre, r.receptor_razon_social, r.receptor_rut, r.fecha_emision, r.monto_total, r.estado]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PRESETS = [
  { key: "hoy", label: "Hoy" },
  { key: "ayer", label: "Ayer" },
  { key: "7d", label: "Últimos 7 días" },
  { key: "mes", label: "Este mes" },
  { key: "mes_pasado", label: "Mes pasado" },
  { key: "todo", label: "Todo el período" },
] as const;

const CSV_HEADER = ["Folio", "Tipo", "Receptor", "RUT", "Fecha", "Total", "Estado"];

export default function DtePage() {
  const today = useMemo(() => new Date(), []);
  const initial = monthRange(today);
  const [enProduccion, setEnProduccion] = useState(false);

  const [tab, setTab] = useState<"todos" | "facturas" | "boletas">("todos");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("");
  const [desde, setDesde] = useState(initial.desde);
  const [hasta, setHasta] = useState(iso(today));
  const [preset, setPreset] = useState<string>("mes");
  const [montoMin, setMontoMin] = useState("");
  const [montoMax, setMontoMax] = useState("");
  const [ocultarPruebas, setOcultarPruebas] = useState(false);
  const [masFiltros, setMasFiltros] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [sort, setSort] = useState<"fecha_emision" | "folio">("fecha_emision");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<Meta>({ current_page: 1, last_page: 1, per_page: 50, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [docError, setDocError] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const csvRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prod = getAuth()?.tenant?.ambiente === "produccion";
    setEnProduccion(prod);
    setOcultarPruebas(prod);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!csvOpen) return;
    function onDoc(e: MouseEvent) {
      if (csvRef.current && !csvRef.current.contains(e.target as Node)) setCsvOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCsvOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [csvOpen]);

  const buildParams = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams({
        per_page: String(perPage),
        page: String(page),
        desde,
        hasta,
        sort,
        dir,
      });
      if (qDebounced) params.set("q", qDebounced);
      if (montoMin) params.set("monto_min", montoMin);
      if (montoMax) params.set("monto_max", montoMax);
      if (tab === "facturas") params.set("tipo_dte", "33,34");
      else if (tab === "boletas") params.set("tipo_dte", "39,41");
      else if (tipo) params.set("tipo_dte", tipo);
      if (estado) params.set("estado", estado);
      if (ocultarPruebas && enProduccion) params.set("ocultar_pruebas", "1");
      if (extra) {
        for (const [k, v] of Object.entries(extra)) params.set(k, v);
      }
      return params;
    },
    [
      perPage,
      page,
      desde,
      hasta,
      sort,
      dir,
      qDebounced,
      montoMin,
      montoMax,
      tab,
      tipo,
      estado,
      ocultarPruebas,
      enProduccion,
    ],
  );

  const applyPreset = useCallback((key: string) => {
    setPreset(key);
    setPage(1);
    const t = new Date();
    if (key === "hoy") {
      const d = iso(t);
      setDesde(d);
      setHasta(d);
      return;
    }
    if (key === "ayer") {
      const d = iso(shiftDays(t, -1));
      setDesde(d);
      setHasta(d);
      return;
    }
    if (key === "7d") {
      setDesde(iso(shiftDays(t, -6)));
      setHasta(iso(t));
      return;
    }
    if (key === "mes") {
      const r = monthRange(t);
      setDesde(r.desde);
      setHasta(iso(t));
      return;
    }
    if (key === "mes_pasado") {
      const prev = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      const r = monthRange(prev);
      setDesde(r.desde);
      setHasta(r.hasta);
      return;
    }
    setDesde("2020-01-01");
    setHasta(iso(t));
  }, []);

  const clearFilters = useCallback(() => {
    const t = new Date();
    const r = monthRange(t);
    setTab("todos");
    setQ("");
    setQDebounced("");
    setTipo("");
    setEstado("");
    setDesde(r.desde);
    setHasta(iso(t));
    setPreset("mes");
    setMontoMin("");
    setMontoMax("");
    setOcultarPruebas(enProduccion);
    setPage(1);
    setMasFiltros(false);
  }, [enProduccion]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api<{ data: Row[]; meta: Meta }>(`/dte?${buildParams()}`)
      .then((r) => {
        if (cancelled) return;
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setMeta({ current_page: 1, last_page: 1, per_page: perPage, total: 0 });
        setError(err instanceof Error ? err.message : "No se pudo cargar el listado");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buildParams, perPage, reloadKey]);

  const filtersActive = Boolean(
    q.trim() ||
      tipo ||
      estado ||
      montoMin ||
      montoMax ||
      tab !== "todos" ||
      preset !== "mes" ||
      (enProduccion && !ocultarPruebas),
  );

  function toggleSort(field: "fecha_emision" | "folio") {
    setPage(1);
    if (sort === field) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(field);
      setDir(field === "folio" ? "asc" : "desc");
    }
  }

  async function exportCsv(scope: "all" | "page") {
    setCsvBusy(true);
    setCsvOpen(false);
    setDocError("");
    try {
      if (scope === "page") {
        downloadCsvBlob(`documentos_pagina_${desde}_${hasta}.csv`, CSV_HEADER, rows);
        return;
      }
      const r = await api<{ data: Row[]; meta: Meta }>(
        `/dte?${buildParams({ export: "1", page: "1", per_page: "1" })}`,
      );
      downloadCsvBlob(`documentos_${desde}_${hasta}.csv`, CSV_HEADER, r.data);
      if (r.meta.total > r.data.length) {
        setDocError(
          `Se exportaron ${r.data.length.toLocaleString("es-CL")} de ${r.meta.total.toLocaleString("es-CL")} documentos (límite de exportación).`,
        );
      }
    } catch (err: unknown) {
      setDocError(err instanceof Error ? err.message : "No se pudo exportar el CSV");
    } finally {
      setCsvBusy(false);
    }
  }

  async function openDocumento(row: Row, format: "html" | "pdf") {
    setDocError("");
    try {
      const auth = getAuth();
      const res = await fetch(`/api/v1/dte/${row.id}/documento?format=${format}`, {
        headers: {
          Accept: format === "pdf" ? "application/pdf" : "text/html",
          ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
          ...(auth?.tenantId ? { "X-Tenant-Id": String(auth.tenantId) } : {}),
        },
      });
      if (!res.ok) throw new Error(`No se pudo abrir el documento (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (format === "pdf") {
        const a = document.createElement("a");
        a.href = url;
        a.download = `DTE_T${row.tipo_dte}_F${row.folio}.pdf`;
        a.click();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      setDocError(err instanceof Error ? err.message : "No se pudo abrir el documento");
    }
  }

  const subtitle = loading
    ? "Cargando…"
    : error
      ? "No disponible"
      : `${meta.total.toLocaleString("es-CL")} documento${meta.total === 1 ? "" : "s"}`;

  const headerActions = (
    <>
      <div className="relative" ref={csvRef}>
        <button
          type="button"
          disabled={csvBusy || !!error}
          aria-expanded={csvOpen}
          aria-haspopup="menu"
          onClick={() => setCsvOpen((o) => !o)}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-[var(--line)] bg-white px-3 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileSpreadsheet className="h-4 w-4 text-[var(--ink-muted)]" />
          <span className="hidden sm:inline">{csvBusy ? "Exportando…" : "Exportar CSV"}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
        {csvOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1.5 w-64 overflow-hidden rounded-[12px] border border-[var(--line)] bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              onClick={() => void exportCsv("all")}
            >
              <span className="font-semibold text-ink-900">Filtrados completos</span>
              <span className="text-xs text-slate-500">
                {meta.total.toLocaleString("es-CL")} documento{meta.total === 1 ? "" : "s"} con los filtros actuales
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={rows.length === 0}
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-slate-50 disabled:opacity-40"
              onClick={() => void exportCsv("page")}
            >
              <span className="font-semibold text-ink-900">Solo esta página</span>
              <span className="text-xs text-slate-500">
                {rows.length} de {meta.total.toLocaleString("es-CL")} visibles ahora
              </span>
            </button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          setTab("todos");
          setTipo("52");
          setPage(1);
        }}
        title="Filtra el listado a guías de despacho (tipo 52)"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-[var(--line)] bg-white px-3 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-[var(--surface-sunken)]"
      >
        <BookOpen className="h-4 w-4 text-[var(--ink-muted)]" />
        <span className="hidden sm:inline">Guías de despacho</span>
      </button>
    </>
  );

  return (
    <AppShell title="Documentos Tributarios" subtitle={subtitle} actions={headerActions}>
      <div className="space-y-3">
        {(error || docError) && (
          <div
            role="alert"
            className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
          >
            <p className="font-medium">{error || docError}</p>
            {error ? (
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-2 text-sm font-semibold underline underline-offset-2"
              >
                Reintentar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDocError("")}
                className="mt-2 text-sm font-semibold underline underline-offset-2"
              >
                Cerrar
              </button>
            )}
          </div>
        )}

        <section className="pf-card p-4" data-pf-lift="">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {(
                [
                  ["todos", "Todos"],
                  ["facturas", "Facturas"],
                  ["boletas", "Boletas"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setTab(k);
                    setTipo("");
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    tab === k ? "bg-white font-medium text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {enProduccion ? (
              <label
                className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600"
                title="Oculta documentos emitidos en certificación (maullín). No son ventas de producción."
              >
                <input
                  type="checkbox"
                  checked={ocultarPruebas}
                  onChange={(e) => {
                    setOcultarPruebas(e.target.checked);
                    setPage(1);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                />
                Ocultar pruebas de certificación
              </label>
            ) : (
              <p className="text-xs text-slate-500" title="En certificación todos los DTE son de prueba ante el SII.">
                Certificación · se muestran todos los documentos
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full sm:min-w-[220px] sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-brand-600/30"
                placeholder="Buscar folio, nombre o RUT…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                aria-label="Buscar documentos"
              />
            </div>
            <div className="w-full sm:w-52">
              <select
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-brand-600/30 disabled:bg-slate-50"
                value={tipo}
                disabled={tab !== "todos"}
                aria-label="Tipo de DTE"
                onChange={(e) => {
                  setTipo(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos los tipos</option>
                {TIPOS_DTE.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-44">
              <select
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-brand-600/30"
                value={estado}
                aria-label="Estado"
                onChange={(e) => {
                  setEstado(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos los estados</option>
                {["aceptado", "enviado", "rechazado", "pendiente", "anulado"].map((e) => (
                  <option key={e} value={e}>
                    {labelEstado(e)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setMasFiltros((v) => !v)}
              aria-expanded={masFiltros}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition",
                masFiltros || montoMin || montoMax
                  ? "border-brand-600/30 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Más filtros
            </button>
            {filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
                Limpiar
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                aria-pressed={preset === p.key}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  preset === p.key
                    ? "border border-brand-600/30 bg-brand-50 font-semibold text-brand-700"
                    : p.key === "todo"
                      ? "text-slate-500 hover:text-slate-700"
                      : "border border-slate-200 text-slate-600 hover:border-brand-600/40 hover:text-brand-700",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {masFiltros ? (
            <div className="mt-3 grid grid-cols-2 items-end gap-3 border-t border-slate-100 pt-3 sm:flex sm:flex-wrap">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Desde</label>
                <input
                  type="date"
                  max={hasta}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-600/30 sm:w-auto"
                  value={desde}
                  onChange={(e) => {
                    setDesde(e.target.value);
                    setPreset("");
                    setPage(1);
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Hasta</label>
                <input
                  type="date"
                  min={desde}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-600/30 sm:w-auto"
                  value={hasta}
                  onChange={(e) => {
                    setHasta(e.target.value);
                    setPreset("");
                    setPage(1);
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Monto mín.</label>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-600/30 sm:w-32"
                  value={montoMin}
                  onChange={(e) => {
                    setMontoMin(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Monto máx.</label>
                <input
                  type="number"
                  min={0}
                  placeholder="Sin tope"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-600/30 sm:w-32"
                  value={montoMax}
                  onChange={(e) => {
                    setMontoMax(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <p className="col-span-2 text-xs text-slate-500 sm:basis-full">
                Rango inclusivo: {formatFecha(desde)} → {formatFecha(hasta)}.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              {formatFecha(desde)} → {formatFecha(hasta)}
              {montoMin || montoMax
                ? ` · montos ${montoMin || "0"}–${montoMax || "sin tope"}`
                : ""}
            </p>
          )}
        </section>

        <section className="overflow-hidden rounded-[16px] border border-[var(--line)] bg-white shadow-pf-1">
          {loading ? (
            <div className="grid place-items-center py-16 text-sm text-slate-500" aria-live="polite" aria-busy="true">
              Cargando documentos…
            </div>
          ) : error ? (
            <div className="grid place-items-center py-16 text-center">
              <p className="font-medium text-ink-900">No se pudo cargar el listado</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-4 inline-flex h-9 items-center rounded-[10px] bg-[var(--fiscal)] px-4 text-sm font-semibold text-white"
              >
                Reintentar
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="grid place-items-center py-16 text-center">
              {filtersActive ? (
                <>
                  <p className="font-medium text-ink-900">Sin resultados con estos filtros</p>
                  <p className="mt-1 text-sm text-slate-500">Prueba ampliar el período o limpiar la búsqueda.</p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[var(--line)] bg-white px-4 text-sm font-semibold text-slate-700"
                  >
                    <X className="h-4 w-4" />
                    Limpiar filtros
                  </button>
                </>
              ) : (
                <>
                  <p className="font-medium text-ink-900">Aún no hay documentos</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Emite tu primer DTE con <strong>Nuevo DTE</strong>.
                  </p>
                  <Link
                    href="/dte/nuevo"
                    className="mt-4 inline-flex h-9 items-center rounded-[10px] bg-[var(--fiscal)] px-4 text-sm font-semibold text-white"
                  >
                    Nuevo DTE
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500"
                      aria-sort={sort === "folio" ? (dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort("folio")}
                        className="inline-flex min-h-9 items-center gap-1 transition-colors hover:text-brand-700"
                      >
                        Folio
                        <ChevronDown className={cn("h-3.5 w-3.5", sort === "folio" && dir === "asc" && "rotate-180")} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Receptor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">RUT</th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500"
                      aria-sort={
                        sort === "fecha_emision" ? (dir === "asc" ? "ascending" : "descending") : "none"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort("fecha_emision")}
                        className="inline-flex min-h-9 items-center gap-1 transition-colors hover:text-brand-700"
                      >
                        Fecha
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5",
                            sort === "fecha_emision" && dir === "asc" && "rotate-180",
                          )}
                        />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Estado</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-ink-900">#{r.folio}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-[color-mix(in_srgb,var(--fiscal)_14%,transparent)] bg-[var(--fiscal-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-fiscal">
                          {r.tipo_nombre}
                        </span>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 font-medium text-ink-900">
                        {r.receptor_razon_social}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{r.receptor_rut}</td>
                      <td className="px-4 py-3 text-slate-600">{formatFecha(r.fecha_emision)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatCLP(r.monto_total)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                            estadoTone(r.estado),
                          )}
                        >
                          {labelEstado(r.estado)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void openDocumento(r, "html")}
                            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-fiscal"
                            title="Abrir documento"
                            aria-label={`Abrir documento folio ${r.folio}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void openDocumento(r, "pdf")}
                            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-fiscal"
                            title="Descargar PDF"
                            aria-label={`Descargar PDF folio ${r.folio}`}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <Link
                            href={`/dte/${r.id}`}
                            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-fiscal"
                            title="Ver detalle"
                            aria-label={`Ver detalle folio ${r.folio}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && meta.total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <select
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  value={perPage}
                  aria-label="Documentos por página"
                  onChange={(e) => {
                    setPerPage(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n} / pág.
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span>
                  Página {meta.current_page} de {meta.last_page}
                </span>
                <button
                  type="button"
                  disabled={meta.current_page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 disabled:opacity-40"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={meta.current_page >= meta.last_page}
                  onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 disabled:opacity-40"
                  aria-label="Página siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
