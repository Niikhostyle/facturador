"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { btnPrimary, btnSecondary, card, dialogCls } from "@/lib/ui";
import {
  MAX_DOCS,
  TIPOS_PLANILLA,
  clp,
  erroresCsv,
  nombreColumna,
  payloadEmision,
  revisarPlanilla,
  type DocPlanilla,
  type Revision,
} from "@/lib/planilla";

type CafEstado = { data: { tipos: { tipo_dte: number; disponibles: number }[] } };
type SiiConfig = { data: { ambiente: "certificacion" | "produccion" } };
type Emitido = { huella: string; folio?: number; dte_id?: number; carga: string };
type ResultadoDoc =
  | { estado: "emitiendo" }
  | { estado: "emitido"; folio: number; dte_id: number; sii?: string }
  | { estado: "fallido"; error: string; duplicado?: boolean };
type CargaResumen = {
  id: string;
  archivo: string;
  creada_at: string;
  ambiente: "certificacion" | "produccion";
  emitidos: number;
  fallidos: number;
  pendientes: number;
  estado: "sin_emitir" | "incompleta" | "con_fallos" | "emitida";
};
type CargaDetalle = CargaResumen & {
  documentos: { doc_id: string; tipo_dte: number; receptor: string; total: number; estado: string; folio?: number; dte_id?: number; error?: string }[];
};

const ERRORES_VISIBLES = 25;

function plural(n: number, uno: string, varios: string) {
  return `${n.toLocaleString("es-CL")} ${n === 1 ? uno : varios}`;
}

function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CargaMasivaPage() {
  const [gate, setGate] = useState<"loading" | "blocked" | "ok">("loading");
  const [ambiente, setAmbiente] = useState<"certificacion" | "produccion">("certificacion");
  const [folios, setFolios] = useState<Record<number, number>>({});
  const [cargas, setCargas] = useState<CargaResumen[]>([]);

  const [revision, setRevision] = useState<Revision | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [yaEmitidos, setYaEmitidos] = useState<Record<string, Emitido>>({});
  const [verTodosErrores, setVerTodosErrores] = useState(false);

  const [cargaId, setCargaId] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Record<string, ResultadoDoc>>({});
  const [emitiendo, setEmitiendo] = useState(false);
  const detenerRef = useRef(false);
  const [deteniendo, setDeteniendo] = useState(false);
  const [falloGeneral, setFalloGeneral] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const revisionRef = useRef<HTMLHeadingElement>(null);
  const resumenRef = useRef<HTMLHeadingElement>(null);

  const cargarHistorial = useCallback(() => {
    api<{ data: CargaResumen[] }>("/dte/cargas")
      .then((r) => setCargas(r.data))
      .catch(() => undefined);
  }, []);

  const cargarFolios = useCallback(() => {
    return api<CafEstado>("/caf/estado").then((caf) =>
      setFolios(Object.fromEntries(caf.data.tipos.map((t) => [t.tipo_dte, t.disponibles]))),
    );
  }, []);

  useEffect(() => {
    let cancel = false;
    Promise.all([api<{ progreso_pct?: number; ambiente?: string }>("/onboarding/estado"), api<SiiConfig>("/sii/config"), cargarFolios()])
      .then(([onb, cfg]) => {
        if (cancel) return;
        setAmbiente(cfg.data.ambiente === "produccion" ? "produccion" : "certificacion");
        setGate((onb.ambiente === "certificacion" || Number(onb.progreso_pct ?? 0) >= 100) ? "ok" : "blocked");
      })
      .catch(() => {
        if (!cancel) setGate("ok");
      });
    cargarHistorial();
    return () => {
      cancel = true;
    };
  }, [cargarHistorial, cargarFolios]);

  async function leerArchivo(f: File | null) {
    if (!f) return;
    setRevision(null);
    setResultados({});
    setCargaId(null);
    setFalloGeneral("");
    setVerTodosErrores(false);
    setYaEmitidos({});
    if (!/\.csv$/i.test(f.name)) {
      setRevision({
        archivo: f.name,
        bytes: f.size,
        filasDatos: 0,
        documentos: [],
        validos: [],
        bloqueante: true,
        errores: [
          {
            fila: 0,
            mensaje: /\.xlsx?$/i.test(f.name)
              ? "Este es un archivo de Excel. En Excel elige Archivo → Guardar como → «CSV (delimitado por comas)» y sube ese archivo."
              : "Sube un archivo .csv hecho a partir de la plantilla.",
          },
        ],
      });
      requestAnimationFrame(() => revisionRef.current?.focus());
      return;
    }
    setLeyendo(true);
    try {
      const texto = f.size > 10 * 1024 * 1024 ? "" : await f.text();
      const r = revisarPlanilla(f.name, f.size, texto);
      setRevision(r);
      if (r.validos.length) {
        const dup = await api<{ data: Emitido[] }>("/dte/cargas/emitidos", {
          method: "POST",
          body: JSON.stringify({ huellas: r.validos.map((d) => d.huella) }),
        }).catch(() => ({ data: [] as Emitido[] }));
        setYaEmitidos(Object.fromEntries(dup.data.map((d) => [d.huella, d])));
      }
    } finally {
      setLeyendo(false);
      if (inputRef.current) inputRef.current.value = "";
      requestAnimationFrame(() => revisionRef.current?.focus());
    }
  }

  const emitibles = useMemo(
    () => (revision?.validos ?? []).filter((d) => !yaEmitidos[d.huella]),
    [revision, yaEmitidos],
  );
  const duplicados = useMemo(
    () => (revision?.validos ?? []).filter((d) => yaEmitidos[d.huella]),
    [revision, yaEmitidos],
  );
  const porTipo = useMemo(() => {
    const m = new Map<number, { n: number; total: number }>();
    for (const d of emitibles) {
      const x = m.get(d.tipo_dte) ?? { n: 0, total: 0 };
      x.n += 1;
      x.total += d.totales.total;
      m.set(d.tipo_dte, x);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [emitibles]);
  const totalLote = emitibles.reduce((s, d) => s + d.totales.total, 0);
  const faltanFolios = porTipo.filter(([tipo, x]) => (folios[tipo] ?? 0) < x.n);

  const conError = revision ? new Set(revision.errores.map((e) => e.documento).filter(Boolean)).size : 0;
  const emitidos = Object.values(resultados).filter((r) => r.estado === "emitido").length;
  const fallidos = Object.entries(resultados).filter(([, r]) => r.estado === "fallido");
  const procesados = emitidos + fallidos.length;
  const terminado = !emitiendo && cargaId !== null && procesados > 0;
  /** Sin emitir (detenidos) o fallidos por un motivo que no sea duplicado. */
  const porReintentar = emitibles.filter((d) => {
    const r = resultados[d.id];
    return !r || (r.estado === "fallido" && !r.duplicado);
  });

  async function emitirDocs(docs: DocPlanilla[], idCarga: string) {
    setEmitiendo(true);
    detenerRef.current = false;
    setDeteniendo(false);
    try {
      for (const d of docs) {
        if (detenerRef.current) break;
        setResultados((r) => ({ ...r, [d.id]: { estado: "emitiendo" } }));
        try {
          const res = await api<{ data: { id: number; folio: number }; sii?: { estado?: string } }>("/dte", {
            method: "POST",
            body: JSON.stringify({ ...payloadEmision(d), carga: { id: idCarga, doc_id: d.id, huella: d.huella } }),
          });
          setResultados((r) => ({ ...r, [d.id]: { estado: "emitido", folio: res.data.folio, dte_id: res.data.id, sii: res.sii?.estado } }));
        } catch (e) {
          const error = e instanceof Error ? e.message : "No se pudo emitir";
          setResultados((r) => ({ ...r, [d.id]: { estado: "fallido", error, duplicado: error.startsWith("Ya se emitió") } }));
        }
      }
    } finally {
      setResultados((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v.estado !== "emitiendo")));
      setEmitiendo(false);
      setDeteniendo(false);
      cargarHistorial();
      cargarFolios().catch(() => undefined);
      requestAnimationFrame(() => resumenRef.current?.focus());
    }
  }

  async function confirmarEmision() {
    dialogRef.current?.close();
    if (!revision || !emitibles.length) return;
    setFalloGeneral("");
    try {
      const c = await api<{ data: { id: string } }>("/dte/cargas", {
        method: "POST",
        body: JSON.stringify({
          archivo: revision.archivo,
          documentos: emitibles.map((d) => ({
            doc_id: d.id,
            huella: d.huella,
            tipo_dte: d.tipo_dte,
            receptor: d.receptor.razon_social,
            total: d.totales.total,
          })),
        }),
      });
      setCargaId(c.data.id);
      await emitirDocs(emitibles, c.data.id);
    } catch (e) {
      setFalloGeneral(e instanceof Error ? e.message : "No se pudo iniciar la carga.");
    }
  }

  function descargarResultado() {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = emitibles.map((d) => {
      const r = resultados[d.id];
      const estado = !r ? "no emitido" : r.estado === "emitido" ? "emitido" : r.estado === "fallido" ? "falló" : "";
      return [d.id, String(d.tipo_dte), d.receptor.razon_social, String(d.totales.total), estado, r?.estado === "emitido" ? String(r.folio) : "", r?.estado === "fallido" ? r.error : ""]
        .map(q)
        .join(";");
    });
    descargar(
      `resultado-${revision?.archivo.replace(/\.csv$/i, "") ?? "carga"}.csv`,
      "﻿" + ["id_documento;tipo;cliente;total;estado;folio;error", ...rows].join("\r\n"),
    );
  }

  if (gate === "loading") {
    return (
      <AppShell title="Carga masiva" subtitle="Comprobando habilitación…">
        <div className="mx-auto max-w-[1100px] space-y-4" aria-busy="true">
          <div className="h-56 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]" />
          <div className="h-24 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]" />
        </div>
      </AppShell>
    );
  }

  if (gate === "blocked") {
    return (
      <AppShell title="Carga masiva" subtitle="Cuenta aún no operativa">
        <div className="pf-card max-w-lg space-y-3 p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--ink)]">Completa la habilitación</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Para emitir por planilla primero termina los pasos de habilitación: empresa, certificado, folios (CAF) y
            documento de prueba.
          </p>
          <Link href="/dashboard" className={btnPrimary}>
            Ir al dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  const enProduccion = ambiente === "produccion";
  const erroresVisibles = verTodosErrores ? revision?.errores ?? [] : (revision?.errores ?? []).slice(0, ERRORES_VISIBLES);

  return (
    <AppShell title="Carga masiva" subtitle="Emite muchos documentos desde una planilla CSV">
      <div className="mx-auto max-w-[1100px] space-y-5 pb-24">
        {/* ── Planilla ───────────────────────────────────────── */}
        <section className={card} aria-labelledby="h-planilla">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-4">
              <div>
                <h2 id="h-planilla" className="font-display text-lg font-semibold text-[var(--ink)]">
                  Sube tu planilla
                </h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  La revisamos apenas la eliges y te decimos fila por fila qué corregir.
                </p>
              </div>

              <label
                htmlFor="planilla"
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!emitiendo) setArrastrando(true);
                }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastrando(false);
                  if (!emitiendo) void leerArchivo(e.dataTransfer.files?.[0] ?? null);
                }}
                className={cn(
                  "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed px-6 py-9 text-center transition",
                  "focus-within:ring-2 focus-within:ring-[var(--fiscal-raise)] focus-within:ring-offset-2",
                  arrastrando
                    ? "border-[var(--fiscal)] bg-[var(--fiscal-soft)]"
                    : "border-[var(--line-strong)] bg-[var(--surface-sunken)] hover:border-[var(--fiscal)]",
                  emitiendo && "pointer-events-none opacity-60",
                )}
              >
                {leyendo ? (
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--fiscal)]" aria-hidden />
                ) : (
                  <Upload className="h-6 w-6 text-[var(--fiscal)]" aria-hidden />
                )}
                <span className="text-sm font-semibold text-[var(--ink)]">
                  {leyendo ? "Revisando…" : revision ? `Otra planilla en vez de ${revision.archivo}` : "Arrastra tu archivo CSV aquí"}
                </span>
                <span className="text-xs text-[var(--ink-muted)]">
                  o <span className="font-semibold text-[var(--fiscal)] underline underline-offset-2">elígelo desde tu equipo</span> ·
                  hasta {MAX_DOCS.toLocaleString("es-CL")} documentos y 10 MB
                </span>
                <input
                  ref={inputRef}
                  id="planilla"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={emitiendo}
                  className="sr-only"
                  onChange={(e) => void leerArchivo(e.target.files?.[0] ?? null)}
                />
              </label>

              <p className="flex items-start gap-2 text-sm text-[var(--ink-muted)]">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ok)]" aria-hidden />
                <span>
                  <strong className="font-semibold text-[var(--ink)]">Subir y revisar no emite nada.</strong> No gasta
                  folios ni envía al SII. Corrige y vuelve a subir las veces que quieras.
                </span>
              </p>
            </div>

            <aside className="space-y-3 border-t border-[var(--line)] pt-5 text-sm lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <h3 className="font-semibold text-[var(--ink)]">Cómo llenarla</h3>
              <ul className="space-y-2 text-[var(--ink-muted)]">
                <li>Una fila por cada línea de detalle. Las filas con el mismo ID forman un documento.</li>
                <li>Tipo, fecha y cliente van en la primera fila de cada documento.</li>
                <li>
                  El precio va <strong className="font-semibold text-[var(--ink)]">neto, sin IVA</strong>.
                </li>
                <li>Tipos admitidos: 33, 34, 56 y 61. Las notas indican el folio que corrigen.</li>
              </ul>
              <a href="/plantilla-documentos.csv" download="plantilla-documentos.csv" className={cn(btnSecondary, "w-full")}>
                <Download className="h-4 w-4" aria-hidden />
                Descargar plantilla
              </a>
              <p className="text-xs text-[var(--ink-muted)]">
                Ábrela en Excel y guárdala como «CSV». La plantilla explica cada columna.
              </p>
            </aside>
          </div>
        </section>

        {/* ── Revisión ───────────────────────────────────────── */}
        {revision ? (
          <section className={card} aria-labelledby="h-revision">
            <div className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    id="h-revision"
                    ref={revisionRef}
                    tabIndex={-1}
                    className="font-display text-lg font-semibold text-[var(--ink)] focus:outline-none"
                  >
                    Revisión de {revision.archivo}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]" role="status">
                    {revision.bloqueante
                      ? "No pudimos leer la planilla."
                      : `${plural(revision.documentos.length, "documento", "documentos")} en ${plural(revision.filasDatos, "fila", "filas")} · ${plural(emitibles.length, "listo", "listos")} para emitir${conError ? ` · ${plural(conError, "con errores", "con errores")}` : ""}${duplicados.length ? ` · ${plural(duplicados.length, "ya emitido", "ya emitidos")}` : ""}`}
                  </p>
                </div>
                {revision.errores.length ? (
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => descargar(`errores-${revision.archivo.replace(/\.csv$/i, "")}.csv`, erroresCsv(revision.errores))}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Descargar errores
                  </button>
                ) : null}
              </div>

              {revision.errores.length ? (
                <div
                  role="region"
                  aria-label="Errores de la planilla"
                  tabIndex={0}
                  className="max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_22%,transparent)] bg-[var(--danger-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]"
                >
                  <ul className="divide-y divide-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-sm">
                    {erroresVisibles.map((e, i) => (
                      <li key={`${e.fila}-${e.columna}-${i}`} className="flex gap-3 px-4 py-2.5">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden />
                        <div className="min-w-0 text-[var(--ink)]">
                          <p className="text-xs font-semibold text-[var(--danger)]">
                            {[
                              e.fila > 0 ? `Fila ${e.fila}` : null,
                              e.documento ? `documento ${e.documento}` : null,
                              e.columna ? nombreColumna(e.columna) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Planilla"}
                            {e.valor ? <span className="font-normal text-[var(--ink-muted)]"> · escribiste «{e.valor}»</span> : null}
                          </p>
                          <p>{e.mensaje}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {revision.errores.length > ERRORES_VISIBLES && !verTodosErrores ? (
                    <button
                      type="button"
                      onClick={() => setVerTodosErrores(true)}
                      className="w-full border-t border-[color-mix(in_srgb,var(--danger)_14%,transparent)] px-4 py-2.5 text-left text-sm font-semibold text-[var(--danger)] hover:underline"
                    >
                      Ver los {revision.errores.length - ERRORES_VISIBLES} errores restantes
                    </button>
                  ) : null}
                </div>
              ) : null}

              {revision.validos.length ? (
                <>
                <ul className="divide-y divide-[var(--line)] rounded-[var(--radius-md)] border border-[var(--line)] text-sm tabular-nums sm:hidden" aria-label="Documentos listos para emitir">
                  {revision.validos.map((d) => (
                    <li key={d.id} className={cn("space-y-1 px-4 py-3", yaEmitidos[d.huella] && "text-[var(--ink-muted)]")}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">{d.id}</span>
                        <span className="font-semibold">{clp(d.totales.total)}</span>
                      </div>
                      <p className="truncate">{d.receptor.razon_social}</p>
                      <div className="flex items-center justify-between gap-3 text-xs text-[var(--ink-muted)]">
                        <span>
                          {d.tipo_dte} · {TIPOS_PLANILLA[d.tipo_dte]} · {plural(d.items.length, "línea", "líneas")}
                        </span>
                        <EstadoDoc r={resultados[d.id]} dup={yaEmitidos[d.huella]} />
                      </div>
                    </li>
                  ))}
                  <li className="flex justify-between bg-[var(--surface-sunken)] px-4 py-2.5 font-semibold">
                    <span>Total a emitir</span>
                    <span>{clp(totalLote)}</span>
                  </li>
                </ul>
                <div className="hidden overflow-x-auto rounded-[var(--radius-md)] border border-[var(--line)] sm:block">
                  <table className="w-full min-w-[720px] text-sm tabular-nums">
                    <caption className="sr-only">Documentos listos para emitir</caption>
                    <thead className="bg-[var(--surface-sunken)] text-left text-xs font-semibold text-[var(--ink-muted)]">
                      <tr>
                        <th scope="col" className="px-3 py-2">ID</th>
                        <th scope="col" className="px-3 py-2">Tipo</th>
                        <th scope="col" className="px-3 py-2">Cliente</th>
                        <th scope="col" className="px-3 py-2 text-right">Líneas</th>
                        <th scope="col" className="px-3 py-2 text-right">Neto</th>
                        <th scope="col" className="px-3 py-2 text-right">IVA</th>
                        <th scope="col" className="px-3 py-2 text-right">Total</th>
                        <th scope="col" className="px-3 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {revision.validos.map((d) => {
                        const r = resultados[d.id];
                        const dup = yaEmitidos[d.huella];
                        return (
                          <tr key={d.id} className={cn(dup && "text-[var(--ink-muted)]")}>
                            <td className="whitespace-nowrap px-3 py-2 font-medium">{d.id}</td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {d.tipo_dte} · {TIPOS_PLANILLA[d.tipo_dte]}
                            </td>
                            <td className="max-w-[260px] px-3 py-2">
                              <p className="truncate">{d.receptor.razon_social}</p>
                              <p className="text-xs text-[var(--ink-muted)]">
                                {d.receptor.rut}-{d.receptor.dv}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-right">{d.items.length}</td>
                            <td className="px-3 py-2 text-right">{clp(d.totales.neto + d.totales.exento)}</td>
                            <td className="px-3 py-2 text-right">{clp(d.totales.iva)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{clp(d.totales.total)}</td>
                            <td className="px-3 py-2">
                              <EstadoDoc r={r} dup={dup} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t border-[var(--line-strong)] bg-[var(--surface-sunken)] font-semibold">
                      <tr>
                        <td className="px-3 py-2" colSpan={6}>
                          Total a emitir ({plural(emitibles.length, "documento", "documentos")})
                        </td>
                        <td className="px-3 py-2 text-right">{clp(totalLote)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* ── Emitir ─────────────────────────────────────────── */}
        {revision && (emitibles.length > 0 || cargaId) ? (
          <section className={card} aria-labelledby="h-emitir">
            <div className="space-y-4 p-6">
              <div>
                <h2 id="h-emitir" ref={resumenRef} tabIndex={-1} className="font-display text-lg font-semibold text-[var(--ink)] focus:outline-none">
                  {terminado ? "Resultado de la emisión" : "Emitir documentos"}
                </h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {enProduccion ? (
                    <>
                      Se firman y envían al <strong className="font-semibold text-[var(--danger)]">SII en producción</strong>:
                      tienen valor tributario y gastan folios reales.
                    </>
                  ) : (
                    <>
                      Se firman y envían al SII en <strong className="font-semibold text-[var(--ink)]">certificación (maullin)</strong>:
                      son documentos de prueba, sin valor tributario. Gastan folios de certificación.
                    </>
                  )}
                </p>
              </div>

              {!cargaId ? (
                <>
                  <dl className="flex flex-col divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] sm:w-fit sm:flex-row sm:flex-wrap sm:divide-x sm:divide-y-0">
                    {porTipo.map(([tipo, x]) => {
                      const disp = folios[tipo] ?? 0;
                      const falta = disp < x.n;
                      return (
                        <div key={tipo} className="px-4 py-3 sm:min-w-[220px]">
                          <dt className="text-xs text-[var(--ink-muted)]">
                            {tipo} · {TIPOS_PLANILLA[tipo]}
                          </dt>
                          <dd className="mt-0.5 text-sm tabular-nums">
                            <span className="font-semibold text-[var(--ink)]">{plural(x.n, "documento", "documentos")}</span> · {clp(x.total)}
                          </dd>
                          <dd className={cn("mt-0.5 text-xs tabular-nums", falta ? "font-semibold text-[var(--danger)]" : "text-[var(--ink-muted)]")}>
                            {falta ? `Faltan ${x.n - disp} folios (tienes ${disp})` : `Usa ${x.n} de ${disp} folios disponibles`}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>

                  {faltanFolios.length ? (
                    <p className="flex items-start gap-2 text-sm text-[var(--danger)]">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      <span>
                        No alcanzan los folios. <Link href="/caf" className="font-semibold underline underline-offset-2">Carga un CAF nuevo</Link> o
                        quita documentos de la planilla.
                      </span>
                    </p>
                  ) : null}

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={!emitibles.length || faltanFolios.length > 0}
                      onClick={() => dialogRef.current?.showModal()}
                    >
                      Emitir {plural(emitibles.length, "documento", "documentos")}
                    </button>
                    {conError || duplicados.length ? (
                      <p className="text-sm text-[var(--ink-muted)]">
                        {[
                          conError ? `${plural(conError, "documento con errores queda", "documentos con errores quedan")} fuera` : null,
                          duplicados.length ? `${plural(duplicados.length, "ya emitido no se repite", "ya emitidos no se repiten")}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        .
                      </p>
                    ) : null}
                  </div>
                  {falloGeneral ? (
                    <p className="text-sm text-[var(--danger)]" role="alert">
                      {falloGeneral}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
                      <p aria-live="polite" className="font-semibold text-[var(--ink)]">
                        {emitiendo
                          ? deteniendo
                            ? `Deteniendo después del documento actual… (${procesados} de ${emitibles.length})`
                            : `Emitiendo ${Math.min(procesados + 1, emitibles.length)} de ${emitibles.length}…`
                          : `${plural(emitidos, "emitido", "emitidos")} · ${plural(fallidos.length, "falló", "fallaron")}${emitibles.length - procesados > 0 ? ` · ${emitibles.length - procesados} sin emitir` : ""}`}
                      </p>
                      {emitiendo ? (
                        <button
                          type="button"
                          className="text-sm font-semibold text-[var(--danger)] underline-offset-2 hover:underline disabled:opacity-50"
                          disabled={deteniendo}
                          onClick={() => {
                            detenerRef.current = true;
                            setDeteniendo(true);
                          }}
                        >
                          Detener
                        </button>
                      ) : null}
                    </div>
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
                      role="progressbar"
                      aria-label="Progreso de la emisión"
                      aria-valuemin={0}
                      aria-valuemax={emitibles.length}
                      aria-valuenow={procesados}
                    >
                      <div className="flex h-full">
                        <div className="h-full bg-[var(--ok)] transition-[width] duration-300 ease-out" style={{ width: `${(emitidos / emitibles.length) * 100}%` }} />
                        <div className="h-full bg-[var(--danger)] transition-[width] duration-300 ease-out" style={{ width: `${(fallidos.length / emitibles.length) * 100}%` }} />
                      </div>
                    </div>
                  </div>

                  {terminado ? (
                    <>
                      {fallidos.length ? (
                        <ul className="space-y-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_22%,transparent)] bg-[var(--danger-soft)] px-4 py-3 text-sm">
                          {fallidos.map(([id, r]) => (
                            <li key={id} className="text-[var(--ink)]">
                              <strong className="font-semibold text-[var(--danger)]">{id}:</strong> {r.estado === "fallido" ? r.error : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ok)]">
                          <CheckCircle2 className="h-4 w-4" aria-hidden />
                          Todos los documentos se emitieron.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3">
                        {porReintentar.length ? (
                          <button type="button" className={btnPrimary} onClick={() => cargaId && void emitirDocs(porReintentar, cargaId)}>
                            <RotateCcw className="h-4 w-4" aria-hidden />
                            {porReintentar.some((d) => !resultados[d.id])
                              ? `Continuar con ${plural(porReintentar.length, "documento", "documentos")}`
                              : `Reintentar ${plural(porReintentar.length, "documento", "documentos")}`}
                          </button>
                        ) : null}
                        <button type="button" className={btnSecondary} onClick={descargarResultado}>
                          <Download className="h-4 w-4" aria-hidden />
                          Descargar resultado
                        </button>
                        <Link href="/dte" className={btnSecondary}>
                          Ver documentos emitidos
                        </Link>
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* ── Historial ──────────────────────────────────────── */}
        <section className={card} aria-labelledby="h-historial">
          <h2 id="h-historial" className="px-6 pb-2 pt-5 font-display text-lg font-semibold text-[var(--ink)]">
            Cargas anteriores
          </h2>
          {cargas.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-[var(--ink-muted)]">
              Aquí verás cada planilla que emitas, con sus folios y lo que falló. Todavía no hay ninguna.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)] px-2 pb-2">
              {cargas.map((c) => (
                <HistorialFila key={c.id} c={c} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Confirmación ─────────────────────────────────────── */}
      <dialog
        ref={dialogRef}
        aria-labelledby="dlg-titulo"
        className={dialogCls}
      >
        <div className="space-y-4 p-6">
          <h2 id="dlg-titulo" className="font-display text-lg font-semibold">
            ¿Emitir {plural(emitibles.length, "documento", "documentos")}?
          </h2>
          <ul className="space-y-1 text-sm tabular-nums">
            {porTipo.map(([tipo, x]) => (
              <li key={tipo} className="flex justify-between gap-4">
                <span>
                  {tipo} · {TIPOS_PLANILLA[tipo]} <span className="text-[var(--ink-muted)]">× {x.n}</span>
                </span>
                <span>{clp(x.total)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-4 border-t border-[var(--line)] pt-1 font-semibold">
              <span>Total</span>
              <span>{clp(totalLote)}</span>
            </li>
          </ul>
          <p
            className={cn(
              "rounded-[var(--radius-md)] px-3 py-2 text-sm",
              enProduccion ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--fiscal-soft)] text-[var(--fiscal)]",
            )}
          >
            {enProduccion
              ? "Producción: los documentos tienen valor tributario y no se pueden borrar. Para corregir uno tendrás que emitir una nota de crédito."
              : "Certificación (maullin): documentos de prueba, sin valor tributario."}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btnSecondary} onClick={() => dialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="button" className={btnPrimary} onClick={() => void confirmarEmision()}>
              Sí, emitir {plural(emitibles.length, "documento", "documentos")}
            </button>
          </div>
        </div>
      </dialog>
    </AppShell>
  );
}

function EstadoDoc({ r, dup }: { r?: ResultadoDoc; dup?: Emitido }) {
  if (dup && !r)
    return (
      <span className="text-xs">
        Ya emitido{dup.folio ? (
          <>
            {" · "}
            {dup.dte_id ? (
              <Link href={`/dte/${dup.dte_id}`} className="font-semibold text-[var(--fiscal)] underline underline-offset-2">
                folio {dup.folio}
              </Link>
            ) : (
              `folio ${dup.folio}`
            )}
          </>
        ) : null}
      </span>
    );
  if (!r) return <span className="text-xs text-[var(--ink-muted)]">Listo</span>;
  if (r.estado === "emitiendo")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--fiscal)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Emitiendo
      </span>
    );
  if (r.estado === "emitido")
    return (
      <Link href={`/dte/${r.dte_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ok)] underline-offset-2 hover:underline">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Folio {r.folio}
        {r.sii === "rechazado_envio" ? <span className="font-normal text-[var(--danger)]"> · SII rechazó el envío</span> : null}
      </Link>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--danger)]" title={r.error}>
      <XCircle className="h-3.5 w-3.5" aria-hidden />
      {r.duplicado ? "Ya emitido" : "Falló"}
    </span>
  );
}

const ESTADO_CARGA: Record<CargaResumen["estado"], { txt: string; cls: string }> = {
  emitida: { txt: "Emitida", cls: "bg-[var(--ok-soft)] text-[var(--ok)]" },
  con_fallos: { txt: "Con fallos", cls: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  incompleta: { txt: "Incompleta", cls: "bg-[var(--warn-soft)] text-[var(--warn)]" },
  sin_emitir: { txt: "Sin emitir", cls: "bg-[var(--surface-sunken)] text-[var(--ink-muted)]" },
};

function HistorialFila({ c }: { c: CargaResumen }) {
  const [abierta, setAbierta] = useState(false);
  const [detalle, setDetalle] = useState<CargaDetalle | null>(null);
  const [error, setError] = useState("");
  const est = ESTADO_CARGA[c.estado];
  const total = c.emitidos + c.fallidos + c.pendientes;

  async function toggle() {
    const next = !abierta;
    setAbierta(next);
    if (next && !detalle) {
      try {
        setDetalle((await api<{ data: CargaDetalle }>(`/dte/cargas/${c.id}`)).data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar el detalle");
      }
    }
  }

  return (
    <li>
      <button
        type="button"
        aria-expanded={abierta}
        onClick={() => void toggle()}
        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] px-4 py-3 text-left text-sm hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <FileSpreadsheet className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate font-medium text-[var(--ink)]">{c.archivo}</span>
            <span className="block text-xs tabular-nums text-[var(--ink-muted)]">
              {new Date(c.creada_at).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
              {c.ambiente === "produccion" ? "Producción" : "Certificación"} · {c.emitidos} de {total} emitidos
              {c.fallidos ? ` · ${c.fallidos} con fallo` : ""}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", est.cls)}>{est.txt}</span>
          <ChevronDown className={cn("h-4 w-4 text-[var(--ink-muted)] transition-transform", abierta && "rotate-180")} aria-hidden />
        </span>
      </button>
      {abierta ? (
        <div className="px-4 pb-4 pl-11">
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {!detalle && !error ? <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-muted)]" aria-label="Cargando" /> : null}
          {detalle ? (
            <ul className="space-y-1 text-sm tabular-nums">
              {detalle.documentos.map((d) => (
                <li key={d.doc_id} className="flex flex-wrap justify-between gap-x-4">
                  <span className="text-[var(--ink)]">
                    {d.doc_id} · {d.receptor}
                  </span>
                  <span className={cn(d.estado === "fallido" ? "text-[var(--danger)]" : "text-[var(--ink-muted)]")}>
                    {d.estado === "emitido" && d.dte_id ? (
                      <Link href={`/dte/${d.dte_id}`} className="font-semibold text-[var(--ok)] hover:underline">
                        Folio {d.folio}
                      </Link>
                    ) : d.estado === "fallido" ? (
                      d.error
                    ) : (
                      "Sin emitir"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
