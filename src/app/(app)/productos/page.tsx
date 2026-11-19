"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Package, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { parseCsvProductos, type FilaProducto } from "@/lib/csvProductos";
import type { Producto } from "@/lib/types";
import { btnDanger, btnPrimary, btnSecondary, card, dialogCls, input } from "@/lib/ui";
import { cn, formatCLP, UNIDADES } from "@/lib/utils";

const IVA = 0.19;

const NOMBRE_UNIDAD: Record<string, string> = {
  UN: "Unidad",
  HR: "Hora",
  DIA: "Día",
  MES: "Mes",
  KG: "Kilo",
  LT: "Litro",
  M: "Metro",
  M2: "Metro cuadrado",
  M3: "Metro cúbico",
  CF: "Caja / fardo",
};

type FormState = { codigo: string; nombre: string; precio: string; unidad: string; exento: boolean };
const EMPTY: FormState = { codigo: "", nombre: "", precio: "", unidad: "UN", exento: false };

type SortKey = "nombre" | "codigo" | "precio";

const EJEMPLO_CSV = "nombre;precio;codigo;unidad;exento\nAsesoría contable;120000;AS-01;HR;sí\nCaja de tornillos;2990;TO-10;CF;";

export default function ProductosPage() {
  const [rows, setRows] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const formRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Producto | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nombreRef = useRef<HTMLInputElement>(null);
  /** Último producto guardado con "Guardar y agregar otro" (se muestra dentro del diálogo). */
  const [ultimo, setUltimo] = useState<string | null>(null);
  /** El usuario escribe el precio con IVA incluido; se guarda el neto. */
  const [conIva, setConIva] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "nombre", asc: true });

  const impRef = useRef<HTMLDialogElement>(null);
  const [csv, setCsv] = useState("");
  const [importando, setImportando] = useState(false);
  const [impResult, setImpResult] = useState<{ creados: number; errores: { fila: number; message: string }[] } | null>(null);
  const [impError, setImpError] = useState<string | null>(null);
  const filasCsv: FilaProducto[] = useMemo(() => parseCsvProductos(csv), [csv]);

  const delRef = useRef<HTMLDialogElement>(null);
  const [borrar, setBorrar] = useState<Producto | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await api<{ data: Producto[] }>("/productos?per_page=500");
      setRows(r.data || []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtradas = term
      ? rows.filter((p) => p.nombre.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term))
      : rows;
    const dir = sort.asc ? 1 : -1;
    return [...filtradas].sort((a, b) =>
      sort.key === "precio"
        ? (a.precio - b.precio) * dir
        : a[sort.key].localeCompare(b[sort.key], "es", { numeric: true, sensitivity: "base" }) * dir,
    );
  }, [rows, q, sort]);

  function ordenarPor(key: SortKey) {
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: true }));
  }

  function abrirImportar() {
    setCsv("");
    setImpResult(null);
    setImpError(null);
    setFlash(null);
    impRef.current?.showModal();
  }

  async function leerArchivo(file: File | undefined) {
    if (!file) return;
    setImpResult(null);
    setCsv(await file.text());
  }

  async function importar() {
    if (!filasCsv.length || importando) return;
    setImportando(true);
    setImpError(null);
    try {
      const r = await api<{ creados: number; errores: { fila: number; message: string }[] }>("/productos/importar", {
        method: "POST",
        body: JSON.stringify({ filas: filasCsv }),
      });
      setImpResult(r);
      if (r.creados) await load();
      if (!r.errores.length) {
        impRef.current?.close();
        setFlash(`Importaste ${r.creados} producto${r.creados === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      setImpError(err instanceof Error ? err.message : "No se pudo importar. No se guardó nada; inténtalo de nuevo.");
    } finally {
      setImportando(false);
    }
  }

  function abrirForm(p: Producto | null) {
    setEditing(p);
    setFormError(null);
    setFlash(null);
    setConIva(false);
    setUltimo(null);
    setForm(
      p
        ? { codigo: p.codigo, nombre: p.nombre, precio: String(p.precio), unidad: p.unidad || "UN", exento: p.exento }
        : EMPTY,
    );
    formRef.current?.showModal();
    // showModal enfoca el primer botón (cerrar); el trabajo empieza en el nombre.
    requestAnimationFrame(() => nombreRef.current?.focus());
  }

  // Atajo N para "Nuevo producto", salvo que se esté escribiendo o haya un diálogo abierto.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']") || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      abrirForm(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // abrirForm solo usa setters y refs: estable aunque se redefina en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // form.precio guarda solo dígitos; se muestra con puntos de miles.
  const montoNum = Number(form.precio);
  const precioOk = form.precio !== "";
  // Lo que se guarda siempre es el neto; con IVA incluido se descuenta el 19% (exento: mismo monto).
  const precioNum = conIva && !form.exento ? Math.round(montoNum / (1 + IVA)) : montoNum;
  const brutoNum = form.exento ? precioNum : Math.round(precioNum * (1 + IVA));
  const ivaNum = brutoNum - precioNum;
  // Si el producto trae una unidad que no está en la lista, se conserva como opción.
  const unidades: string[] = (UNIDADES as readonly string[]).includes(form.unidad)
    ? [...UNIDADES]
    : [...UNIDADES, form.unidad];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const otro = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-otro") === "1";
    if (!precioOk) {
      setFormError("Falta el precio.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = { ...form, codigo: form.codigo.trim(), nombre: form.nombre.trim(), precio: precioNum };
      if (editing) {
        await api(`/productos/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/productos", { method: "POST", body: JSON.stringify(payload) });
      }
      if (otro && !editing) {
        // Carga en serie: conserva unidad e IVA (suelen repetirse) y vuelve al nombre.
        setUltimo(payload.nombre);
        setForm((f) => ({ ...EMPTY, unidad: f.unidad, exento: f.exento }));
        nombreRef.current?.focus();
      } else {
        formRef.current?.close();
        setFlash(editing ? `Guardamos los cambios de ${payload.nombre}.` : `${payload.nombre} quedó en tu catálogo.`);
      }
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  function abrirBorrar(p: Producto) {
    setBorrar(p);
    setDelError(null);
    setFlash(null);
    delRef.current?.showModal();
  }

  async function confirmarBorrar() {
    if (!borrar || borrando) return;
    setBorrando(true);
    setDelError(null);
    try {
      await api(`/productos/${borrar.id}`, { method: "DELETE" });
      delRef.current?.close();
      setFlash(`Sacaste ${borrar.nombre} del catálogo.`);
      await load();
    } catch (err) {
      setDelError(err instanceof Error ? err.message : "No se pudo eliminar. Inténtalo de nuevo.");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <AppShell
      title="Productos"
      subtitle="Catálogo para armar tus DTE"
      actions={
        <div className="flex gap-2">
          <button type="button" onClick={abrirImportar} className={cn(btnSecondary, "max-sm:px-3")}>
            <Upload className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Importar</span>
          </button>
          <button
            type="button"
            onClick={() => abrirForm(null)}
            aria-keyshortcuts="N"
            title="Nuevo producto (N)"
            className={cn(btnPrimary, "sm:pr-2.5")}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Nuevo producto
            <kbd className="hidden h-5 min-w-5 items-center justify-center rounded-[5px] bg-white/15 px-1 font-sans text-[11px] font-semibold leading-none text-white/85 sm:inline-flex">
              N
            </kbd>
          </button>
        </div>
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

        <section className={card} aria-label="Catálogo de productos">
          <div className="flex flex-col gap-2 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block sm:w-80">
              <span className="sr-only">Buscar por nombre o código</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
                aria-hidden
              />
              <input
                type="search"
                className={cn(input, "pl-9")}
                placeholder="Nombre o código"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <p className="text-xs text-[var(--ink-muted)]">Precios netos, sin IVA. El IVA se suma al emitir.</p>
          </div>

          {loading ? (
            <div role="status" className="py-12 text-center text-sm text-[var(--ink-muted)]">
              Cargando catálogo…
            </div>
          ) : loadError ? (
            <div role="alert" className="py-12 text-center">
              <p className="text-sm text-[var(--danger)]">{loadError}</p>
              <button type="button" onClick={() => void load()} className={cn(btnSecondary, "mt-4")}>
                Reintentar
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-14 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-[var(--line-strong)]" aria-hidden />
              <p className="mx-auto max-w-sm text-sm text-[var(--ink-muted)]">
                Guarda lo que vendes con su precio y, al emitir, lo eliges de la lista en vez de escribirlo.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => abrirForm(null)} className={btnPrimary}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Agregar el primero
                </button>
                <button type="button" onClick={abrirImportar} className={btnSecondary}>
                  <Upload className="h-4 w-4" aria-hidden />
                  Importar desde Excel
                </button>
              </div>
            </div>
          ) : visibles.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--ink-muted)]">Ningún producto coincide con «{q.trim()}».</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-[var(--line)] bg-[var(--surface-sunken)] text-xs text-[var(--ink-muted)]">
                  <tr>
                    <Th label="Código" k="codigo" sort={sort} onSort={ordenarPor} />
                    <Th label="Nombre" k="nombre" sort={sort} onSort={ordenarPor} />
                    <th scope="col" className="px-5 py-2.5 font-medium">Unidad</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">IVA</th>
                    <Th label="Precio neto" k="precio" sort={sort} onSort={ordenarPor} right />
                    <th scope="col" className="px-5 py-2.5">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {visibles.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-[var(--ink-muted)]">{p.codigo}</td>
                      <td className="max-w-[320px] px-5 py-3">
                        <button
                          type="button"
                          onClick={() => abrirForm(p)}
                          title={p.nombre}
                          className="block max-w-full truncate text-left font-semibold text-ink-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]"
                        >
                          {p.nombre}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-[var(--ink)]">{p.unidad}</td>
                      <td className="px-5 py-3">
                        {p.exento ? (
                          <span className="rounded-full bg-[var(--fiscal-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--fiscal)]">
                            Exento
                          </span>
                        ) : (
                          <span className="text-[var(--ink-muted)]">Afecto 19%</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums">{formatCLP(p.precio)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => abrirForm(p)}
                            aria-label={`Editar ${p.nombre}`}
                            className="rounded-[var(--radius-md)] p-2 text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirBorrar(p)}
                            aria-label={`Eliminar ${p.nombre}`}
                            className="rounded-[var(--radius-md)] p-2 text-[var(--ink-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]"
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
        aria-labelledby="dlg-producto"
        className={dialogCls}
        onCancel={(e) => saving && e.preventDefault()}
      >
        <form onSubmit={onSubmit}>
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-6 py-4">
            <div>
              <h2 id="dlg-producto" className="font-display text-lg font-semibold text-fiscal">
                {editing ? "Editar producto" : "Nuevo producto"}
              </h2>
              <p className="text-xs text-[var(--ink-muted)]">
                {editing
                  ? "Los cambios aplican a lo que emitas desde ahora; lo ya emitido no cambia."
                  : "Queda listo para elegirlo al emitir facturas y cotizaciones."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => formRef.current?.close()}
              disabled={saving}
              aria-label="Cerrar"
              className="-mr-2 rounded-[var(--radius-md)] p-2 text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="space-y-6 px-6 py-5">
            <div role="status" aria-live="polite" className="empty:hidden">
              {ultimo ? (
                <p className="flex items-center gap-2 text-sm text-[var(--ok)]">
                  <Check className="h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    «{ultimo}» quedó guardado. Sigue con el siguiente.
                  </span>
                </p>
              ) : null}
            </div>
            {formError ? (
              <div role="alert" className="rounded-[var(--radius-md)] border border-danger-soft bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                {formError}
              </div>
            ) : null}

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-[var(--ink)]">Producto</legend>
              <Campo label="Nombre *" hint="Así aparece en el detalle de la factura.">
                <input
                  ref={nombreRef}
                  className={input}
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  maxLength={80}
                  placeholder="Asesoría contable mensual"
                  required
                />
              </Campo>
              <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
                <Campo label="Código" hint={editing ? undefined : "Opcional. Si lo dejas vacío, lo generamos."}>
                  <input
                    className={cn(input, "tabular-nums")}
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    maxLength={35}
                    placeholder="AS-01"
                    autoComplete="off"
                  />
                </Campo>
                <Campo label="Unidad de medida">
                  <select className={input} value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
                    {unidades.map((u) => (
                      <option key={u} value={u}>
                        {NOMBRE_UNIDAD[u] ? `${NOMBRE_UNIDAD[u]} (${u})` : u}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-[var(--ink)]">Precio</legend>

              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tratamiento de IVA">
                {[
                  { v: false, t: "Afecto a IVA", d: "Se suma 19% al facturar" },
                  { v: true, t: "Exento de IVA", d: "La ley lo libera de IVA" },
                ].map((o) => (
                  <label
                    key={o.t}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5 text-sm transition focus-within:ring-2 focus-within:ring-[var(--fiscal-raise)]",
                      form.exento === o.v
                        ? "border-[var(--fiscal)] bg-[var(--fiscal-soft)]"
                        : "border-[var(--line)] hover:bg-[var(--surface-sunken)]",
                    )}
                  >
                    <input
                      type="radio"
                      name="tratamiento-iva"
                      checked={form.exento === o.v}
                      onChange={() => setForm({ ...form, exento: o.v })}
                      className="mt-0.5 accent-[var(--fiscal)]"
                    />
                    <span>
                      <span className="block font-medium text-[var(--ink)]">{o.t}</span>
                      <span className="block text-xs text-[var(--ink-muted)]">{o.d}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="space-y-1">
                <label htmlFor="prod-precio" className="block text-xs font-medium text-[var(--ink-muted)]">
                  {form.exento ? "Precio *" : conIva ? "Precio con IVA *" : "Precio neto *"}
                </label>
                <div className="flex h-10 items-center rounded-[var(--radius-md)] border border-[var(--line-strong)] bg-[var(--surface)] transition focus-within:border-[var(--fiscal)] focus-within:ring-2 focus-within:ring-[var(--fiscal-soft)]">
                  <span className="pl-3 text-sm text-[var(--ink-muted)]" aria-hidden>
                    $
                  </span>
                  <input
                    id="prod-precio"
                    className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.precio ? Number(form.precio).toLocaleString("es-CL") : ""}
                    onChange={(e) => setForm({ ...form, precio: e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12) })}
                    placeholder="0"
                    aria-describedby="prod-desglose"
                    required
                  />
                  {!form.exento ? (
                    <div role="radiogroup" aria-label="El monto que escribes es" className="mr-1 flex shrink-0 rounded-[calc(var(--radius-md)-3px)] bg-[var(--surface-sunken)] p-0.5 text-xs">
                      {[
                        { v: false, l: "Neto" },
                        { v: true, l: "Con IVA" },
                      ].map((o) => (
                        <button
                          key={o.l}
                          type="button"
                          role="radio"
                          aria-checked={conIva === o.v}
                          onClick={() => {
                            // Convierte el monto escrito para que el producto no cambie de precio al alternar.
                            if (precioOk && conIva !== o.v) {
                              setForm((f) => ({ ...f, precio: String(o.v ? brutoNum : precioNum) }));
                            }
                            setConIva(o.v);
                          }}
                          className={cn(
                            "rounded-[calc(var(--radius-md)-5px)] px-2 py-1 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]",
                            conIva === o.v
                              ? "bg-[var(--surface)] text-[var(--ink)] shadow-pf-1"
                              : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                          )}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <dl
                id="prod-desglose"
                aria-live="polite"
                className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-4 py-3 text-sm tabular-nums"
              >
                <dt className="text-[var(--ink-muted)]">Neto</dt>
                <dd className="text-right text-[var(--ink)]">{precioOk ? formatCLP(precioNum) : "—"}</dd>
                <dt className="text-[var(--ink-muted)]">IVA</dt>
                <dd className="text-right text-[var(--ink)]">
                  {form.exento ? "Exento" : precioOk ? `${formatCLP(ivaNum)}` : "—"}
                </dd>
                <dt className="mt-1 border-t border-[var(--line)] pt-1.5 font-medium text-[var(--ink)]">
                  Total por {NOMBRE_UNIDAD[form.unidad]?.toLowerCase() || form.unidad}
                </dt>
                <dd className="mt-1 border-t border-[var(--line)] pt-1.5 text-right font-semibold text-[var(--ink)]">
                  {precioOk ? formatCLP(brutoNum) : "—"}
                </dd>
              </dl>
            </fieldset>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--line)] px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" className={cn(btnSecondary, "sm:mr-auto sm:border-transparent")} onClick={() => formRef.current?.close()} disabled={saving}>
              {ultimo ? "Listo" : "Cancelar"}
            </button>
            {!editing ? (
              <button type="submit" data-otro="1" className={btnSecondary} disabled={saving}>
                Guardar y agregar otro
              </button>
            ) : null}
            <button type="submit" className={btnPrimary} disabled={saving} aria-busy={saving}>
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar producto"}
            </button>
          </div>
        </form>
      </dialog>

      {/* ── Importar ───────────────────────────────────── */}
      <dialog
        ref={impRef}
        aria-labelledby="dlg-importar"
        className={cn(dialogCls, "w-[min(94vw,640px)]")}
        onCancel={(e) => importando && e.preventDefault()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-6 py-4">
          <div>
            <h2 id="dlg-importar" className="font-display text-lg font-semibold text-fiscal">
              Importar productos
            </h2>
            <p className="text-xs text-[var(--ink-muted)]">
              Copia las columnas desde Excel y pégalas, o sube un .csv. Precios netos, sin IVA.
            </p>
          </div>
          <button
            type="button"
            onClick={() => impRef.current?.close()}
            disabled={importando}
            aria-label="Cerrar"
            className="-mr-2 rounded-[var(--radius-md)] p-2 text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <Campo label="Filas" hint="Columnas: nombre, precio, codigo, unidad, exento (sí/no). Solo nombre y precio son obligatorias.">
            <textarea
              className={cn(input, "h-36 py-2 font-mono text-xs")}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setImpResult(null);
              }}
              placeholder={EJEMPLO_CSV}
              spellCheck={false}
            />
          </Campo>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--fiscal)]">
            <Upload className="h-4 w-4" aria-hidden />
            <span className="underline underline-offset-2">o sube un archivo .csv</span>
            <input
              type="file"
              accept=".csv,.txt,text/csv"
              className="sr-only"
              onChange={(e) => {
                void leerArchivo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>

          {filasCsv.length ? (
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)]">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Vista previa de la importación</caption>
                <thead className="bg-[var(--surface-sunken)] text-[var(--ink-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-1.5 font-medium">#</th>
                    <th scope="col" className="px-3 py-1.5 font-medium">Nombre</th>
                    <th scope="col" className="px-3 py-1.5 text-right font-medium">Neto</th>
                    <th scope="col" className="px-3 py-1.5 font-medium">IVA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {filasCsv.slice(0, 5).map((f, i) => {
                    const err = impResult?.errores.find((e) => e.fila === i + 1);
                    return (
                      <tr key={i} className={err ? "bg-[var(--danger-soft)]" : undefined}>
                        <td className="px-3 py-1.5 tabular-nums text-[var(--ink-muted)]">{i + 1}</td>
                        <td className="max-w-[220px] truncate px-3 py-1.5">{f.nombre || <em className="text-[var(--danger)]">sin nombre</em>}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {Number.isFinite(f.precio) ? formatCLP(f.precio) : <em className="text-[var(--danger)]">sin precio</em>}
                        </td>
                        <td className="px-3 py-1.5">{f.exento ? "Exento" : "Afecto"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filasCsv.length > 5 ? (
                <p className="border-t border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)]">
                  y {filasCsv.length - 5} fila{filasCsv.length - 5 === 1 ? "" : "s"} más
                </p>
              ) : null}
            </div>
          ) : null}

          {impResult?.errores.length ? (
            <div role="alert" className="rounded-[var(--radius-md)] border border-danger-soft bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              <p className="font-medium">
                {impResult.creados ? `Se importaron ${impResult.creados}. ` : ""}
                {impResult.errores.length} fila{impResult.errores.length === 1 ? "" : "s"} no se importaron:
              </p>
              <ul className="mt-1 max-h-28 list-inside list-disc overflow-y-auto text-xs">
                {impResult.errores.map((e) => (
                  <li key={e.fila}>
                    Fila {e.fila}: {e.message}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs">Corrige esas filas y vuelve a pegar solo esas.</p>
            </div>
          ) : null}
          {impError ? (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {impError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--line)] px-6 py-4 sm:flex-row sm:justify-end">
          <button type="button" className={btnSecondary} onClick={() => impRef.current?.close()} disabled={importando}>
            {impResult ? "Cerrar" : "Cancelar"}
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={!filasCsv.length || importando || Boolean(impResult)}
            aria-busy={importando}
            onClick={() => void importar()}
          >
            {importando
              ? "Importando…"
              : filasCsv.length
                ? `Importar ${filasCsv.length} producto${filasCsv.length === 1 ? "" : "s"}`
                : "Importar"}
          </button>
        </div>
      </dialog>

      {/* ── Eliminar ───────────────────────────────────── */}
      <dialog
        ref={delRef}
        aria-labelledby="dlg-borrar-producto"
        className={dialogCls}
        onCancel={(e) => borrando && e.preventDefault()}
        onClose={() => setBorrar(null)}
      >
        {borrar ? (
          <div className="space-y-4 p-6">
            <h2 id="dlg-borrar-producto" className="font-display text-lg font-semibold">
              ¿Sacar «{borrar.nombre}» del catálogo?
            </h2>
            <p className="text-sm text-[var(--ink-muted)]">
              Deja de aparecer al emitir. Las facturas que ya emitiste con este producto no cambian.
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
                {borrando ? "Eliminando…" : "Eliminar producto"}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </AppShell>
  );
}

function Th({
  label,
  k,
  sort,
  onSort,
  right,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; asc: boolean };
  onSort: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = sort.key === k;
  const Icon = active && !sort.asc ? ChevronDown : ChevronUp;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.asc ? "ascending" : "descending") : "none"}
      className={cn("px-5 py-2.5 font-medium", right && "text-right")}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 rounded hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]",
          active && "text-[var(--ink)]",
        )}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", !active && "opacity-0")} aria-hidden />
      </button>
    </th>
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
