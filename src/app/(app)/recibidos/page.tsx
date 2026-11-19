"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Package, RefreshCw, Search, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import type { MotivoReclamo, RecibidoItem } from "@/lib/types";
import { btnDanger, btnSecondary, card, dialogCls, input } from "@/lib/ui";
import { buildPeriodos, cn, formatCLP, periodoLabel } from "@/lib/utils";
import { RecibidosFeatureGate } from "./guard";

type Meta = {
  periodo: string | null;
  total: number;
  credito_fiscal: number;
  estados: { aceptadas: number; reclamables: number; reclamadas: number };
};

type Filtro = "todas" | RecibidoItem["estado"];

const PLAZO_DIAS = 8;
const AVISO_KEY = "recibidos:aviso-reales";

const MOTIVOS: { value: MotivoReclamo; label: string; hint: string }[] = [
  { value: "RCD", label: "Reclamo al contenido", hint: "Montos, datos o productos que no corresponden." },
  { value: "RFP", label: "Falta parcial de mercaderías", hint: "Llegó solo una parte de lo facturado." },
  { value: "RFT", label: "Falta total de mercaderías", hint: "No llegó nada de lo facturado." },
];

function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function fechaCorta(s: string) {
  return parseYmd(s).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

/** Días que quedan para reclamar (desde la recepción en el SII). null si el SII no informó recepción. */
function diasRestantes(r: RecibidoItem): number | null {
  if (r.estado !== "reclamable" || !r.fecha_recepcion) return null;
  const vence = parseYmd(r.fecha_recepcion);
  vence.setDate(vence.getDate() + PLAZO_DIAS);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((vence.getTime() - hoy.getTime()) / 86_400_000);
}

function plazoTexto(dias: number) {
  if (dias <= 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  return `Vence en ${dias} días`;
}

const BADGE: Record<RecibidoItem["estado"], { label: string; className: string }> = {
  aceptada: { label: "Aceptada", className: "bg-[var(--surface-sunken)] text-[var(--ink-muted)]" },
  reclamable: { label: "Por reclamar", className: "bg-[var(--warn-soft)] text-[var(--warn)]" },
  reclamada: { label: "Reclamada", className: "bg-[var(--danger-soft)] text-[var(--danger)]" },
};

export default function RecibidosPage() {
  return (
    <AppShell title="Facturas recibidas" subtitle="Lo que tus proveedores te emitieron, según el registro del SII">
      <RecibidosFeatureGate>
        <Recibidos />
      </RecibidosFeatureGate>
    </AppShell>
  );
}

function Recibidos() {
  const periodos = useMemo(() => buildPeriodos(), []);
  const [periodo, setPeriodo] = useState(periodos[0] || "");
  const [rows, setRows] = useState<RecibidoItem[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [q, setQ] = useState("");
  const [aviso, setAviso] = useState(true);

  const dlgRef = useRef<HTMLDialogElement>(null);
  const [objetivo, setObjetivo] = useState<RecibidoItem | null>(null);
  const [motivo, setMotivo] = useState<MotivoReclamo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [dlgError, setDlgError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(AVISO_KEY) === "1") setAviso(false);
    } catch {}
  }, []);

  function cerrarAviso() {
    setAviso(false);
    try {
      localStorage.setItem(AVISO_KEY, "1");
    } catch {}
  }

  const load = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ data: RecibidoItem[]; meta?: Meta }>(
        `/dte/recibidos?periodo=${encodeURIComponent(p)}&per_page=100`,
      );
      setRows(res.data || []);
      setMeta(res.meta ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las facturas recibidas.");
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (periodo) void load(periodo);
  }, [periodo, load]);

  async function traerDelSii() {
    setSyncing(true);
    setFlash(null);
    setError(null);
    try {
      const res = await api<{ message?: string; nuevos?: number }>(`/dte/recibidos/sync`, {
        method: "POST",
        body: JSON.stringify({ periodo }),
      });
      await load(periodo);
      setFlash(
        res.message ||
          (typeof res.nuevos === "number"
            ? `El SII informó ${res.nuevos} factura${res.nuevos === 1 ? "" : "s"} de compra para ${periodoLabel(periodo)}.`
            : `Listo: actualizamos ${periodoLabel(periodo)} con el registro del SII.`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar el SII. Inténtalo de nuevo en unos minutos.");
    } finally {
      setSyncing(false);
    }
  }

  function abrirReclamo(r: RecibidoItem) {
    setObjetivo(r);
    setMotivo(null);
    setDlgError(null);
    dlgRef.current?.showModal();
  }

  async function confirmarReclamo() {
    if (!objetivo || !motivo || enviando) return;
    setEnviando(true);
    setDlgError(null);
    try {
      await api(`/dte/recibidos/${objetivo.id}/reclamar`, {
        method: "POST",
        body: JSON.stringify({ motivo }),
      });
      dlgRef.current?.close();
      setFlash(
        `Reclamaste la ${objetivo.tipo_nombre} folio ${objetivo.folio} de ${objetivo.emisor_razon_social}. La aceptación tácita quedó detenida.`,
      );
      await load(periodo);
    } catch (e) {
      setDlgError(e instanceof Error ? e.message : "No se pudo registrar el reclamo. No se envió nada; inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtradas = rows.filter(
      (r) =>
        (filtro === "todas" || r.estado === filtro) &&
        (!term ||
          r.emisor_razon_social.toLowerCase().includes(term) ||
          r.emisor_rut.toLowerCase().includes(term) ||
          String(r.folio).includes(term)),
    );
    // Lo que todavía se puede reclamar va primero, la que vence antes arriba.
    return filtradas
      .map((r) => ({ r, dias: diasRestantes(r) }))
      .sort((a, b) => {
        const ar = a.r.estado === "reclamable" ? 0 : 1;
        const br = b.r.estado === "reclamable" ? 0 : 1;
        if (ar !== br) return ar - br;
        if (ar === 0) return (a.dias ?? 99) - (b.dias ?? 99);
        return b.r.fecha_emision.localeCompare(a.r.fecha_emision);
      });
  }, [rows, filtro, q]);

  const urgentes = useMemo(
    () => rows.filter((r) => {
      const d = diasRestantes(r);
      return d !== null && d <= 2;
    }).length,
    [rows],
  );

  const estados = meta?.estados;
  const filtros: { value: Filtro; label: string; n?: number }[] = [
    { value: "todas", label: "Todas", n: meta?.total },
    { value: "reclamable", label: "Por reclamar", n: estados?.reclamables },
    { value: "aceptada", label: "Aceptadas", n: estados?.aceptadas },
    { value: "reclamada", label: "Reclamadas", n: estados?.reclamadas },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      {aviso ? (
        <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-warn-soft bg-[var(--warn-soft)] px-4 py-3 text-sm text-[var(--warn)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="flex-1">
            Tu empresa todavía emite en ambiente de prueba, pero estas facturas recibidas son <strong>reales</strong>:
            vienen del registro del SII.
          </p>
          <button
            type="button"
            onClick={cerrarAviso}
            aria-label="Ocultar aviso"
            className="-m-1 rounded p-1 hover:bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--warn)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <div role="status" aria-live="polite">
        {flash ? (
          <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--ok)_25%,transparent)] bg-[var(--ok-soft)] px-4 py-3 text-sm text-[var(--ok)]">
            {flash}
          </div>
        ) : null}
      </div>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-danger-soft bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void load(periodo)} className="font-semibold underline underline-offset-2">
            Reintentar
          </button>
        </div>
      ) : null}

      {/* Periodo + resumen: lo que pesa para el F29 y lo que hay que atender */}
      <div className={cn(card, "flex flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between")}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-48 space-y-1">
            <span className="text-xs font-medium text-[var(--ink-muted)]">Periodo</span>
            <select className={input} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {periodos.map((p) => (
                <option key={p} value={p}>
                  {periodoLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void traerDelSii()}
            disabled={syncing}
            aria-busy={syncing}
            className={btnSecondary}
          >
            <RefreshCw className={cn("h-4 w-4 text-[var(--ink-muted)]", syncing && "animate-spin")} aria-hidden />
            {syncing ? "Consultando al SII…" : "Traer del SII"}
          </button>
        </div>

        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <dt className="text-xs font-medium text-[var(--ink-muted)]">Crédito fiscal del periodo</dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink-900">
              {meta ? formatCLP(meta.credito_fiscal || 0) : "—"}
            </dd>
            <dd className="text-xs text-[var(--ink-muted)]">IVA que descuentas en el F29, sin las reclamadas</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--ink-muted)]">Por reclamar</dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink-900">
              {estados ? estados.reclamables : "—"}
            </dd>
            <dd className={cn("text-xs", urgentes ? "font-semibold text-[var(--warn)]" : "text-[var(--ink-muted)]")}>
              {urgentes
                ? `${urgentes} vence${urgentes === 1 ? "" : "n"} en 2 días o menos`
                : "Tienes 8 días desde que llegan al SII"}
            </dd>
          </div>
        </dl>
      </div>

      <section className={card} aria-label="Facturas de compra del periodo">
        <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 md:flex-row md:items-center md:justify-between">
          <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
            {filtros.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filtro === f.value}
                onClick={() => setFiltro(f.value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]",
                  filtro === f.value
                    ? "bg-[var(--fiscal)] text-white"
                    : "text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink)]",
                )}
              >
                {f.label}
                {typeof f.n === "number" ? <span className="tabular-nums opacity-75">{f.n}</span> : null}
              </button>
            ))}
          </div>
          <label className="relative block md:w-72">
            <span className="sr-only">Buscar por proveedor, RUT o folio</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Proveedor, RUT o folio"
              className={cn(input, "h-9 pl-9")}
            />
          </label>
        </div>

        {loading ? (
          <div role="status" className="py-12 text-center text-sm text-[var(--ink-muted)]">
            Cargando facturas…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-[var(--line-strong)]" aria-hidden />
            <p className="mx-auto max-w-md text-sm text-[var(--ink-muted)]">
              No hay facturas de compra registradas en {periodoLabel(periodo)}. Si crees que debería haberlas, usa
              Traer del SII.
            </p>
          </div>
        ) : visibles.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--ink-muted)]">
            Ninguna factura coincide con el filtro.{" "}
            <button
              type="button"
              onClick={() => {
                setFiltro("todas");
                setQ("");
              }}
              className="font-semibold text-[var(--fiscal)] underline underline-offset-2"
            >
              Ver todas
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-[var(--line)] bg-[var(--surface-sunken)] text-xs text-[var(--ink-muted)]">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">Proveedor</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Documento</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Emisión</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Neto</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">IVA</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">Total</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Estado</th>
                  <th scope="col" className="px-5 py-2.5">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {visibles.map(({ r, dias }) => {
                  const badge = BADGE[r.estado];
                  return (
                    <tr key={r.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink-900">{r.emisor_razon_social}</p>
                        <p className="text-xs tabular-nums text-[var(--ink-muted)]">{r.emisor_rut}</p>
                      </td>
                      <td className="px-5 py-3 text-[var(--ink)]">
                        {r.tipo_nombre}
                        <span className="block text-xs tabular-nums text-[var(--ink-muted)]">Folio {r.folio}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-[var(--ink)]">{fechaCorta(r.fecha_emision)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{formatCLP(r.monto_neto)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{formatCLP(r.monto_iva)}</td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums">{formatCLP(r.monto_total)}</td>
                      <td className="px-5 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", badge.className)}>
                          {badge.label}
                        </span>
                        {dias !== null ? (
                          <span
                            className={cn(
                              "mt-1 block text-xs",
                              dias <= 2 ? "font-semibold text-[var(--warn)]" : "text-[var(--ink-muted)]",
                            )}
                          >
                            {plazoTexto(dias)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {r.estado === "reclamable" ? (
                          <button
                            type="button"
                            onClick={() => abrirReclamo(r)}
                            aria-label={`Reclamar ${r.tipo_nombre} folio ${r.folio} de ${r.emisor_razon_social}`}
                            className={cn(btnSecondary, "h-8 px-3 text-xs")}
                          >
                            Reclamar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="border-t border-[var(--line)] px-5 py-4 text-[13px] leading-relaxed text-[var(--ink-muted)]">
          Reclamar una factura acá la registra ante el SII y corta la aceptación tácita. Esa es la única defensa legal
          si el documento llega a juicio: sin reclamo a tiempo, el SII la da por aceptada.
        </p>
      </section>

      <dialog
        ref={dlgRef}
        aria-labelledby="dlg-reclamo"
        className={dialogCls}
        onCancel={(e) => enviando && e.preventDefault()}
        onClose={() => setObjetivo(null)}
      >
        {objetivo ? (
          <form
            className="space-y-5 p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmarReclamo();
            }}
          >
            <div>
              <h2 id="dlg-reclamo" className="font-display text-lg font-semibold">
                ¿Reclamar esta factura ante el SII?
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                El reclamo no se puede deshacer y la factura deja de darte crédito fiscal.
              </p>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-4 py-3 text-sm">
              <dt className="text-[var(--ink-muted)]">Proveedor</dt>
              <dd className="font-medium">
                {objetivo.emisor_razon_social} <span className="text-[var(--ink-muted)]">· {objetivo.emisor_rut}</span>
              </dd>
              <dt className="text-[var(--ink-muted)]">Documento</dt>
              <dd className="tabular-nums">
                {objetivo.tipo_nombre} folio {objetivo.folio}
              </dd>
              <dt className="text-[var(--ink-muted)]">Total</dt>
              <dd className="font-medium tabular-nums">{formatCLP(objetivo.monto_total)}</dd>
            </dl>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Motivo del reclamo</legend>
              {MOTIVOS.map((m) => (
                <label
                  key={m.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm transition",
                    motivo === m.value
                      ? "border-[var(--fiscal)] bg-[var(--fiscal-soft)]"
                      : "border-[var(--line)] hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  <input
                    type="radio"
                    name="motivo"
                    value={m.value}
                    checked={motivo === m.value}
                    onChange={() => setMotivo(m.value)}
                    className="mt-0.5 accent-[var(--fiscal)]"
                  />
                  <span>
                    <span className="font-medium">{m.label}</span>
                    <span className="block text-xs text-[var(--ink-muted)]">{m.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {dlgError ? (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {dlgError}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={btnSecondary} disabled={enviando} onClick={() => dlgRef.current?.close()}>
                Cancelar
              </button>
              <button type="submit" className={btnDanger} disabled={!motivo || enviando} aria-busy={enviando}>
                {enviando ? "Reclamando…" : "Reclamar factura"}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </div>
  );
}
