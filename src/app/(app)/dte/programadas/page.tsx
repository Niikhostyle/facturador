"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2, Pencil, Plus, Search, Trash2, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { btnDanger, btnPrimary, btnSecondary, card, dialogCls, input } from "@/lib/ui";
import { calcularDv, formatRutPuntos, partesRut } from "@/lib/sii/rut";
import { ivaDe } from "@/lib/iva";

type Ejecucion = { periodo: string; estado: "emitida" | "omitida" | "fallida"; at: string; dte_id?: number; folio?: number; error?: string };
type Programada = {
  id: number;
  nombre: string;
  tipo_dte: 33 | 34;
  receptor: { rut: string; dv: string; razon_social: string; giro?: string; direccion?: string; comuna?: string; email?: string };
  glosa: string;
  neto: number;
  dia: number;
  encendida: boolean;
  ejecuciones: Ejecucion[];
  pendientes: string[];
  proxima: string | null;
  iva: number;
  total: number;
  ultima: Ejecucion | null;
};
type Cliente = { id: number; rut: string; dv: string; razon_social: string; giro?: string; direccion?: string; comuna?: string; email?: string };
type Turno = { p: Programada; periodo: string; key: string };
type ResTurno = { estado: "emitiendo" } | { estado: "emitida"; folio: number; dte_id: number } | { estado: "fallida"; error: string };
type Legacy = { nombre?: string; cliente?: string; rut?: string; tipo?: number; dia?: number; monto?: number; encendida?: boolean };

const LEGACY_KEY = "facturador_gdt_programadas";
const TIPO: Record<number, string> = { 33: "Factura", 34: "Factura exenta" };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const plural = (n: number, a: string, b: string) => `${n.toLocaleString("es-CL")} ${n === 1 ? a : b}`;
function periodoTxt(p: string) {
  const [y, m] = p.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}
function fechaTxt(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
}

function leerLegacy(): Legacy[] {
  try {
    const v = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

type Form = { nombre: string; tipo: "33" | "34"; rut: string; razon: string; giro: string; direccion: string; comuna: string; email: string; glosa: string; neto: string; dia: string; encendida: boolean };
const FORM_VACIO: Form = { nombre: "", tipo: "33", rut: "", razon: "", giro: "", direccion: "", comuna: "", email: "", glosa: "", neto: "", dia: "5", encendida: true };

export default function ProgramadasPage() {
  const [gate, setGate] = useState<"loading" | "blocked" | "ok">("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Programada[]>([]);
  const [hoy, setHoy] = useState("");
  const [ambiente, setAmbiente] = useState<"certificacion" | "produccion">("certificacion");
  const [folios, setFolios] = useState<Record<number, number>>({});
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [legacy, setLegacy] = useState<Legacy[]>([]);
  const [migrando, setMigrando] = useState(false);

  const [q, setQ] = useState("");
  const [tipoF, setTipoF] = useState("");
  const [soloOn, setSoloOn] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [formErr, setFormErr] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState<Programada | null>(null);

  const [res, setRes] = useState<Record<string, ResTurno>>({});
  const [emitiendo, setEmitiendo] = useState(false);
  const detener = useRef(false);

  const editRef = useRef<HTMLDialogElement>(null);
  const borrarRef = useRef<HTMLDialogElement>(null);
  const emitirRef = useRef<HTMLDialogElement>(null);
  const resultadoRef = useRef<HTMLHeadingElement>(null);

  const cargar = useCallback(async () => {
    const r = await api<{ data: Programada[]; hoy: string }>("/programadas");
    setRows(r.data);
    setHoy(r.hoy);
  }, []);
  const cargarFolios = useCallback(
    () =>
      api<{ data: { tipos: { tipo_dte: number; disponibles: number }[] } }>("/caf/estado")
        .then((c) => setFolios(Object.fromEntries(c.data.tipos.map((t) => [t.tipo_dte, t.disponibles]))))
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api<{ progreso_pct?: number; ambiente?: string }>("/onboarding/estado"),
      api<{ data: { ambiente: string } }>("/sii/config"),
      cargar(),
      cargarFolios(),
      api<{ data: Cliente[] }>("/clientes?per_page=200").then((c) => !cancel && setClientes(c.data)).catch(() => undefined),
    ])
      .then(([onb, cfg]) => {
        if (cancel) return;
        setAmbiente(cfg.data.ambiente === "produccion" ? "produccion" : "certificacion");
        setGate((onb.ambiente === "certificacion" || Number(onb.progreso_pct ?? 0) >= 100) ? "ok" : "blocked");
      })
      .catch((e) => {
        if (cancel) return;
        setError(e instanceof Error ? e.message : "No se pudieron cargar las programaciones.");
        setGate("ok");
      });
    setLegacy(leerLegacy());
    return () => {
      cancel = true;
    };
  }, [cargar, cargarFolios]);

  /* ── Turnos pendientes ─────────────────────────────── */
  const turnos: Turno[] = useMemo(
    () => rows.flatMap((p) => p.pendientes.map((periodo) => ({ p, periodo, key: `${p.id}:${periodo}` }))).sort((a, b) => a.periodo.localeCompare(b.periodo) || a.p.dia - b.p.dia),
    [rows],
  );
  const porEmitir = turnos.filter((t) => res[t.key]?.estado !== "emitida");
  const totalLote = porEmitir.reduce((s, t) => s + t.p.total, 0);
  const necesita = porEmitir.reduce<Record<number, number>>((m, t) => ({ ...m, [t.p.tipo_dte]: (m[t.p.tipo_dte] ?? 0) + 1 }), {});
  const faltan = Object.entries(necesita).filter(([t, n]) => (folios[Number(t)] ?? 0) < n);
  const hechos = Object.values(res).filter((r) => r.estado !== "emitiendo");
  const emitidas = hechos.filter((r) => r.estado === "emitida").length;
  const fallidas = Object.entries(res).filter(([, r]) => r.estado === "fallida") as [string, { estado: "fallida"; error: string }][];

  async function emitir() {
    emitirRef.current?.close();
    const lote = porEmitir;
    setEmitiendo(true);
    detener.current = false;
    setRes((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v.estado === "emitida")));
    for (const t of lote) {
      if (detener.current) break;
      setRes((r) => ({ ...r, [t.key]: { estado: "emitiendo" } }));
      try {
        const out = await api<{ data: { id: number; folio: number } }>("/dte", {
          method: "POST",
          body: JSON.stringify({
            tipo_dte: t.p.tipo_dte,
            receptor: t.p.receptor,
            items: [{ nombre: `${t.p.glosa} · ${periodoTxt(t.periodo)}`.slice(0, 80), cantidad: 1, precio: t.p.neto, exento: t.p.tipo_dte === 34 }],
            programada: { id: t.p.id, periodo: t.periodo },
          }),
        });
        setRes((r) => ({ ...r, [t.key]: { estado: "emitida", folio: out.data.folio, dte_id: out.data.id } }));
      } catch (e) {
        setRes((r) => ({ ...r, [t.key]: { estado: "fallida", error: e instanceof Error ? e.message : "No se pudo emitir" } }));
      }
    }
    setRes((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v.estado !== "emitiendo")));
    setEmitiendo(false);
    await Promise.all([cargar().catch(() => undefined), cargarFolios()]);
    requestAnimationFrame(() => resultadoRef.current?.focus());
  }

  async function omitir(t: Turno) {
    try {
      await api(`/programadas/${t.p.id}/omitir`, { method: "POST", body: JSON.stringify({ periodo: t.periodo }) });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo omitir el turno.");
    }
  }

  /* ── CRUD ──────────────────────────────────────────── */
  function abrirNueva() {
    setEditId(null);
    setForm(FORM_VACIO);
    setFormErr("");
    editRef.current?.showModal();
  }
  function abrirEditar(p: Programada) {
    setEditId(p.id);
    setForm({
      nombre: p.nombre,
      tipo: String(p.tipo_dte) as "33" | "34",
      rut: formatRutPuntos(`${p.receptor.rut}${p.receptor.dv}`),
      razon: p.receptor.razon_social,
      giro: p.receptor.giro ?? "",
      direccion: p.receptor.direccion ?? "",
      comuna: p.receptor.comuna ?? "",
      email: p.receptor.email ?? "",
      glosa: p.glosa,
      neto: String(p.neto),
      dia: String(p.dia),
      encendida: p.encendida,
    });
    setFormErr("");
    editRef.current?.showModal();
  }
  function elegirCliente(razon: string) {
    const c = clientes.find((x) => x.razon_social === razon);
    if (c)
      setForm((f) => ({
        ...f,
        razon: c.razon_social,
        rut: formatRutPuntos(`${c.rut}${c.dv}`),
        giro: c.giro ?? f.giro,
        direccion: c.direccion ?? f.direccion,
        comuna: c.comuna ?? f.comuna,
        email: c.email ?? f.email,
      }));
    else setForm((f) => ({ ...f, razon }));
  }

  const { cuerpo: rutCuerpo, dv: rutDv } = partesRut(form.rut);
  const rutError = form.rut && rutCuerpo.length >= 7 && rutDv && calcularDv(rutCuerpo) !== rutDv ? `Dígito verificador incorrecto: debería ser ${calcularDv(rutCuerpo)}.` : "";
  const netoNum = Math.round(Number(form.neto.replace(/[.$\s]/g, "")) || 0);
  const ivaForm = form.tipo === "34" ? 0 : ivaDe(netoNum);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (rutError) return setFormErr(rutError);
    setGuardando(true);
    setFormErr("");
    const body = {
      nombre: form.nombre,
      tipo_dte: Number(form.tipo),
      receptor: { rut: rutCuerpo, dv: rutDv, razon_social: form.razon, giro: form.giro, direccion: form.direccion, comuna: form.comuna, email: form.email },
      glosa: form.glosa,
      neto: netoNum,
      dia: Number(form.dia),
      encendida: form.encendida,
    };
    try {
      await api(editId ? `/programadas/${editId}` : "/programadas", { method: editId ? "PUT" : "POST", body: JSON.stringify(body) });
      editRef.current?.close();
      await cargar();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function alternar(p: Programada) {
    setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, encendida: !p.encendida } : r)));
    try {
      await api(`/programadas/${p.id}`, { method: "PUT", body: JSON.stringify({ encendida: !p.encendida }) });
      await cargar();
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, encendida: p.encendida } : r)));
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
    }
  }

  async function confirmarBorrar() {
    if (!borrar) return;
    try {
      await api(`/programadas/${borrar.id}`, { method: "DELETE" });
      borrarRef.current?.close();
      setBorrar(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
      borrarRef.current?.close();
    }
  }

  async function migrar() {
    setMigrando(true);
    const fallos: Legacy[] = [];
    for (const l of legacy) {
      const { cuerpo, dv } = partesRut(l.rut ?? "");
      try {
        await api("/programadas", {
          method: "POST",
          body: JSON.stringify({
            nombre: l.nombre,
            tipo_dte: l.tipo === 34 ? 34 : 33,
            receptor: { rut: cuerpo, dv, razon_social: l.cliente },
            glosa: l.nombre,
            neto: l.monto,
            dia: l.dia,
            encendida: false,
          }),
        });
      } catch {
        fallos.push(l);
      }
    }
    try {
      if (fallos.length) localStorage.setItem(LEGACY_KEY, JSON.stringify(fallos));
      else localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
    setLegacy(fallos);
    setMigrando(false);
    await cargar().catch(() => undefined);
  }

  const filtradas = rows.filter((p) => {
    const t = q.trim().toLowerCase();
    if (soloOn && !p.encendida) return false;
    if (tipoF && String(p.tipo_dte) !== tipoF) return false;
    return !t || [p.nombre, p.receptor.razon_social, `${p.receptor.rut}-${p.receptor.dv}`, p.glosa].some((v) => v.toLowerCase().includes(t));
  });

  if (gate === "loading") {
    return (
      <AppShell title="Programadas" subtitle="Cargando…">
        <div className="mx-auto max-w-[1200px] space-y-4" aria-busy="true">
          <div className="h-40 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]" />
          <div className="h-64 animate-pulse rounded-[var(--radius-lg)] bg-[var(--surface-sunken)]" />
        </div>
      </AppShell>
    );
  }
  if (gate === "blocked") {
    return (
      <AppShell title="Programadas" subtitle="Cuenta aún no operativa">
        <div className="pf-card max-w-lg space-y-3 p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--ink)]">Completa la habilitación</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Para programar facturas primero termina la habilitación: empresa, certificado, folios (CAF) y documento de prueba.
          </p>
          <Link href="/dashboard" className={btnPrimary}>
            Ir al dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  const enProd = ambiente === "produccion";
  const terminado = !emitiendo && hechos.length > 0;

  return (
    <AppShell
      title="Programadas"
      subtitle="Contratos mensuales que emites con un clic"
      actions={
        <button type="button" onClick={abrirNueva} className={cn(btnPrimary, "max-sm:hidden")}>
          <Plus className="h-4 w-4" aria-hidden />
          Nueva programación
        </button>
      }
    >
      <div className="mx-auto max-w-[1200px] space-y-5 pb-24">
        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_22%,transparent)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">{error}</span>
            <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => setError("")}>
              Cerrar
            </button>
          </p>
        ) : null}

        {legacy.length ? (
          <section className={cn(card, "flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between")} aria-label="Programaciones antiguas">
            <p className="text-sm text-[var(--ink)]">
              <strong className="font-semibold">{legacy.length === 1 ? "1 programación quedó guardada" : `${legacy.length} programaciones quedaron guardadas`} solo en este navegador</strong>{" "}
              <span className="text-[var(--ink-muted)]">con la versión anterior, y nunca se emitieron. Pásalas a tu cuenta para verlas desde cualquier equipo; llegan apagadas para que las revises.</span>
            </p>
            <button type="button" className={btnSecondary} onClick={() => void migrar()} disabled={migrando}>
              {migrando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Pasarlas a mi cuenta
            </button>
          </section>
        ) : null}

        {/* ── Pendientes ─────────────────────────────── */}
        <section className={card} aria-labelledby="h-pend">
          <div className="space-y-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="h-pend" ref={resultadoRef} tabIndex={-1} className="font-display text-lg font-semibold text-[var(--ink)] focus:outline-none">
                  {terminado ? "Resultado de la emisión" : "Pendientes de emitir"}
                </h2>
                <p className="mt-1 max-w-[70ch] text-sm text-[var(--ink-muted)]">
                  El día de cada turno la programación aparece aquí. <strong className="font-semibold text-[var(--ink)]">Nada se emite sin que lo confirmes</strong>, y se emite con la fecha del día en que confirmas.
                </p>
              </div>
              {porEmitir.length && !emitiendo ? (
                <button type="button" className={btnPrimary} disabled={faltan.length > 0} onClick={() => emitirRef.current?.showModal()}>
                  Emitir {plural(porEmitir.length, "documento", "documentos")}
                </button>
              ) : null}
            </div>

            {faltan.length ? (
              <p className="flex items-start gap-2 text-sm text-[var(--danger)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  No alcanzan los folios para {faltan.map(([t]) => `${TIPO[Number(t)]?.toLowerCase()} (${t})`).join(" y ")}.{" "}
                  <Link href="/caf" className="font-semibold underline underline-offset-2">
                    Carga un CAF
                  </Link>{" "}
                  u omite algunos turnos.
                </span>
              </p>
            ) : null}

            {emitiendo || terminado ? (
              <div>
                <div className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
                  <p aria-live="polite" className="font-semibold text-[var(--ink)]">
                    {emitiendo ? `Emitiendo ${Math.min(hechos.length + 1, turnos.length)} de ${turnos.length}…` : `${plural(emitidas, "emitido", "emitidos")}${fallidas.length ? ` · ${plural(fallidas.length, "falló", "fallaron")}` : ""}`}
                  </p>
                  {emitiendo ? (
                    <button type="button" className="text-sm font-semibold text-[var(--danger)] hover:underline" onClick={() => (detener.current = true)}>
                      Detener
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]" role="progressbar" aria-label="Progreso de la emisión" aria-valuemin={0} aria-valuemax={turnos.length || 1} aria-valuenow={hechos.length}>
                  <div className="h-full bg-[var(--ok)] transition-[width] duration-300 ease-out" style={{ width: `${(emitidas / Math.max(turnos.length, hechos.length, 1)) * 100}%` }} />
                  <div className="h-full bg-[var(--danger)] transition-[width] duration-300 ease-out" style={{ width: `${(fallidas.length / Math.max(turnos.length, hechos.length, 1)) * 100}%` }} />
                </div>
              </div>
            ) : null}

            {turnos.length === 0 && !terminado ? (
              <p className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-4 py-3 text-sm text-[var(--ink-muted)]">
                <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" aria-hidden />
                {rows.some((r) => r.encendida)
                  ? `Nada pendiente hoy. El próximo turno es el ${fechaTxt(rows.filter((r) => r.proxima).map((r) => r.proxima!).sort()[0])}.`
                  : "Nada pendiente. Cuando tengas programaciones encendidas, sus turnos aparecerán aquí."}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--line)] rounded-[var(--radius-md)] border border-[var(--line)] text-sm tabular-nums">
                {turnos.map((t) => {
                  const r = res[t.key];
                  const atrasado = t.periodo < hoy.slice(0, 7);
                  return (
                    <li key={t.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                      <div className="min-w-0 max-sm:basis-full sm:flex-1">
                        <p className="truncate font-medium text-[var(--ink)]">{t.p.nombre}</p>
                        <p className="truncate text-xs text-[var(--ink-muted)]">
                          <span className="font-semibold text-[var(--ink)]">Turno {periodoTxt(t.periodo)}</span>
                          {atrasado ? <span className="font-semibold text-[var(--warn)]"> · atrasado</span> : null} · {t.p.receptor.razon_social} · {TIPO[t.p.tipo_dte]}
                        </p>
                      </div>
                      <span className="font-semibold text-[var(--ink)] max-sm:flex-1">{clp(t.p.total)}</span>
                      <span className="text-right sm:w-[150px]">
                        {!r ? (
                          <button type="button" disabled={emitiendo} onClick={() => void omitir(t)} className="text-xs font-semibold text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline disabled:opacity-50">
                            Omitir este mes
                          </button>
                        ) : r.estado === "emitiendo" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--fiscal)]">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Emitiendo
                          </span>
                        ) : r.estado === "emitida" ? (
                          <Link href={`/dte/${r.dte_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ok)] hover:underline">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Folio {r.folio}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--danger)]">
                            <XCircle className="h-3.5 w-3.5" aria-hidden /> Falló
                          </span>
                        )}
                      </span>
                      {r?.estado === "fallida" ? <p className="basis-full text-xs text-[var(--danger)]">{r.error}</p> : null}
                    </li>
                  );
                })}
                {Object.entries(res)
                  .filter(([k, v]) => v.estado === "emitida" && !turnos.some((t) => t.key === k))
                  .map(([k, v]) => {
                    const p = rows.find((x) => x.id === Number(k.split(":")[0]));
                    return v.estado === "emitida" ? (
                      <li key={k} className="flex items-center justify-between gap-4 px-4 py-3">
                        <span className="min-w-0 truncate text-[var(--ink)]">
                          {p?.nombre ?? "Programación"} · turno {periodoTxt(k.split(":")[1])}
                        </span>
                        <Link href={`/dte/${v.dte_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ok)] hover:underline">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Folio {v.folio}
                        </Link>
                      </li>
                    ) : null;
                  })}
              </ul>
            )}
          </div>
        </section>

        {/* ── Programaciones ──────────────────────────── */}
        <section className={card} aria-labelledby="h-prog">
          <div className="flex flex-col gap-3 border-b border-[var(--line)] p-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center justify-between gap-3">
              <h2 id="h-prog" className="font-display text-lg font-semibold text-[var(--ink)]">
                Programaciones <span className="font-sans text-sm font-normal text-[var(--ink-muted)]">({rows.length})</span>
              </h2>
              {rows.length ? (
                <button type="button" onClick={abrirNueva} className={cn(btnSecondary, "sm:hidden")}>
                  <Plus className="h-4 w-4" aria-hidden /> Nueva
                </button>
              ) : null}
            </div>
            {rows.length ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="relative block sm:w-72">
                  <span className="sr-only">Buscar</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, cliente o RUT" className={cn(input, "pl-9")} />
                </label>
                <label className="sr-only" htmlFor="f-tipo">
                  Tipo
                </label>
                <select id="f-tipo" value={tipoF} onChange={(e) => setTipoF(e.target.value)} className={cn(input, "sm:w-44")}>
                  <option value="">Todos los tipos</option>
                  <option value="33">Facturas (33)</option>
                  <option value="34">Exentas (34)</option>
                </select>
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap px-1 text-sm text-[var(--ink)]">
                  <input type="checkbox" checked={soloOn} onChange={(e) => setSoloOn(e.target.checked)} className="h-4 w-4 accent-[var(--fiscal)]" />
                  Solo encendidas
                </label>
              </div>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-start gap-3 p-6">
              <CalendarClock className="h-6 w-6 text-[var(--fiscal)]" aria-hidden />
              <p className="max-w-[60ch] text-sm text-[var(--ink-muted)]">
                Programa los contratos que facturas todos los meses (arriendos, mantenciones, suscripciones). Cada mes, el día del turno, quedan listos para emitir con un clic.
              </p>
              <button type="button" className={btnPrimary} onClick={abrirNueva}>
                <Plus className="h-4 w-4" aria-hidden /> Nueva programación
              </button>
            </div>
          ) : filtradas.length === 0 ? (
            <p className="p-6 text-sm text-[var(--ink-muted)]">Ninguna programación coincide con los filtros.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {filtradas.map((p) => (
                <li key={p.id} className="grid gap-x-6 gap-y-2 px-6 py-4 text-sm tabular-nums md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_140px_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--ink)]">{p.nombre}</p>
                    <p className="truncate text-[var(--ink-muted)]">
                      {p.receptor.razon_social} · {formatRutPuntos(`${p.receptor.rut}${p.receptor.dv}`)}
                    </p>
                  </div>
                  <div className="text-[var(--ink-muted)]">
                    <p>
                      <span className="font-semibold text-[var(--ink)]">{clp(p.total)}</span> {p.tipo_dte === 34 ? "exento" : "con IVA"} · {TIPO[p.tipo_dte]}
                    </p>
                    <p>
                      Día {p.dia} ·{" "}
                      {p.encendida && p.proxima ? `próximo ${fechaTxt(p.proxima)}` : "apagada"}
                      {p.ultima ? (
                        <>
                          {" · "}
                          {p.ultima.estado === "emitida" && p.ultima.dte_id ? (
                            <Link href={`/dte/${p.ultima.dte_id}`} className="text-[var(--ok)] hover:underline">
                              {periodoTxt(p.ultima.periodo)}: folio {p.ultima.folio}
                            </Link>
                          ) : p.ultima.estado === "fallida" ? (
                            <span className="text-[var(--danger)]">{periodoTxt(p.ultima.periodo)}: falló</span>
                          ) : (
                            <span>{periodoTxt(p.ultima.periodo)}: omitido</span>
                          )}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 md:contents">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={p.encendida}
                    aria-label={`${p.nombre}: ${p.encendida ? "encendida" : "apagada"}`}
                    onClick={() => void alternar(p)}
                    className="inline-flex h-10 items-center gap-2 justify-self-start rounded-[var(--radius-md)] px-1 text-sm font-medium text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]"
                  >
                    <span className={cn("relative h-6 w-10 rounded-full transition-colors", p.encendida ? "bg-[var(--ok)]" : "bg-[var(--line-strong)]")}>
                      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-200 ease-out", p.encendida ? "left-[18px]" : "left-0.5")} />
                    </span>
                    {p.encendida ? "Encendida" : "Apagada"}
                  </button>
                  <div className="flex gap-1 justify-self-start md:justify-self-end">
                    <button type="button" onClick={() => abrirEditar(p)} className={cn(btnSecondary, "px-3")} aria-label={`Editar ${p.nombre}`}>
                      <Pencil className="h-4 w-4" aria-hidden />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBorrar(p);
                        borrarRef.current?.showModal();
                      }}
                      className={cn(btnSecondary, "px-3 text-[var(--danger)]")}
                      aria-label={`Eliminar ${p.nombre}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Editor ─────────────────────────────────────── */}
      <dialog ref={editRef} aria-labelledby="dlg-edit" className={cn(dialogCls, "w-[min(94vw,640px)]")}>
        <form onSubmit={(e) => void guardar(e)} className="max-h-[85vh] space-y-5 overflow-y-auto px-6 pt-6">
          <h2 id="dlg-edit" className="font-display text-lg font-semibold">
            {editId ? "Editar programación" : "Nueva programación"}
          </h2>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">Cliente</legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <Campo label="Razón social">
                <input required list="clientes-lista" value={form.razon} onChange={(e) => elegirCliente(e.target.value)} className={input} autoComplete="off" />
                <datalist id="clientes-lista">
                  {clientes.map((c) => (
                    <option key={c.id} value={c.razon_social} />
                  ))}
                </datalist>
              </Campo>
              <Campo label="RUT" error={rutError}>
                <input required value={form.rut} onChange={(e) => setForm({ ...form, rut: formatRutPuntos(e.target.value) })} placeholder="Ej.: 76.354.771-K" className={cn(input, rutError && "border-[var(--danger)]")} inputMode="text" />
              </Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Giro">
                <input value={form.giro} onChange={(e) => setForm({ ...form, giro: e.target.value })} className={input} maxLength={40} />
              </Campo>
              <Campo label="Dirección">
                <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} className={input} maxLength={70} />
              </Campo>
              <Campo label="Comuna">
                <input value={form.comuna} onChange={(e) => setForm({ ...form, comuna: e.target.value })} className={input} maxLength={20} />
              </Campo>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">Qué se factura</legend>
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <Campo label="Nombre interno">
                <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej.: Arriendo oficina 302" className={input} maxLength={80} />
              </Campo>
              <Campo label="Tipo">
                <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as "33" | "34" })} className={input}>
                  <option value="33">33 · Factura</option>
                  <option value="34">34 · Factura exenta</option>
                </select>
              </Campo>
            </div>
            <Campo label="Glosa (sale en el documento, se le agrega el mes)">
              <input required value={form.glosa} onChange={(e) => setForm({ ...form, glosa: e.target.value })} placeholder="Ej.: Arriendo mensual oficina 302" className={input} maxLength={60} />
            </Campo>
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr]">
              <Campo label={form.tipo === "34" ? "Monto exento" : "Monto neto (sin IVA)"}>
                <input
                  required
                  inputMode="numeric"
                  value={form.neto ? Number(form.neto.replace(/\D/g, "")).toLocaleString("es-CL") : ""}
                  onChange={(e) => setForm({ ...form, neto: e.target.value.replace(/\D/g, "") })}
                  placeholder="Ej.: 350.000"
                  className={cn(input, "tabular-nums")}
                />
              </Campo>
              <p className="pb-2.5 text-sm tabular-nums text-[var(--ink-muted)]" aria-live="polite">
                {netoNum > 0 ? (
                  <>
                    {form.tipo === "34" ? "Sin IVA · " : `+ IVA ${clp(ivaForm)} · `}
                    <span className="font-semibold text-[var(--ink)]">Total {clp(netoNum + ivaForm)}</span>
                  </>
                ) : form.tipo === "34" ? (
                  "Exento: no lleva IVA."
                ) : (
                  "El IVA (19%) lo calculamos nosotros."
                )}
              </p>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">Cuándo</legend>
            <div className="grid items-end gap-3 sm:grid-cols-[160px_1fr]">
              <Campo label="Día de cada mes">
                <select value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })} className={input}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      Día {d}
                    </option>
                  ))}
                </select>
              </Campo>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={form.encendida} onChange={(e) => setForm({ ...form, encendida: e.target.checked })} className="h-4 w-4 accent-[var(--fiscal)]" />
                Encendida: sus turnos aparecen en «Pendientes de emitir»
              </label>
            </div>
          </fieldset>

          {formErr ? (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {formErr}
            </p>
          ) : null}
          <div className="sticky bottom-0 -mx-6 flex flex-col-reverse gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-6 py-4 sm:flex-row sm:justify-end">
            <button type="button" className={btnSecondary} onClick={() => editRef.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className={btnPrimary} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {editId ? "Guardar cambios" : "Crear programación"}
            </button>
          </div>
        </form>
      </dialog>

      {/* ── Confirmar emisión ──────────────────────────── */}
      <dialog ref={emitirRef} aria-labelledby="dlg-emitir" className={dialogCls}>
        <div className="space-y-4 p-6">
          <h2 id="dlg-emitir" className="font-display text-lg font-semibold">
            ¿Emitir {plural(porEmitir.length, "documento", "documentos")}?
          </h2>
          <ul className="max-h-60 space-y-1 overflow-y-auto text-sm tabular-nums">
            {porEmitir.map((t) => (
              <li key={t.key} className="flex justify-between gap-4">
                <span className="min-w-0 truncate">
                  {t.p.nombre} <span className="text-[var(--ink-muted)]">· {periodoTxt(t.periodo)}</span>
                </span>
                <span>{clp(t.p.total)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-4 border-t border-[var(--line)] pt-1 font-semibold">
              <span>Total</span>
              <span>{clp(totalLote)}</span>
            </li>
          </ul>
          <p className={cn("rounded-[var(--radius-md)] px-3 py-2 text-sm", enProd ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--fiscal-soft)] text-[var(--fiscal)]")}>
            {enProd
              ? "Producción: tienen valor tributario y gastan folios reales. Un documento emitido solo se corrige con nota de crédito."
              : "Certificación (maullin): documentos de prueba, sin valor tributario."}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btnSecondary} onClick={() => emitirRef.current?.close()}>
              Cancelar
            </button>
            <button type="button" className={btnPrimary} onClick={() => void emitir()}>
              Sí, emitir {plural(porEmitir.length, "documento", "documentos")}
            </button>
          </div>
        </div>
      </dialog>

      {/* ── Confirmar borrado ──────────────────────────── */}
      <dialog ref={borrarRef} aria-labelledby="dlg-borrar" className={dialogCls} onClose={() => setBorrar(null)}>
        <div className="space-y-4 p-6">
          <h2 id="dlg-borrar" className="font-display text-lg font-semibold">
            ¿Eliminar «{borrar?.nombre}»?
          </h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Dejará de aparecer en los pendientes. Los documentos que ya emitiste con ella no se tocan. Si solo quieres pausarla, apágala.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btnSecondary} onClick={() => borrarRef.current?.close()}>
              Cancelar
            </button>
            <button type="button" className={btnDanger} onClick={() => void confirmarBorrar()}>
              Eliminar
            </button>
          </div>
        </div>
      </dialog>
    </AppShell>
  );
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
      {error ? <span className="block text-xs text-[var(--danger)]">{error}</span> : null}
    </label>
  );
}
