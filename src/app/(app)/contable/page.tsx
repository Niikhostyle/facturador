"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import type { LineaLibro } from "@/lib/contable";
import { btnSecondary, card, input } from "@/lib/ui";
import { buildPeriodos, cn, formatCLP, periodoLabel } from "@/lib/utils";

type Montos = { exento: number; neto: number; iva: number; total: number };
type Tipo = Montos & { tipo_dte: number; tipo_nombre: string; cantidad: number };
type Resumen = {
  periodo: string;
  ventas: Montos & { documentos: number; por_tipo: Tipo[]; lineas: LineaLibro[] };
  compras: { neto: number; iva: number; total: number; documentos: number } | null;
  iva_a_pagar: number | null;
};

const ERR = "rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]";
const TH = "px-4 py-2 text-right text-xs font-medium text-[var(--ink-muted)]";
const TD = "px-4 py-2.5 text-right tabular-nums";

function csv(r: Resumen) {
  const cel = (v: string | number) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const filas = [
    ["Fecha", "Tipo", "Documento", "Folio", "RUT receptor", "Razón social", "Exento", "Neto", "IVA", "Total"],
    ...r.ventas.lineas.map((l) => [l.fecha_emision, l.tipo_dte, l.tipo_nombre, l.folio, l.receptor_rut, l.receptor_razon_social, l.exento, l.neto, l.iva, l.total]),
  ];
  // BOM + ";" para que Excel en es-CL lo abra en columnas y con tildes.
  const blob = new Blob(["﻿" + filas.map((f) => f.map(cel).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `libro-ventas-${r.periodo}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ContablePage() {
  const periodos = useMemo(() => buildPeriodos(), []);
  const [periodo, setPeriodo] = useState(periodos[0]);
  const [data, setData] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [loadError, setLoadError] = useState("");
  const reqId = useRef(0);

  const load = useCallback(async (p: string) => {
    const id = ++reqId.current;
    setCargando(true);
    setLoadError("");
    try {
      const r = await api<{ data: Resumen }>(`/contable?periodo=${encodeURIComponent(p)}`);
      if (id === reqId.current) setData(r.data);
    } catch (e) {
      if (id === reqId.current) {
        setData(null);
        setLoadError(e instanceof Error ? e.message : "No pudimos cargar el resumen contable.");
      }
    } finally {
      if (id === reqId.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void load(periodo);
    return () => {
      reqId.current++;
    };
  }, [periodo, load]);

  const v = data?.ventas;
  const c = data?.compras;
  const pagar = data?.iva_a_pagar ?? null;
  const sinPlan = /plan/i.test(loadError);

  return (
    <AppShell title="Contable" subtitle="Ventas, compras e IVA del período para preparar el F29">
      {loadError && (
        <p role="alert" className={cn("mb-3 flex flex-wrap items-center justify-between gap-2", ERR)}>
          {loadError}
          {sinPlan ? (
            <Link href="/suscripcion" className="font-semibold underline underline-offset-2">Ver planes</Link>
          ) : (
            <button type="button" onClick={() => void load(periodo)} className="font-semibold underline underline-offset-2">Reintentar</button>
          )}
        </p>
      )}

      <div className={cn(card, "flex flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between")}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-48 space-y-1">
            <span className="text-xs font-medium text-[var(--ink-muted)]">Período</span>
            <select className={input} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {periodos.map((p) => (
                <option key={p} value={p}>{periodoLabel(p)}</option>
              ))}
            </select>
          </label>
          <button type="button" className={btnSecondary} disabled={!v?.documentos} onClick={() => data && csv(data)}>
            <Download aria-hidden className="h-4 w-4 text-[var(--ink-muted)]" />
            Exportar libro de ventas (CSV)
          </button>
        </div>

        <dl className={cn("flex flex-wrap gap-x-10 gap-y-3 transition-opacity", cargando && "opacity-60")} aria-busy={cargando} aria-live="polite">
          <div>
            <dt className="text-xs font-medium text-[var(--ink-muted)]">IVA débito</dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{v ? formatCLP(v.iva) : "—"}</dd>
            <dd className="text-xs text-[var(--ink-muted)]">De tus ventas, notas de crédito ya restadas</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--ink-muted)]">IVA crédito</dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{c ? formatCLP(c.iva) : "—"}</dd>
            <dd className="text-xs text-[var(--ink-muted)]">
              {data && !c ? (
                <>Requiere el módulo <Link href="/suscripcion" className="underline underline-offset-2">Recibidos</Link></>
              ) : (
                `De ${c?.documentos ?? 0} factura${c?.documentos === 1 ? "" : "s"} de compra, sin las reclamadas`
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--ink-muted)]">{pagar !== null && pagar < 0 ? "Remanente de crédito" : "IVA a pagar (estimado)"}</dt>
            <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{pagar !== null ? formatCLP(Math.abs(pagar)) : "—"}</dd>
            <dd className="text-xs text-[var(--ink-muted)]">Débito menos crédito, antes de PPM y retenciones</dd>
          </div>
        </dl>
      </div>

      <section className={cn(card, "mt-4")} aria-labelledby="ventas-tipo">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
          <h2 id="ventas-tipo" className="font-display text-base font-semibold">Ventas de {periodoLabel(periodo)}</h2>
          {v ? <p className="text-sm tabular-nums text-[var(--ink-muted)]">{v.documentos} documento{v.documentos === 1 ? "" : "s"}</p> : null}
        </div>
        {cargando && !data ? (
          <p className="flex items-center gap-2 p-4 text-sm text-[var(--ink-muted)]" role="status">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Cargando resumen…
          </p>
        ) : !v ? null : !v.documentos ? (
          <p className="p-4 text-sm text-[var(--ink-muted)]">
            No emitiste documentos en {periodoLabel(periodo)}. <Link href="/dte" className="font-medium text-[var(--pulso)] underline underline-offset-2">Emitir un DTE</Link>
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-[var(--line)]">
                <tr>
                  <th scope="col" className={cn(TH, "text-left")}>Tipo</th>
                  <th scope="col" className={TH}>Docs</th>
                  <th scope="col" className={TH}>Exento</th>
                  <th scope="col" className={TH}>Neto</th>
                  <th scope="col" className={TH}>IVA</th>
                  <th scope="col" className={TH}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {v.por_tipo.map((t) => (
                  <tr key={t.tipo_dte}>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium">
                      {t.tipo_nombre}<span className="text-xs font-normal text-[var(--ink-muted)]"> · {t.tipo_dte}</span>
                    </th>
                    <td className={TD}>{t.cantidad}</td>
                    <td className={TD}>{formatCLP(t.exento)}</td>
                    <td className={TD}>{formatCLP(t.neto)}</td>
                    <td className={TD}>{formatCLP(t.iva)}</td>
                    <td className={TD}>{formatCLP(t.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-[var(--line-strong)] font-semibold">
                <tr>
                  <th scope="row" className="px-4 py-2.5 text-left">Total</th>
                  <td className={TD}>{v.documentos}</td>
                  <td className={TD}>{formatCLP(v.exento)}</td>
                  <td className={TD}>{formatCLP(v.neto)}</td>
                  <td className={TD}>{formatCLP(v.iva)}</td>
                  <td className={TD}>{formatCLP(v.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--ink-muted)]">
          Fuente: documentos emitidos desde esta app, sin rechazados ni guías de despacho. No reemplaza el Registro de Compras y Ventas del SII.
          {c ? ` Compras del período: ${formatCLP(c.neto)} neto.` : ""}
        </p>
      </section>
    </AppShell>
  );
}
