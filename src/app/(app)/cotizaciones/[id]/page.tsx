"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, getAuth } from "@/lib/api";
import { cn, formatCLP } from "@/lib/utils";
import { formatRutPuntos } from "@/lib/sii/rut";
import type { Cotizacion } from "@/lib/types";

const ESTADOS: Cotizacion["estado"][] = ["guardada", "enviada", "aceptada", "rechazada", "anulada"];
const DESTRUCTIVE = new Set(["rechazada", "anulada"]);

function formatFecha(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}-${m}-${y}`;
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
  return map[estado] || estado;
}

function estadoTone(estado: string) {
  if (estado === "aceptada") return "bg-[var(--ok-soft)] text-[var(--ok)] border-[color-mix(in_srgb,var(--ok)_20%,transparent)]";
  if (estado === "enviada") return "bg-[var(--fiscal-soft)] text-fiscal border-[color-mix(in_srgb,var(--fiscal)_18%,transparent)]";
  if (estado === "rechazada" || estado === "anulada")
    return "bg-[var(--danger-soft)] text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export default function CotizacionDetallePage() {
  const params = useParams();
  const id = String(params.id || "");
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState<"html" | "pdf" | null>(null);
  const [confirmEstado, setConfirmEstado] = useState<Cotizacion["estado"] | null>(null);

  async function fetchDocumento(format: "html" | "pdf") {
    if (!cot) return;
    setLoadingDoc(format);
    setError("");
    try {
      const auth = getAuth();
      const res = await fetch(`/api/v1/cotizaciones/${cot.id}/documento?format=${format}`, {
        headers: {
          Accept: format === "pdf" ? "application/pdf" : "text/html",
          ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
          ...(auth?.tenantId ? { "X-Tenant-Id": String(auth.tenantId) } : {}),
        },
      });
      if (!res.ok) {
        let msg = `Error ${res.status}`;
        try {
          const j = (await res.json()) as { message?: string };
          if (j.message) msg = j.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      if (format === "pdf") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${cot.numero}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const html = await res.text();
        const w = window.open("", "_blank");
        if (!w) throw new Error("El navegador bloqueó la ventana emergente");
        w.document.write(html);
        w.document.close();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el documento");
    } finally {
      setLoadingDoc(null);
    }
  }

  async function load() {
    try {
      const r = await api<{ data: Cotizacion }>(`/cotizaciones/${id}`);
      setCot(r.data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No encontrada");
    }
  }

  useEffect(() => {
    if (id) void load();
  }, [id]);

  async function applyEstado(estado: Cotizacion["estado"]) {
    if (!cot) return;
    setSaving(true);
    setError("");
    try {
      const r = await api<{ data: Cotizacion }>(`/cotizaciones/${cot.id}`, {
        method: "PUT",
        body: JSON.stringify({ estado }),
      });
      setCot(r.data);
      setConfirmEstado(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  }

  function requestEstado(estado: Cotizacion["estado"]) {
    if (DESTRUCTIVE.has(estado) && cot?.estado !== estado) {
      setConfirmEstado(estado);
      return;
    }
    void applyEstado(estado);
  }

  async function marcarEnviadaYPdf() {
    if (!cot) return;
    if (cot.estado === "guardada" || cot.estado === "borrador") {
      await applyEstado("enviada");
    }
    await fetchDocumento("pdf");
  }

  if (error && !cot) {
    return (
      <AppShell title="Cotización">
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
        <Link href="/cotizaciones" className="mt-3 inline-block text-sm text-brand-700">
          ← Volver
        </Link>
      </AppShell>
    );
  }

  if (!cot) {
    return (
      <AppShell title="Cotización">
        <p className="text-sm text-slate-500" aria-live="polite">
          Cargando…
        </p>
      </AppShell>
    );
  }

  const vence = (() => {
    const d = new Date(`${cot.fecha}T12:00:00`);
    d.setDate(d.getDate() + cot.validez_dias);
    return d.toISOString().slice(0, 10);
  })();

  const puedeConvertir = cot.estado === "aceptada" || cot.estado === "enviada" || cot.estado === "guardada";

  return (
    <AppShell title={cot.numero} subtitle={`${cot.receptor_razon_social} · ${formatFecha(cot.fecha)}`}>
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/cotizaciones"
            className="inline-flex h-9 items-center rounded-[10px] border border-slate-200 bg-white px-3 text-sm"
          >
            ← Volver
          </Link>
          <Link
            href={`/cotizaciones/${cot.id}/editar`}
            className="inline-flex h-9 items-center rounded-[10px] border border-slate-200 bg-white px-3 text-sm font-medium"
          >
            Editar
          </Link>
        </div>

        {/* Climax commercial actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => void marcarEnviadaYPdf()}
            disabled={loadingDoc !== null || saving}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-[10px] bg-[var(--fiscal)] px-4 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none"
          >
            {loadingDoc === "pdf" || saving ? "Preparando…" : "Enviar / Descargar PDF"}
          </button>
          <button
            type="button"
            onClick={() => void fetchDocumento("html")}
            disabled={loadingDoc !== null}
            className="inline-flex h-10 items-center justify-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium disabled:opacity-60"
          >
            {loadingDoc === "html" ? "Abriendo…" : "Ver / imprimir"}
          </button>
          {puedeConvertir ? (
            <div className="flex flex-1 flex-wrap gap-2 sm:flex-none">
              <Link
                href={`/dte/nuevo?tipo=33&cotizacion=${cot.id}`}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-[10px] border border-[color-mix(in_srgb,var(--fiscal)_30%,transparent)] bg-[var(--fiscal-soft)] px-4 text-sm font-semibold text-fiscal sm:flex-none"
              >
                Convertir a factura
              </Link>
              <Link
                href={`/dte/nuevo?tipo=39&cotizacion=${cot.id}`}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-medium sm:flex-none"
              >
                Convertir a boleta
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {confirmEstado ? (
        <div
          role="alertdialog"
          aria-labelledby="confirm-estado-title"
          className="mb-4 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <p id="confirm-estado-title" className="font-medium">
            ¿Marcar como {labelEstado(confirmEstado).toLowerCase()}?
          </p>
          <p className="mt-1 text-[var(--ink-muted)]">Esta acción no se puede deshacer fácilmente.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void applyEstado(confirmEstado)}
              className="inline-flex h-9 items-center rounded-[10px] bg-[var(--danger)] px-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              Confirmar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirmEstado(null)}
              className="inline-flex h-9 items-center rounded-[10px] border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="card space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">Estado</p>
            <span
              className={cn(
                "mt-1 inline-flex rounded-full border px-2.5 py-0.5 text-sm font-semibold",
                estadoTone(cot.estado),
              )}
            >
              {labelEstado(cot.estado)}
            </span>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[220px]">
            <label htmlFor="cot-estado" className="mb-1 block text-xs font-medium text-slate-500">
              Cambiar estado
            </label>
            <select
              id="cot-estado"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-50"
              value={cot.estado}
              disabled={saving || cot.estado === "anulada"}
              onChange={(e) => requestEstado(e.target.value as Cotizacion["estado"])}
            >
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {labelEstado(e)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">Rechazada y anulada piden confirmación.</p>
          </div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Cliente</p>
            <p className="font-medium">{cot.receptor_razon_social}</p>
            <p>{formatRutPuntos(cot.receptor_rut)}</p>
            {cot.receptor_comuna ? <p className="text-slate-600">{cot.receptor_comuna}</p> : null}
            {cot.receptor_email ? <p className="text-slate-600">{cot.receptor_email}</p> : null}
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Condiciones</p>
            <p>Fecha {formatFecha(cot.fecha)}</p>
            <p>
              Válida {cot.validez_dias} días · hasta {formatFecha(vence)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">Detalle</th>
                <th className="py-2 text-right">Cant.</th>
                <th className="py-2 text-right">Precio</th>
                <th className="py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {cot.items.map((it, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="py-2">
                    {it.nombre}
                    {it.exento ? <span className="ml-1 text-xs text-slate-400">(exento)</span> : null}
                  </td>
                  <td className="py-2 text-right tabular-nums">{it.cantidad}</td>
                  <td className="py-2 text-right tabular-nums">{formatCLP(it.precio)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatCLP(Math.round(it.cantidad * it.precio))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Neto</span>
            <span>{formatCLP(cot.neto)}</span>
          </div>
          {cot.exento > 0 && (
            <div className="flex justify-between">
              <span>Exento</span>
              <span>{formatCLP(cot.exento)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>IVA 19%</span>
            <span>{formatCLP(cot.iva)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{formatCLP(cot.total)}</span>
          </div>
        </div>

        {cot.notas ? (
          <div className="rounded-xl border border-slate-100 p-3 text-sm text-slate-600">
            <p className="mb-1 text-xs font-medium uppercase text-slate-400">Notas</p>
            {cot.notas}
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
