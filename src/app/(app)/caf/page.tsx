"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { btnPrimary, btnSecondary, card, dialogCls } from "@/lib/ui";

type Alerta = "ninguna" | "agotado" | "bajo" | "vencido";

type Tipo = {
  tipo_dte: number;
  tipo_nombre: string;
  alerta: Alerta;
  disponibles: number;
  autorizado_sii: boolean;
  caf_en_uso: { desde: number; hasta: number; vence_el: string } | null;
};

type Ambiente = "certificacion" | "produccion";
type Estado = { data: { tipos: Tipo[]; ambiente: Ambiente }; ambiente_emision?: Ambiente };

const ERR = "rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]";
const OK = "rounded-[var(--radius-md)] bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]";
const AMB_TXT: Record<Ambiente, string> = { certificacion: "Certificación", produccion: "Producción" };
const DIA = 86_400_000;

const fechaCl = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const diasHasta = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z")) / DIA);

/** Estado visible de una fila: la alerta del servidor más el aviso de vencimiento próximo (≤30 días). */
function estadoFila(t: Tipo): { tono: "ok" | "warn" | "danger" | "none"; texto: string } {
  if (t.alerta === "vencido") return { tono: "danger", texto: "Vencido" };
  if (t.alerta === "agotado") return { tono: "danger", texto: "Agotado" };
  if (!t.caf_en_uso || t.disponibles <= 0) return { tono: "none", texto: "Sin CAF" };
  if (t.alerta === "bajo") return { tono: "warn", texto: "Quedan pocos" };
  const d = diasHasta(t.caf_en_uso.vence_el);
  if (d <= 30) return { tono: "warn", texto: d === 0 ? "Vence hoy" : `Vence en ${d} ${d === 1 ? "día" : "días"}` };
  return { tono: "ok", texto: "Al día" };
}
const TONO = {
  ok: "bg-[var(--ok-soft)] text-[var(--ok)]",
  warn: "bg-[var(--warn-soft)] text-[var(--warn)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  none: "bg-[var(--surface-sunken)] text-[var(--ink-muted)]",
};
const NUM = { ok: "text-[var(--ink)]", warn: "text-[var(--warn)]", danger: "text-[var(--danger)]", none: "text-[var(--ink-muted)]" };

export default function CafPage() {
  const [ambiente, setAmbiente] = useState<Ambiente | null>(null);
  const [emision, setEmision] = useState<Ambiente | null>(null);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loadError, setLoadError] = useState("");
  const [reemplazo, setReemplazo] = useState<{ xml: string; tipo: Tipo } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const reqId = useRef(0);

  async function load(amb: Ambiente | null = ambiente) {
    const id = ++reqId.current;
    setCargando(true);
    setLoadError("");
    try {
      // Sin ambiente explícito el servidor responde con el ambiente con que se emite.
      const r = await api<Estado>(amb ? `/caf/estado?ambiente=${amb}` : "/caf/estado");
      if (id !== reqId.current) return; // respuesta vieja tras cambiar de ambiente
      setTipos(r.data.tipos);
      setAmbiente(r.data.ambiente);
      if (r.ambiente_emision) setEmision(r.ambiente_emision);
    } catch (e) {
      if (id === reqId.current) setLoadError(e instanceof Error ? e.message : "No pudimos cargar los folios.");
    } finally {
      if (id === reqId.current) setCargando(false);
    }
  }

  useEffect(() => {
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiarAmbiente(a: Ambiente) {
    if (a === ambiente) return;
    setOk("");
    setError("");
    setTipos([]);
    setAmbiente(a);
    void load(a);
  }

  function elegirArchivo() {
    setError("");
    setOk("");
    fileRef.current?.click();
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setOk("");
    const xml = await file.text();
    // Tipo declarado en el CAF (<TD>); si ese tipo aún tiene folios, confirmar antes de reemplazar el rango.
    const td = Number(xml.match(/<TD>\s*(\d+)\s*<\/TD>/)?.[1]);
    const actual = tipos.find((t) => t.tipo_dte === td);
    if (actual && actual.disponibles > 0 && actual.caf_en_uso) {
      setReemplazo({ xml, tipo: actual });
      confirmRef.current?.showModal();
      return;
    }
    await subir(xml);
  }

  async function subir(xml: string) {
    if (!ambiente) return;
    confirmRef.current?.close();
    setReemplazo(null);
    setSubiendo(true);
    try {
      const r = await api<{
        cargado: { tipo_dte: number; desde: number; hasta: number; total: number; ambiente: Ambiente };
      }>("/caf/upload", { method: "POST", body: JSON.stringify({ xml, ambiente }) });
      const c = r.cargado;
      setOk(`CAF de ${AMB_TXT[c.ambiente].toLowerCase()} cargado: tipo ${c.tipo_dte}, folios ${c.desde}–${c.hasta} (${c.total} folios).`);
      await load(ambiente);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el CAF");
    } finally {
      setSubiendo(false);
    }
  }

  const esCert = ambiente === "certificacion";
  const esProd = ambiente === "produccion";
  const enAlerta = tipos.filter((t) => ["danger", "warn"].includes(estadoFila(t).tono));

  return (
    <AppShell
      title="Folios (CAF)"
      subtitle="Los folios que el SII te autoriza para emitir"
      actions={
        <button type="button" onClick={elegirArchivo} disabled={subiendo || !ambiente} className={btnPrimary}>
          {subiendo ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Upload aria-hidden className="h-4 w-4" />}
          {subiendo ? "Cargando…" : `Subir CAF a ${ambiente ? AMB_TXT[ambiente] : "…"}`}
        </button>
      }
    >
      <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" onChange={onArchivo} className="hidden" />

      <div role="group" aria-label="Ambiente" className="mb-3 inline-flex rounded-[var(--radius-md)] border border-[var(--line-strong)] bg-[var(--surface)] p-1 text-sm">
        {(["certificacion", "produccion"] as Ambiente[]).map((a) => {
          const activo = ambiente === a;
          return (
            <button
              key={a}
              type="button"
              aria-pressed={activo}
              onClick={() => cambiarAmbiente(a)}
              className={cn(
                "inline-flex items-center gap-2 rounded-[calc(var(--radius-md)-2px)] px-3 py-1.5 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]",
                activo
                  ? a === "produccion"
                    ? "bg-[var(--pulso)] text-[var(--on-pulso)]"
                    : "bg-[var(--fiscal)] text-[var(--on-fiscal)]"
                  : "text-[var(--ink)] hover:bg-[var(--surface-sunken)]"
              )}
            >
              {AMB_TXT[a]}
              {emision === a ? (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", activo ? "bg-white/20" : "bg-[var(--ok-soft)] text-[var(--ok)]")}>
                  en uso
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="mb-4 text-sm text-[var(--ink-muted)]">
        {esProd ? (
          <>Estás viendo <strong className="text-[var(--pulso)]">producción</strong>: folios reales, con valor tributario.</>
        ) : (
          <>Estás viendo <strong className="text-[var(--ink)]">certificación</strong>: folios de prueba, sin valor tributario.</>
        )}{" "}
        Se emite con el ambiente <strong className="text-[var(--ink)]">{emision ? AMB_TXT[emision].toLowerCase() : "…"}</strong>, que se elige en{" "}
        <Link href="/sii" className="font-medium text-[var(--pulso)] underline underline-offset-2">Conexión SII</Link>.
      </p>

      {loadError && (
        <p role="alert" className={cn("mb-3 flex flex-wrap items-center justify-between gap-2", ERR)}>
          {loadError}
          <button type="button" onClick={() => void load()} className="font-semibold underline underline-offset-2">Reintentar</button>
        </p>
      )}
      {error && <p role="alert" className={cn("mb-3", ERR)}>{error}</p>}
      <div role="status" aria-live="polite">
        {ok && <p className={cn("mb-3", OK)}>{ok}</p>}
      </div>

      {enAlerta.length > 0 && !cargando ? (
        <div className="mb-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn)]">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Revisa {enAlerta.length === 1 ? "1 tipo de documento" : `${enAlerta.length} tipos de documento`}:{" "}
            {enAlerta.map((t) => `${t.tipo_nombre} (${estadoFila(t).texto.toLowerCase()})`).join(", ")}. Solicita un CAF nuevo en el SII antes de quedarte sin poder emitir.
          </span>
        </div>
      ) : null}

      <h2 className="sr-only">Folios por tipo de documento</h2>
      {cargando && !tipos.length ? (
        <p className="flex items-center gap-2 text-sm text-[var(--ink-muted)]" role="status">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Cargando folios…
        </p>
      ) : (
        <ul className={cn("grid gap-3 transition-opacity", cargando && "opacity-60")} aria-busy={cargando}>
          {tipos.map((t) => {
            const e = estadoFila(t);
            const c = t.caf_en_uso;
            return (
              <li key={t.tipo_dte} className={cn(card, "flex flex-wrap items-center justify-between gap-3 p-4")}>
                <div className="min-w-0">
                  <p className="font-medium text-[var(--ink)]">
                    {t.tipo_nombre}
                    <span className="text-xs text-[var(--ink-muted)]"> · Tipo {t.tipo_dte}</span>
                  </p>
                  <p className="text-sm text-[var(--ink-muted)] tabular-nums">
                    {c
                      ? `Folios ${c.desde}–${c.hasta} · ${e.tono === "danger" && t.alerta === "vencido" ? "Venció" : "Vence"} el ${fechaCl(c.vence_el)}`
                      : "Sin CAF cargado"}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", TONO[e.tono])}>{e.texto}</span>
                  <div className="min-w-14 text-right">
                    <p className={cn("font-display text-xl font-semibold tabular-nums", NUM[e.tono])}>{t.disponibles}</p>
                    <p className="text-xs text-[var(--ink-muted)]">{t.disponibles === 1 ? "folio" : "folios"}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className={cn(card, "mt-4 p-5")}>
        <h2 className="font-display text-base font-semibold">¿Cómo obtener un CAF?</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--ink-muted)]">
          <li>
            Ingresa a <strong>{esCert ? "maullin.sii.cl" : "www.sii.cl"}</strong> ({esCert ? "certificación" : "producción"})
          </li>
          <li>Factura Electrónica → Administración de folios CAF → Solicitud de folios</li>
          <li>Elige el tipo de documento (33, 39, 61…) y la cantidad</li>
          <li>Descarga el archivo XML del CAF</li>
          <li>
            Con <strong>{esCert ? "Certificación" : "Producción"}</strong> seleccionado arriba, súbelo aquí. El sistema rechaza un CAF de un ambiente en el otro.
          </li>
        </ol>
      </section>

      <dialog ref={confirmRef} aria-labelledby="dlg-caf" className={dialogCls} onClose={() => setReemplazo(null)}>
        {reemplazo && reemplazo.tipo.caf_en_uso ? (
          <div className="space-y-4 p-6">
            <h2 id="dlg-caf" className="font-display text-lg font-semibold">¿Reemplazar el CAF de {reemplazo.tipo.tipo_nombre}?</h2>
            <p className="text-sm tabular-nums">
              El rango actual {reemplazo.tipo.caf_en_uso.desde}–{reemplazo.tipo.caf_en_uso.hasta} todavía tiene{" "}
              <strong>{reemplazo.tipo.disponibles} {reemplazo.tipo.disponibles === 1 ? "folio" : "folios"}</strong> sin usar. Al subir el nuevo
              CAF se reemplaza y esos folios ya no se usarán.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={btnSecondary} onClick={() => confirmRef.current?.close()}>
                Cancelar
              </button>
              <button type="button" className={btnPrimary} onClick={() => void subir(reemplazo.xml)}>
                Sí, reemplazar
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </AppShell>
  );
}
