"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api, getAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { btnPrimary, btnSecondary, card, dialogCls, input } from "@/lib/ui";
import { formatRutPuntos, rutSii } from "@/lib/sii/rut";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

type Ready = {
  ready: boolean;
  missing_count: number;
  enabled: boolean;
  ambiente: string;
  can_request_token: boolean;
  endpoints: { seed: string; token: string; upload: string };
  requirements: { key: string; label: string; ok: boolean; detail: string; how: string }[];
};

type Probe = {
  seed?: { ok: boolean; value?: string; error?: string };
  token?: { ok: boolean; value?: string; error?: string };
};

type Pending = { item: string; why: string; where: string }[];

type Cfg = {
  ambiente: "certificacion" | "produccion";
  rut_empresa: string;
  rut_certificado: string;
  nro_resolucion: string;
  fecha_resolucion: string;
  enabled: boolean;
};

// Texto para el usuario y dónde se resuelve cada paso; el detalle técnico del servidor queda para el admin.
const PASOS: Record<string, { href: string; falta: string; ok?: string }> = {
  enabled: { href: "#config", falta: "Activa la transmisión en la configuración de abajo." },
  ambiente: { href: "#config", falta: "Elige el ambiente en la configuración de abajo." },
  rut_empresa: { href: "#config", falta: "Ingresa el RUT de tu empresa abajo." },
  rut_cert: { href: "#config", falta: "Ingresa el RUT del titular del certificado abajo." },
  cert_file: { href: "/certificado", falta: "Sube tu certificado digital (.p12).", ok: "Cargado" },
  cert_pass: { href: "/certificado", falta: "Ingresa la clave del certificado al subirlo." },
  resolucion: { href: "#config", falta: "Ingresa número y fecha de resolución abajo." },
  caf: { href: "/caf", falta: "Sube los folios (CAF) que descargas del SII.", ok: "Folios cargados" },
};
const BLOQUEAN_PRODUCCION = ["cert_file", "cert_pass", "caf"];

const fmtCfg = (c: Cfg): Cfg => ({
  ...c,
  rut_empresa: formatRutPuntos(c.rut_empresa),
  rut_certificado: formatRutPuntos(c.rut_certificado),
});
const msg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const ambienteTxt = (a?: string) => (a === "produccion" ? "Producción" : a === "certificacion" ? "Certificación" : "…");

export default function SiiPage() {
  const [ready, setReady] = useState<Ready | null>(null);
  const [pending, setPending] = useState<Pending>([]);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [savedCfg, setSavedCfg] = useState<Cfg | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probeError, setProbeError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const confirmRef = useRef<HTMLDialogElement>(null);

  async function load() {
    setLoadError("");
    try {
      const [r, p, c] = await Promise.all([
        api<Ready>("/sii/estado"),
        api<{ data: Pending }>("/sii/pendiente"),
        api<{ data: Cfg }>("/sii/config"),
      ]);
      setReady(r);
      setPending(p.data);
      setCfg(fmtCfg(c.data));
      setSavedCfg(c.data);
    } catch (e) {
      setLoadError(msg(e, "No pudimos cargar la conexión SII."));
    }
  }

  useEffect(() => {
    setIsAdmin(Boolean(getAuth()?.is_platform));
    load();
  }, []);

  function setCfgField<K extends keyof Cfg>(k: K, v: Cfg[K]) {
    setSaveMsg(null);
    setCfg((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  const prodActivo = cfg?.ambiente === "produccion" && cfg.enabled;
  const activaProduccion = prodActivo && !(savedCfg?.ambiente === "produccion" && savedCfg.enabled);
  const bloqueantes = ready?.requirements.filter((r) => !r.ok && BLOQUEAN_PRODUCCION.includes(r.key)) ?? [];

  function intentarGuardar() {
    if (!cfg) return;
    if (prodActivo && (!cfg.nro_resolucion.trim() || cfg.nro_resolucion.trim() === "0" || !cfg.fecha_resolucion)) {
      setSaveMsg({ ok: false, text: "Para transmitir en Producción ingresa el número y la fecha de resolución que te asignó el SII (no 0)." });
      return;
    }
    if (activaProduccion) confirmRef.current?.showModal();
    else void guardar();
  }

  async function guardar() {
    if (!cfg) return;
    confirmRef.current?.close();
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = { ...cfg, rut_empresa: rutSii(cfg.rut_empresa), rut_certificado: rutSii(cfg.rut_certificado) };
      await api<{ data: Cfg }>("/sii/config", { method: "PUT", body: JSON.stringify(payload) });
      await load();
      setSaveMsg({ ok: true, text: "Configuración guardada." });
    } catch (e) {
      setSaveMsg({ ok: false, text: `No se guardó: ${msg(e, "error desconocido")}. Tus cambios siguen en el formulario.` });
    } finally {
      setSaving(false);
    }
  }

  async function runProbe() {
    setProbing(true);
    setProbe(null);
    setProbeError("");
    try {
      setProbe(await api<Probe>("/sii/probe", { method: "POST", body: "{}" }));
      await load();
    } catch (e) {
      setProbeError(msg(e, "No pudimos contactar al SII."));
    } finally {
      setProbing(false);
    }
  }

  const probeOk = probe?.seed?.ok && probe?.token?.ok;
  const probeFallo = probe && !probeOk ? probe.seed?.ok ? probe.token?.error : probe.seed?.error : "";
  const faltan = ready?.missing_count ?? 0;

  return (
    <AppShell title="Conexión SII" subtitle="Conecta tu empresa con el SII para emitir documentos">
      <div className="space-y-4">
        {loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            <span>{loadError}</span>
            <button type="button" className={btnSecondary} onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        ) : null}

        <section className={cn(card, "p-5")} aria-labelledby="sii-estado">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="sii-estado" className="font-display text-lg font-semibold text-[var(--ink)]">
                {!ready ? "Revisando tu conexión…" : ready.ready ? "Listo para emitir" : `Te ${faltan === 1 ? "falta 1 paso" : `faltan ${faltan} pasos`}`}
              </h2>
              <p className="text-sm text-[var(--ink-muted)]">
                {ambienteTxt(ready?.ambiente)} · {ready?.enabled ? "transmisión activa" : "transmisión desactivada"}
              </p>
            </div>
            {ready ? (
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  ready.ready ? "bg-[var(--ok-soft)] text-[var(--ok)]" : "bg-[var(--warn-soft)] text-[var(--warn)]"
                )}
              >
                {ready.ready ? "Listo para SII" : faltan === 1 ? "1 pendiente" : `${faltan} pendientes`}
              </span>
            ) : null}
          </div>

          <ul className="mt-4 space-y-2">
            {ready?.requirements.map((r) => {
              const paso = PASOS[r.key];
              return (
                <li key={r.key} className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2.5">
                  {r.ok ? (
                    <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ok)]" />
                  ) : (
                    <Circle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {r.label}
                      <span className="sr-only">{r.ok ? ": completo" : ": pendiente"}</span>
                    </p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      {r.ok ? paso?.ok ?? r.detail : paso?.falta ?? r.how}
                    </p>
                  </div>
                  {!r.ok && paso ? (
                    <Link href={paso.href} className="shrink-0 text-xs font-semibold text-[var(--pulso)] underline-offset-2 hover:underline">
                      Resolver
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section id="config" className={cn(card, "scroll-mt-20 p-5")} aria-labelledby="sii-config">
          <h2 id="sii-config" className="font-display text-base font-semibold text-[var(--ink)]">
            Configuración
          </h2>
          <p className="mb-4 text-sm text-[var(--ink-muted)]">Datos de tu empresa ante el SII.</p>
          {cfg ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--ink)]">Ambiente</span>
                  <select className={input} value={cfg.ambiente} onChange={(e) => setCfgField("ambiente", e.target.value as Cfg["ambiente"])}>
                    <option value="certificacion">Certificación (pruebas, sin valor tributario)</option>
                    <option value="produccion">Producción (documentos con valor tributario)</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--ink)]">RUT empresa emisora</span>
                  <input
                    className={cn(input, "tabular-nums")}
                    value={cfg.rut_empresa}
                    onChange={(e) => setCfgField("rut_empresa", formatRutPuntos(e.target.value))}
                    placeholder="78.533.567-8"
                    inputMode="text"
                    autoComplete="off"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--ink)]">RUT titular del certificado</span>
                  <input
                    className={cn(input, "tabular-nums")}
                    value={cfg.rut_certificado}
                    onChange={(e) => setCfgField("rut_certificado", formatRutPuntos(e.target.value))}
                    placeholder="18.519.742-5"
                    autoComplete="off"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--ink)]">N° resolución SII</span>
                  <input
                    className={cn(input, "tabular-nums")}
                    value={cfg.nro_resolucion}
                    onChange={(e) => setCfgField("nro_resolucion", e.target.value)}
                    inputMode="numeric"
                    aria-describedby="sii-res-hint"
                  />
                  <span id="sii-res-hint" className="mt-1 block text-xs text-[var(--ink-muted)]">
                    En certificación usa 0. En producción, el número que te asignó el SII.
                  </span>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--ink)]">Fecha resolución</span>
                  <input type="date" className={input} value={cfg.fecha_resolucion} onChange={(e) => setCfgField("fecha_resolucion", e.target.value)} />
                </label>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cfg.enabled}
                  onChange={(e) => setCfgField("enabled", e.target.checked)}
                  className="h-4 w-4 accent-[var(--pulso)]"
                />
                <span>Transmitir documentos al SII</span>
              </label>
              {prodActivo ? (
                <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                  Producción: los documentos tienen valor tributario y gastan folios reales. Un documento emitido solo se corrige con nota de crédito.
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button type="button" onClick={intentarGuardar} disabled={saving} className={btnPrimary}>
                  {saving ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
                  {saving ? "Guardando…" : "Guardar configuración"}
                </button>
                <span role="status" aria-live="polite" className={cn("text-sm", saveMsg?.ok ? "text-[var(--ok)]" : "text-[var(--danger)]")}>
                  {saveMsg?.text}
                </span>
              </div>
              <p className="mt-3 text-xs text-[var(--ink-muted)]">
                El certificado y su clave se gestionan en{" "}
                <Link href="/certificado" className="font-medium text-[var(--pulso)] underline underline-offset-2">Certificado</Link>; los folios en{" "}
                <Link href="/caf" className="font-medium text-[var(--pulso)] underline underline-offset-2">CAF / Folios</Link>.
              </p>
            </>
          ) : loadError ? null : (
            <p className="text-sm text-[var(--ink-muted)]">Cargando…</p>
          )}
        </section>

        <section className={cn(card, "p-5")} aria-labelledby="sii-probe">
          <h2 id="sii-probe" className="font-display text-base font-semibold text-[var(--ink)]">
            Probar conexión
          </h2>
          <p className="mb-4 text-sm text-[var(--ink-muted)]">Después de guardar, verifica que el SII acepta tu certificado.</p>
          <button type="button" onClick={runProbe} disabled={probing || !ready} className={btnSecondary}>
            {probing ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
            {probing ? "Probando…" : "Probar conexión con el SII"}
          </button>
          <div role="status" aria-live="polite">
            {probeOk ? (
              <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]">
                Conexión verificada: el SII aceptó tu certificado y entregó una sesión.
              </p>
            ) : probeError || probeFallo ? (
              <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                No se pudo conectar: {probeError || probeFallo}. Revisa los pasos pendientes y vuelve a probar.
              </p>
            ) : null}
          </div>
        </section>

        {isAdmin && ready ? (
          <details className={cn(card, "p-5 text-sm text-[var(--ink-muted)]")}>
            <summary className="cursor-pointer font-medium text-[var(--ink)]">Diagnóstico técnico (solo admin)</summary>
            <ul className="mt-3 space-y-1 font-mono text-xs">
              <li>seed: {ready.endpoints.seed}</li>
              <li>token: {ready.endpoints.token}</li>
              <li>upload: {ready.endpoints.upload}</li>
            </ul>
            <ul className="mt-3 space-y-1 text-xs">
              {ready.requirements.map((r) => (
                <li key={r.key}>
                  <strong>{r.key}</strong>: {r.detail}
                  {!r.ok ? ` — ${r.how}` : ""}
                </li>
              ))}
            </ul>
            {pending.length ? (
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs">
                {pending.map((p, i) => (
                  <li key={`${p.item}-${i}`}>
                    {p.item}: {p.why} ({p.where})
                  </li>
                ))}
              </ol>
            ) : null}
          </details>
        ) : null}
      </div>

      <dialog ref={confirmRef} aria-labelledby="dlg-prod" className={dialogCls}>
        <div className="space-y-4 p-6">
          <h2 id="dlg-prod" className="font-display text-lg font-semibold">¿Activar transmisión en Producción?</h2>
          <p className="text-sm">
            Empresa <strong className="tabular-nums">{cfg?.rut_empresa}</strong>, resolución N° {cfg?.nro_resolucion} del {cfg?.fecha_resolucion}.
          </p>
          <p className="rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
            Desde ahora los documentos que emitas tendrán valor tributario y gastarán folios reales.
          </p>
          {bloqueantes.length ? (
            <p className="text-sm text-[var(--warn)]">
              Antes debes completar: {bloqueantes.map((b) => b.label).join(", ")}.
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btnSecondary} onClick={() => confirmRef.current?.close()}>
              Cancelar
            </button>
            <button type="button" className={btnPrimary} disabled={bloqueantes.length > 0} onClick={() => void guardar()}>
              Sí, activar Producción
            </button>
          </div>
        </div>
      </dialog>
    </AppShell>
  );
}
