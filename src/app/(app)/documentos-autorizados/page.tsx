"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { btnPrimary, btnSecondary, card, dialogCls } from "@/lib/ui";

type Doc = { tipo_dte: number; nombre: string; autorizado: boolean; ambiente: string };
type Fase = { key: string; completa: boolean };
type Paso = "inscripcion_sii" | "renuncia_portal_gratuito";

const ERR = "rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]";
const OK = "rounded-[var(--radius-md)] bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]";
const BADGE = "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold";
const SI = "bg-[var(--ok-soft)] text-[var(--ok)]";
const NO = "bg-[var(--surface-sunken)] text-[var(--ink)]";
const AMB_TXT: Record<string, string> = { certificacion: "Certificación", produccion: "Producción" };

const PASOS: { key: Paso; titulo: string; detalle: string; confirma: string }[] = [
  {
    key: "inscripcion_sii",
    titulo: "Inscripción como emisor electrónico",
    detalle: "Se hace en sii.cl con tu clave tributaria. El SII te habilita para emitir documentos electrónicos.",
    confirma: "Confirmas que ya completaste la inscripción como emisor electrónico en sii.cl.",
  },
  {
    key: "renuncia_portal_gratuito",
    titulo: "Salida del sistema gratuito del SII",
    detalle: "Si emitías con el sistema gratuito de facturación o boletas del SII, debes dejarlo en sii.cl para emitir desde aquí.",
    confirma: "Confirmas que ya dejaste el sistema gratuito del SII en sii.cl.",
  },
];

export default function DocumentosAutorizadosPage() {
  const [rows, setRows] = useState<Doc[]>([]);
  const [hechos, setHechos] = useState<Partial<Record<Paso, boolean>>>({});
  const [cargando, setCargando] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [paso, setPaso] = useState<Paso | null>(null);
  const [guardando, setGuardando] = useState(false);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const reqId = useRef(0);

  async function load() {
    const id = ++reqId.current;
    setCargando(true);
    setLoadError("");
    try {
      const [docs, estado] = await Promise.all([
        api<{ data: Doc[] }>("/documentos-autorizados"),
        api<{ fases: Fase[] }>("/onboarding/estado"),
      ]);
      if (id !== reqId.current) return; // respuesta vieja
      setRows(docs.data);
      setHechos(Object.fromEntries(estado.fases.map((f) => [f.key, f.completa])));
    } catch (e) {
      if (id === reqId.current) setLoadError(e instanceof Error ? e.message : "No pudimos cargar los documentos.");
    } finally {
      if (id === reqId.current) setCargando(false);
    }
  }

  useEffect(() => {
    void load();
    return () => {
      reqId.current++;
    };
  }, []);

  function pedirConfirmacion(p: Paso) {
    setPaso(p);
    setError("");
    setOk("");
    confirmRef.current?.showModal();
  }

  async function confirmar() {
    if (!paso) return;
    setGuardando(true);
    setError("");
    try {
      await api("/onboarding/paso", { method: "POST", body: JSON.stringify({ key: paso }) });
      setHechos((h) => ({ ...h, [paso]: true }));
      setOk("Quedó registrado. Tu avance en el Dashboard ya lo considera.");
      confirmRef.current?.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar. Intenta de nuevo.");
      confirmRef.current?.close();
    } finally {
      setGuardando(false);
    }
  }

  const ambiente = rows[0]?.ambiente;
  const actual = PASOS.find((p) => p.key === paso);

  return (
    <AppShell title="Documentos autorizados" subtitle="Tipos de DTE con CAF cargado y trámites previos en el SII">
      {ambiente ? (
        <p className="mb-4 text-sm text-[var(--ink-muted)]">
          Ambiente: <strong className="text-[var(--ink)]">{AMB_TXT[ambiente] ?? ambiente}</strong>
        </p>
      ) : null}

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

      <h2 className="mb-2 font-display text-base font-semibold">Documentos por tipo</h2>
      {cargando && !rows.length ? (
        <p className="flex items-center gap-2 text-sm text-[var(--ink-muted)]" role="status">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Cargando documentos…
        </p>
      ) : !rows.length && !loadError ? (
        <p className="text-sm text-[var(--ink-muted)]">No hay tipos de documento configurados.</p>
      ) : (
        <ul className={cn("grid gap-2 transition-opacity", cargando && "opacity-60")} aria-busy={cargando}>
          {rows.map((d) => (
            <li key={d.tipo_dte} className={cn(card, "flex flex-wrap items-center justify-between gap-3 p-4 text-sm")}>
              <p className="min-w-0 font-medium text-[var(--ink)]">
                {d.nombre}
                <span className="text-xs text-[var(--ink-muted)]"> · Tipo {d.tipo_dte}</span>
              </p>
              <div className="flex items-center gap-3">
                {!d.autorizado && (
                  <Link href="/caf" className="font-medium text-[var(--pulso)] underline underline-offset-2">
                    Cargar CAF →
                  </Link>
                )}
                <span className={cn(BADGE, d.autorizado ? SI : NO)}>{d.autorizado ? "CAF cargado" : "Sin CAF"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className={cn(card, "mt-6 p-5")} aria-labelledby="tramites">
        <h2 id="tramites" className="font-display text-base font-semibold">Trámites en el SII</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Se hacen en{" "}
          <a href="https://www.sii.cl" target="_blank" rel="noreferrer" className="font-medium text-[var(--pulso)] underline underline-offset-2">
            sii.cl
          </a>
          . Esta app no los verifica con el SII: solo registra lo que tú declaras para calcular tu avance.
        </p>
        <ul className="mt-4 divide-y divide-[var(--line)]">
          {PASOS.map((p) => (
            <li key={p.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 max-w-prose">
                <p className="font-medium text-[var(--ink)]">{p.titulo}</p>
                <p className="text-sm text-[var(--ink-muted)]">{p.detalle}</p>
              </div>
              {hechos[p.key] ? (
                <span className={cn(BADGE, SI)}>Declarado por ti</span>
              ) : (
                <button type="button" className={btnSecondary} disabled={cargando || guardando} onClick={() => pedirConfirmacion(p.key)}>
                  Ya lo hice
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <dialog ref={confirmRef} aria-labelledby="dlg-tramite" className={dialogCls} onClose={() => setPaso(null)}>
        {actual ? (
          <div className="space-y-4 p-6">
            <h2 id="dlg-tramite" className="font-display text-lg font-semibold">{actual.titulo}</h2>
            <p className="text-sm">{actual.confirma}</p>
            <p className="text-sm text-[var(--ink-muted)]">La app no lo comprueba con el SII y esta declaración no se puede deshacer desde aquí.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={btnSecondary} onClick={() => confirmRef.current?.close()}>
                Cancelar
              </button>
              <button type="button" className={btnPrimary} disabled={guardando} onClick={() => void confirmar()}>
                {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                Sí, ya lo hice
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </AppShell>
  );
}
