"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Pencil, Plus, Search, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { calcularDv, formatRutPuntos, partesRut, rutValido } from "@/lib/sii/rut";
import { btnDanger, btnPrimary, btnSecondary, card, dialogCls, input } from "@/lib/ui";
import { cn } from "@/lib/utils";

type GiroCliente = { codigo: string; glosa: string };

type Cliente = {
  id: number;
  rut: string;
  dv: string;
  rut_formateado: string;
  razon_social: string;
  giro: string;
  giros?: GiroCliente[];
  email: string;
  email_cc?: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  telefono?: string;
  contacto?: string;
  /** DTE emitidos a este cliente (lo calcula la API). */
  documentos?: number;
};

type FormState = {
  razon_social: string;
  rut_display: string;
  giro: string;
  giros: GiroCliente[];
  giros_disponibles: GiroCliente[];
  email: string;
  email_cc: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  telefono: string;
  contacto: string;
};

type StcOk = { ok: true; razon_social: string; giros: GiroCliente[]; con_tegi?: boolean };
type StcErr = { ok: false; message: string; url_sii?: string; codigo?: string };

const EMPTY: FormState = {
  razon_social: "",
  rut_display: "",
  giro: "",
  giros: [],
  giros_disponibles: [],
  email: "",
  email_cc: "",
  direccion: "",
  comuna: "",
  ciudad: "",
  telefono: "",
  contacto: "",
};

const PER_PAGE = 100;

function rutDe(c: Cliente) {
  return formatRutPuntos(c.rut_formateado || `${c.rut}-${c.dv}`);
}

/** Mensaje de RUT inválido con el DV correcto, o null si está bien. */
function errorRut(display: string): string | null {
  const { cuerpo, dv } = partesRut(display);
  if (!cuerpo) return "Ingresa el RUT del cliente.";
  if (!dv || cuerpo.length < 6) return "El RUT está incompleto. Escríbelo con su dígito verificador.";
  if (!rutValido(display)) return `El dígito verificador no corresponde: para ${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")} es ${calcularDv(cuerpo)}.`;
  return null;
}

export default function ClientesPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const formRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState("");
  const [rutError, setRutError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [verificado, setVerificado] = useState(false);
  const [stcHint, setStcHint] = useState<{ message: string; url?: string; warn?: boolean } | null>(null);

  const delRef = useRef<HTMLDialogElement>(null);
  const [borrar, setBorrar] = useState<Cliente | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await api<{ data: Cliente[]; total?: number }>(
        `/clientes?per_page=${PER_PAGE}&q=${encodeURIComponent(query)}`,
      );
      setRows(r.data || []);
      setTotal(r.total ?? (r.data || []).length);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudieron cargar los clientes.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Una sola carga por cambio de búsqueda (la inicial va con q vacío).
  useEffect(() => {
    const t = setTimeout(() => void load(q), q ? 220 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  function abrirForm(c: Cliente | null) {
    setEditing(c);
    setFormError("");
    setRutError(null);
    setStcHint(null);
    setFlash(null);
    if (!c) {
      setForm(EMPTY);
      setVerificado(false);
    } else {
      const giros = c.giros?.length ? c.giros : c.giro ? [{ codigo: "", glosa: c.giro }] : [];
      setForm({
        razon_social: c.razon_social || "",
        rut_display: rutDe(c),
        giro: c.giro || "",
        giros,
        giros_disponibles: giros,
        email: c.email || "",
        email_cc: c.email_cc || "",
        direccion: c.direccion || "",
        comuna: c.comuna || "",
        ciudad: c.ciudad || "",
        telefono: c.telefono || "",
        contacto: c.contacto || "",
      });
      setVerificado(Boolean(c.razon_social && giros.length));
    }
    formRef.current?.showModal();
  }

  function onRutChange(raw: string) {
    setForm((f) => ({ ...f, rut_display: formatRutPuntos(raw) }));
    setRutError(null);
    setVerificado(false);
    setStcHint(null);
  }

  function toggleGiro(g: GiroCliente) {
    setForm((f) => {
      const key = g.codigo || g.glosa;
      const selected = f.giros.some((x) => (x.codigo || x.glosa) === key);
      const giros = selected ? f.giros.filter((x) => (x.codigo || x.glosa) !== key) : [...f.giros, g];
      const giro = f.giro && giros.some((x) => x.glosa === f.giro) ? f.giro : giros[0]?.glosa || "";
      return { ...f, giros, giro };
    });
  }

  async function verificarSii() {
    setFormError("");
    setStcHint(null);
    const rErr = errorRut(form.rut_display);
    if (rErr) {
      setRutError(rErr);
      return;
    }
    setVerificando(true);
    try {
      const result = await api<StcOk | StcErr>("/sii/consulta-stc", {
        method: "POST",
        body: JSON.stringify({ rut: form.rut_display }),
      });
      if (!result.ok) {
        setVerificado(false);
        setStcHint({ message: result.message, url: result.url_sii });
        return;
      }
      const giros = (result.giros || []).map((g) => ({ codigo: g.codigo || "", glosa: g.glosa || "" }));
      setForm((f) => ({
        ...f,
        razon_social: result.razon_social || f.razon_social,
        giros_disponibles: giros,
        giros: giros.length === 1 ? giros : f.giros.length ? f.giros : giros.slice(0, 1),
        giro:
          giros.length === 1
            ? giros[0].glosa
            : f.giro && giros.some((g) => g.glosa === f.giro)
              ? f.giro
              : giros[0]?.glosa || f.giro,
      }));
      setVerificado(true);
      if (result.con_tegi) {
        setStcHint({ message: "Atención: el contribuyente figura con término de giro en el SII.", warn: true });
      }
    } catch (err) {
      setVerificado(false);
      setStcHint({
        message: err instanceof Error ? err.message : "No se pudo consultar el SII.",
        url: "https://www2.sii.cl/stc/noauthz/consulta",
      });
    } finally {
      setVerificando(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const rErr = errorRut(form.rut_display);
    if (rErr) {
      setRutError(rErr);
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const { cuerpo, dv } = partesRut(form.rut_display);
      const payload = {
        razon_social: form.razon_social.trim(),
        rut: cuerpo,
        dv,
        giro: form.giro || form.giros[0]?.glosa || "",
        giros: form.giros,
        email: form.email.trim(),
        email_cc: form.email_cc.trim(),
        direccion: form.direccion.trim(),
        comuna: form.comuna.trim(),
        ciudad: form.ciudad.trim(),
        telefono: form.telefono.trim(),
        contacto: form.contacto.trim(),
      };
      if (editing) {
        await api(`/clientes/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/clientes", { method: "POST", body: JSON.stringify(payload) });
      }
      formRef.current?.close();
      setFlash(editing ? `Guardamos los cambios de ${payload.razon_social}.` : `${payload.razon_social} quedó en tus clientes.`);
      await load(q);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  function abrirBorrar(c: Cliente) {
    setBorrar(c);
    setDelError(null);
    setFlash(null);
    delRef.current?.showModal();
  }

  async function confirmarBorrar() {
    if (!borrar || borrando) return;
    setBorrando(true);
    setDelError(null);
    try {
      await api(`/clientes/${borrar.id}`, { method: "DELETE" });
      delRef.current?.close();
      setFlash(`Eliminaste a ${borrar.razon_social}.`);
      await load(q);
    } catch (err) {
      setDelError(err instanceof Error ? err.message : "No se pudo eliminar. Inténtalo de nuevo.");
    } finally {
      setBorrando(false);
    }
  }

  const nDisponibles = form.giros_disponibles.length;
  const docsBorrar = borrar?.documentos ?? 0;

  return (
    <AppShell
      title="Clientes"
      subtitle="Directorio de empresas a las que facturas"
      actions={
        <button type="button" onClick={() => abrirForm(null)} className={btnPrimary}>
          <Plus className="h-4 w-4" aria-hidden />
          Nuevo cliente
        </button>
      }
    >
      <div className="mx-auto max-w-[1200px] space-y-5">
        <div role="status" aria-live="polite">
          {flash ? (
            <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--ok)_25%,transparent)] bg-[var(--ok-soft)] px-4 py-3 text-sm text-[var(--ok)]">
              {flash}
            </div>
          ) : null}
        </div>

        <section className={card} aria-label="Clientes">
          <div className="flex flex-col gap-2 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block sm:w-80">
              <span className="sr-only">Buscar por razón social o RUT</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
                aria-hidden
              />
              <input
                type="search"
                className={cn(input, "pl-9")}
                placeholder="Razón social o RUT"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            {!loading && !loadError && total > 0 ? (
              <p className="text-xs tabular-nums text-[var(--ink-muted)]">
                {total > rows.length
                  ? `Mostrando ${rows.length} de ${total}. Afina la búsqueda para ver el resto.`
                  : `${total} cliente${total === 1 ? "" : "s"}`}
              </p>
            ) : null}
          </div>

          {loading ? (
            <div role="status" className="py-12 text-center text-sm text-[var(--ink-muted)]">
              Cargando clientes…
            </div>
          ) : loadError ? (
            <div role="alert" className="py-12 text-center">
              <p className="text-sm text-[var(--danger)]">{loadError}</p>
              <button type="button" onClick={() => void load(q)} className={cn(btnSecondary, "mt-4")}>
                Reintentar
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-14 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-[var(--line-strong)]" aria-hidden />
              {q.trim() ? (
                <p className="text-sm text-[var(--ink-muted)]">Ningún cliente coincide con «{q.trim()}».</p>
              ) : (
                <>
                  <p className="text-sm text-[var(--ink-muted)]">
                    Todavía no tienes clientes. Guárdalos una vez y emite más rápido.
                  </p>
                  <button type="button" onClick={() => abrirForm(null)} className={cn(btnPrimary, "mt-4")}>
                    <Plus className="h-4 w-4" aria-hidden />
                    Agregar el primero
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-[var(--line)] bg-[var(--surface-sunken)] text-xs text-[var(--ink-muted)]">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium">RUT</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Razón social</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Giro</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Casilla de intercambio</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-medium">Documentos</th>
                    <th scope="col" className="px-5 py-2.5">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-[var(--ink)]">{rutDe(c)}</td>
                      <td className="max-w-[280px] px-5 py-3">
                        <button
                          type="button"
                          onClick={() => abrirForm(c)}
                          className="block max-w-full truncate text-left font-semibold text-ink-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]"
                          title={c.razon_social}
                        >
                          {c.razon_social}
                        </button>
                      </td>
                      <td className="max-w-[240px] truncate px-5 py-3 text-[var(--ink)]" title={c.giro}>
                        {c.giro || "—"}
                      </td>
                      <td className="max-w-[220px] truncate px-5 py-3 text-[var(--ink)]" title={c.email}>
                        {c.email ? c.email.toLowerCase() : <span className="text-[var(--ink-muted)]">Sin casilla</span>}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-[var(--ink-muted)]">{c.documentos ?? "—"}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => abrirForm(c)}
                            className="rounded-[var(--radius-md)] p-2 text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]"
                            aria-label={`Editar ${c.razon_social}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirBorrar(c)}
                            className="rounded-[var(--radius-md)] p-2 text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]"
                            aria-label={`Eliminar ${c.razon_social}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* ── Crear / editar ─────────────────────────────── */}
      <dialog
        ref={formRef}
        aria-labelledby="dlg-cliente"
        className={cn(dialogCls, "w-[min(94vw,640px)]")}
        onCancel={(e) => saving && e.preventDefault()}
      >
        <form onSubmit={onSubmit} className="max-h-[88vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-6 py-4">
            <div>
              <h2 id="dlg-cliente" className="font-display text-lg font-semibold text-fiscal">
                {editing ? "Editar cliente" : "Nuevo cliente"}
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                Los campos marcados con * van en la factura y el SII los exige.
              </p>
            </div>
            <button
              type="button"
              className="-mr-2 rounded-[var(--radius-md)] p-2 text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]"
              onClick={() => formRef.current?.close()}
              disabled={saving}
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="space-y-6 px-6 py-5">
            {formError ? (
              <div role="alert" className="rounded-[var(--radius-md)] border border-danger-soft bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                {formError}
              </div>
            ) : null}

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-[var(--ink)]">Identificación</legend>

              <div className="space-y-1">
                <label htmlFor="cli-rut" className="block text-xs font-medium text-[var(--ink-muted)]">
                  RUT *
                </label>
                <div className="flex gap-2">
                  <input
                    id="cli-rut"
                    className={cn(input, "tabular-nums", rutError && "border-[var(--danger)]")}
                    placeholder="78.533.567-8"
                    value={form.rut_display}
                    onChange={(e) => onRutChange(e.target.value)}
                    onBlur={() => form.rut_display && setRutError(errorRut(form.rut_display))}
                    aria-invalid={Boolean(rutError)}
                    aria-describedby={rutError ? "cli-rut-err" : undefined}
                    autoComplete="off"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => void verificarSii()}
                    disabled={verificando}
                    aria-busy={verificando}
                    className={cn(btnSecondary, "shrink-0")}
                  >
                    <ShieldCheck className="h-4 w-4 text-[var(--fiscal)]" aria-hidden />
                    {verificando ? "Consultando…" : "Verificar en SII"}
                  </button>
                </div>
                {rutError ? (
                  <p id="cli-rut-err" role="alert" className="text-xs text-[var(--danger)]">
                    {rutError}
                  </p>
                ) : null}
              </div>

              {verificado ? (
                <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--ok)_25%,transparent)] bg-[var(--ok-soft)] px-3 py-2.5 text-sm text-[var(--ok)]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    Contribuyente verificado en el SII.
                    {nDisponibles > 1 ? ` Marca los giros que aplican (${nDisponibles} disponibles).` : ""}
                  </span>
                </div>
              ) : null}

              {stcHint ? (
                <div
                  role={stcHint.warn ? "alert" : undefined}
                  className={cn(
                    "rounded-[var(--radius-md)] border px-3 py-2.5 text-sm",
                    stcHint.warn
                      ? "border-warn-soft bg-[var(--warn-soft)] text-[var(--warn)]"
                      : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink)]",
                  )}
                >
                  <p>{stcHint.message}</p>
                  {stcHint.url ? (
                    <a
                      href={stcHint.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block font-medium text-[var(--fiscal)] underline-offset-2 hover:underline"
                    >
                      Abrir consulta en el SII
                    </a>
                  ) : null}
                </div>
              ) : null}

              <Campo label="Razón social *">
                <input
                  className={input}
                  value={form.razon_social}
                  onChange={(e) => setForm((f) => ({ ...f, razon_social: e.target.value }))}
                  required
                />
              </Campo>

              {nDisponibles > 0 ? (
                <div role="group" aria-labelledby="cli-giros">
                  <p id="cli-giros" className="text-xs font-medium text-[var(--ink-muted)]">
                    Giros registrados en el SII
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.giros_disponibles.map((g) => {
                      const key = g.codigo || g.glosa;
                      const on = form.giros.some((x) => (x.codigo || x.glosa) === key);
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleGiro(g)}
                          className={cn(
                            "max-w-full rounded-[var(--radius-md)] border px-2.5 py-1.5 text-left text-xs leading-snug transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]",
                            on
                              ? "border-[var(--fiscal)] bg-[var(--fiscal-soft)] text-[var(--ink)]"
                              : "border-[var(--line)] text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]",
                          )}
                        >
                          {g.glosa}
                          {g.codigo ? <span className="mt-0.5 block tabular-nums opacity-80">{g.codigo}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <Campo label="Giro que va en la factura *" hint={nDisponibles ? "Se completa con el primer giro marcado; puedes editarlo." : undefined}>
                <input
                  className={input}
                  value={form.giro}
                  onChange={(e) => setForm((f) => ({ ...f, giro: e.target.value }))}
                  required
                />
              </Campo>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-[var(--ink)]">Facturación electrónica</legend>
              <Campo label="Casilla de intercambio (DTE)" hint="Correo donde el cliente recibe el XML de sus facturas.">
                <input
                  className={input}
                  type="email"
                  placeholder="dte@cliente.cl"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </Campo>
              <Campo label="Dirección *">
                <input
                  className={input}
                  value={form.direccion}
                  onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
                  autoComplete="address-line1"
                  required
                />
              </Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Comuna *">
                  <input
                    className={input}
                    value={form.comuna}
                    onChange={(e) => setForm((f) => ({ ...f, comuna: e.target.value }))}
                    required
                  />
                </Campo>
                <Campo label="Ciudad">
                  <input
                    className={input}
                    value={form.ciudad}
                    onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))}
                  />
                </Campo>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-[var(--ink)]">Contacto</legend>
              <Campo label="Correos en copia" hint="Reciben el PDF. Separa varios con coma.">
                <input
                  className={input}
                  type="email"
                  multiple
                  placeholder="pagos@cliente.cl, contabilidad@cliente.cl"
                  value={form.email_cc}
                  onChange={(e) => setForm((f) => ({ ...f, email_cc: e.target.value }))}
                />
              </Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Teléfono">
                  <input
                    className={input}
                    type="tel"
                    value={form.telefono}
                    onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  />
                </Campo>
                <Campo label="Persona de contacto">
                  <input
                    className={input}
                    value={form.contacto}
                    onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))}
                  />
                </Campo>
              </div>
            </fieldset>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--line)] px-6 py-4 sm:flex-row sm:justify-end">
            <button type="button" className={btnSecondary} onClick={() => formRef.current?.close()} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={btnPrimary} disabled={saving} aria-busy={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar cliente"}
            </button>
          </div>
        </form>
      </dialog>

      {/* ── Eliminar ───────────────────────────────────── */}
      <dialog
        ref={delRef}
        aria-labelledby="dlg-borrar-cliente"
        className={dialogCls}
        onCancel={(e) => borrando && e.preventDefault()}
        onClose={() => setBorrar(null)}
      >
        {borrar ? (
          <div className="space-y-4 p-6">
            {docsBorrar > 0 ? (
              <>
                <h2 id="dlg-borrar-cliente" className="font-display text-lg font-semibold">
                  {borrar.razon_social} no se puede eliminar
                </h2>
                <p className="text-sm text-[var(--ink-muted)]">
                  Le emitiste {docsBorrar} documento{docsBorrar === 1 ? "" : "s"}. Esos documentos ya están firmados
                  y el SII los tiene registrados con este receptor, así que el cliente se queda en tu directorio. Si
                  cambió algún dato, edítalo.
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" className={btnSecondary} onClick={() => delRef.current?.close()}>
                    Entendido
                  </button>
                  <button
                    type="button"
                    className={btnPrimary}
                    onClick={() => {
                      const c = borrar;
                      delRef.current?.close();
                      abrirForm(c);
                    }}
                  >
                    Editar cliente
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="dlg-borrar-cliente" className="font-display text-lg font-semibold">
                  ¿Eliminar a {borrar.razon_social}?
                </h2>
                <p className="text-sm text-[var(--ink-muted)]">
                  RUT <span className="tabular-nums">{rutDe(borrar)}</span>. No tiene documentos emitidos. Si vuelves a
                  facturarle, tendrás que ingresarlo de nuevo.
                </p>
                {delError ? (
                  <p role="alert" className="text-sm text-[var(--danger)]">
                    {delError}
                  </p>
                ) : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" className={btnSecondary} disabled={borrando} onClick={() => delRef.current?.close()}>
                    Cancelar
                  </button>
                  <button type="button" className={btnDanger} disabled={borrando} aria-busy={borrando} onClick={() => void confirmarBorrar()}>
                    {borrando ? "Eliminando…" : "Eliminar cliente"}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </dialog>
    </AppShell>
  );
}

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-[var(--ink-muted)]">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-[var(--ink-muted)]">{hint}</span> : null}
    </label>
  );
}
