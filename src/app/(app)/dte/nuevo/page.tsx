"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { TIPOS_DTE } from "@/lib/seed";
import { calcularDv, rutValido } from "@/lib/sii/rut";
import { cn, formatCLP, UNIDADES } from "@/lib/utils";

type Cliente = {
  id: number;
  razon_social: string;
  rut: string;
  dv: string;
  rut_formateado: string;
  giro?: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
  email?: string;
  email_cc?: string;
};

type Producto = { id: number; nombre: string; precio: number; exento: boolean; unidad: string };

type CafEstado = {
  data: {
    ambiente: string;
    tipos: {
      tipo_dte: number;
      tipo_nombre: string;
      disponibles: number;
      proximo_folio?: number | null;
      caf_en_uso: { desde?: number; hasta?: number; vence_el?: string } | null;
    }[];
  };
};

type EmisionResult = {
  data: { id: number; folio: number; tipo_nombre: string; monto_total: number; estado: string; ambiente: string };
  totales: { neto: number; exento: number; iva: number; total: number };
  sii: { track_id: string | null; estado: string; glosa: string | null };
  xml_path: string | null;
};

type ItemRow = {
  nombre: string;
  unidad: string;
  cantidad: number;
  precio: number;
  exento: boolean;
};

type CuotaRow = { fecha: string; monto: number; glosa: string };
type RefRow = { tipo_doc: string; folio: string; fecha: string; razon: string };


const fieldClass =
  "w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--pulso)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--pulso)_25%,transparent)]";

function hoyIso() {
  return new Date().toISOString().slice(0, 10);
}

function NuevoDteForm() {
  const params = useSearchParams();
  const tipo = Number(params.get("tipo") || 33);
  const cotizacionId = params.get("cotizacion");
  const tipoNombre = TIPOS_DTE.find((t) => t.codigo === tipo)?.nombre || `Tipo ${tipo}`;

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [caf, setCaf] = useState<CafEstado["data"] | null>(null);

  const [fecha, setFecha] = useState(hoyIso());
  const [formaPago, setFormaPago] = useState<1 | 2>(1);

  const [rutCuerpo, setRutCuerpo] = useState("");
  const [rutDv, setRutDv] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [giro, setGiro] = useState("");
  const [direccion, setDireccion] = useState("");
  const [comuna, setComuna] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [casilla, setCasilla] = useState("");
  const [emailPdf, setEmailPdf] = useState("");

  const [items, setItems] = useState<ItemRow[]>([
    { nombre: "", unidad: "", cantidad: 1, precio: 0, exento: false },
  ]);
  const [impuestoAdicional, setImpuestoAdicional] = useState(false);
  const [cuotas, setCuotas] = useState<CuotaRow[]>([]);
  const [refs, setRefs] = useState<RefRow[]>([]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<EmisionResult | null>(null);
  const [buscandoStc, setBuscandoStc] = useState(false);
  const [gate, setGate] = useState<"loading" | "blocked" | "ok">("loading");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ progreso_pct?: number; ambiente?: string }>("/onboarding/estado"),
      api<{ data: Cliente[] }>("/clientes?per_page=100"),
      api<{ data: Producto[] }>("/productos?per_page=100"),
      api<CafEstado>("/caf/estado"),
      cotizacionId
        ? api<{
            data: {
              numero: string;
              receptor_rut: string;
              receptor_razon_social: string;
              receptor_giro?: string;
              receptor_direccion?: string;
              receptor_comuna?: string;
              receptor_email?: string;
              items: { nombre: string; cantidad: number; precio: number; exento?: boolean }[];
              notas?: string;
            };
          }>(`/cotizaciones/${cotizacionId}`)
        : Promise.resolve(null),
    ])
      .then(([onb, c, p, cafRes, cotRes]) => {
        if (cancelled) return;
        const operativa = (onb.ambiente === "certificacion" || Number(onb.progreso_pct ?? 0) >= 100);
        setGate(operativa ? "ok" : "blocked");
        setClientes(c.data || []);
        setProductos(p.data || []);
        setCaf(cafRes.data);
        if (cotRes?.data) {
          const cot = cotRes.data;
          const [cuerpo, dv] = cot.receptor_rut.replace(/\./g, "").split("-");
          setRutCuerpo(cuerpo || "");
          setRutDv((dv || "").toUpperCase());
          setRazonSocial(cot.receptor_razon_social || "");
          setGiro(cot.receptor_giro || "");
          setDireccion(cot.receptor_direccion || "");
          setComuna(cot.receptor_comuna || "");
          setCasilla(cot.receptor_email || "");
          setItems(
            cot.items.length
              ? cot.items.map((it) => ({
                  nombre: it.nombre,
                  unidad: "UN",
                  cantidad: Number(it.cantidad) || 1,
                  precio: Number(it.precio) || 0,
                  exento: Boolean(it.exento),
                }))
              : [{ nombre: "", unidad: "", cantidad: 1, precio: 0, exento: false }],
          );
          if (cot.numero) {
            setRefs([{ tipo_doc: "801", folio: cot.numero.replace(/\D/g, "") || cot.numero, fecha: hoyIso(), razon: `Cotización ${cot.numero}` }]);
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setGate("ok");
        setError(err instanceof Error ? err.message : "No se pudo cargar el formulario");
      });
    return () => {
      cancelled = true;
    };
  }, [tipo, cotizacionId]);

  const cafTipo = caf?.tipos.find((t) => t.tipo_dte === tipo);
  const disponibles = cafTipo?.disponibles ?? 0;
  const proximoFolio = cafTipo?.proximo_folio ?? null;

  const totals = useMemo(() => {
    let neto = 0;
    let exento = 0;
    for (const it of items) {
      const monto = Math.round(Number(it.cantidad) * Number(it.precio));
      if (it.exento) exento += monto;
      else neto += monto;
    }
    const iva = Math.round(neto * 0.19);
    return { neto, exento, iva, total: neto + iva + exento };
  }, [items]);

  function applyCliente(c: Cliente) {
    setRutCuerpo(c.rut);
    setRutDv(c.dv);
    setRazonSocial(c.razon_social);
    setGiro(c.giro || "");
    setDireccion(c.direccion || "");
    setComuna(c.comuna || "");
    setCiudad(c.ciudad || "");
    setCasilla(c.email || "");
    setEmailPdf(c.email_cc || "");
  }

  function onRutBlur() {
    const cuerpo = rutCuerpo.replace(/\D/g, "");
    if (!cuerpo) return;
    const dv = (rutDv || calcularDv(cuerpo)).toUpperCase();
    setRutDv(dv);
    const match = clientes.find((c) => c.rut === cuerpo && c.dv.toUpperCase() === dv);
    if (match) applyCliente(match);
  }

  async function verificarStc() {
    const cuerpo = rutCuerpo.replace(/\D/g, "");
    if (!cuerpo) return;
    const dv = (rutDv || calcularDv(cuerpo)).toUpperCase();
    setRutDv(dv);
    setBuscandoStc(true);
    try {
      const result = await api<{
        ok: boolean;
        razon_social?: string;
        giros?: { glosa: string }[];
        message?: string;
      }>("/sii/consulta-stc", {
        method: "POST",
        body: JSON.stringify({ rut: `${cuerpo}-${dv}` }),
      });
      if (result.ok) {
        setRazonSocial(result.razon_social || razonSocial);
        if (result.giros?.[0]?.glosa) setGiro(result.giros[0].glosa);
      } else {
        setError(result.message || "No se pudo consultar el RUT en el SII");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al consultar RUT");
    } finally {
      setBuscandoStc(false);
    }
  }

  function setItem(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function precioConIva(precioNeto: number, exento: boolean) {
    if (exento) return precioNeto;
    return Math.round(precioNeto * 1.19);
  }

  function precioDesdeConIva(conIva: number, exento: boolean) {
    if (exento) return conIva;
    return Math.round(conIva / 1.19);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResultado(null);
    try {
      const cuerpo = rutCuerpo.replace(/\D/g, "");
      const dv = rutDv.toUpperCase() || calcularDv(cuerpo);
      if (!cuerpo || !rutValido(`${cuerpo}-${dv}`)) {
        throw new Error("RUT receptor inválido");
      }
      if (!razonSocial.trim()) throw new Error("Indica la razón social del receptor");
      if (!items.some((it) => it.nombre.trim() && Number(it.cantidad) > 0 && Number(it.precio) > 0)) {
        throw new Error("Agrega al menos un ítem con precio");
      }
      if (disponibles <= 0) throw new Error("No hay folios disponibles para este tipo de DTE. Carga un CAF.");

      const res = await api<EmisionResult>("/dte", {
        method: "POST",
        body: JSON.stringify({
          tipo_dte: tipo,
          fecha_emision: fecha,
          transmitir: true,
          forma_pago: formaPago,
          receptor: {
            rut: cuerpo,
            dv,
            razon_social: razonSocial.trim(),
            giro: giro.trim() || undefined,
            direccion: direccion.trim() || undefined,
            comuna: comuna.trim() || undefined,
            ciudad: ciudad.trim() || undefined,
            casilla: casilla.trim() || undefined,
            email: emailPdf.trim() || undefined,
          },
          items: items
            .filter((it) => it.nombre.trim())
            .map((it) => ({
              nombre: it.nombre.trim(),
              cantidad: Number(it.cantidad),
              precio: Number(it.precio),
              exento: it.exento,
              unidad: it.unidad || undefined,
            })),
          cuotas:
            formaPago === 2
              ? cuotas
                  .filter((c) => c.fecha && Number(c.monto) > 0)
                  .map((c) => ({ fecha: c.fecha, monto: Number(c.monto), glosa: c.glosa || undefined }))
              : undefined,
          referencias: refs
            .filter((r) => r.tipo_doc && r.folio)
            .map((r) => ({
              tipo_doc: r.tipo_doc,
              folio: r.folio,
              fecha: r.fecha || undefined,
              razon: r.razon || undefined,
            })),
        }),
      });
      setResultado(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo emitir");
    } finally {
      setLoading(false);
    }
  }

  if (gate === "loading") {
    return (
      <AppShell title="Emitir DTE" subtitle="Comprobando habilitación…">
        <div className="space-y-3" aria-busy="true">
          <div className="h-28 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunken)]" />
          <div className="h-48 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-sunken)]" />
        </div>
      </AppShell>
    );
  }

  if (gate === "blocked") {
    return (
      <AppShell title="Emitir DTE" subtitle="Cuenta aún no operativa">
        <div className="pf-card max-w-lg space-y-3 p-6">
          <h2 className="font-display text-lg font-semibold text-ink-900">Completa la habilitación</h2>
          <p className="text-sm text-[var(--ink-muted)]">
            Una cuenta nueva no puede emitir al SII hasta terminar los pasos de habilitación
            (empresa, certificado, CAF y prueba).
          </p>
          <Link
            href="/dashboard"
            className="inline-flex rounded-[var(--radius-md)] bg-[var(--pulso)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Ir al dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  if (resultado) {
    const r = resultado;
    const enviado = r.sii?.estado === "enviado";
    const host = r.data.ambiente === "certificacion" ? "maullin" : "palena";
    return (
      <AppShell title="DTE emitido" subtitle={`${r.data.tipo_nombre} · Folio ${r.data.folio}`}>
        <div className="pf-card space-y-4 p-6">
          <div
            className={cn(
              "rounded-[var(--radius-md)] px-4 py-3 text-sm",
              enviado ? "bg-[var(--ok-soft)] text-[var(--ok)]" : "bg-[var(--warn-soft)] text-[var(--warn)]",
            )}
          >
            {enviado
              ? `Enviado al SII (${host}). Track-ID: ${r.sii.track_id ?? "—"}`
              : r.sii?.estado === "rechazado_envio"
                ? `El SII rechazó el envío${r.sii?.glosa ? " · " + r.sii.glosa : ""}`
                : `Estado: ${r.sii?.estado ?? "desconocido"}${r.sii?.glosa ? " · " + r.sii.glosa : ""}`}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Folio" value={`#${r.data.folio}`} />
            <Stat label="Neto" value={formatCLP(r.totales.neto)} />
            <Stat label="IVA 19%" value={formatCLP(r.totales.iva)} />
            <Stat label="Total" value={formatCLP(r.totales.total)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dte/${r.data.id}`}
              className="rounded-[var(--radius-md)] bg-[var(--pulso)] px-4 py-2 text-sm font-semibold text-white"
            >
              Ver / descargar PDF
            </Link>
            <Link href="/dte" className="rounded-[var(--radius-md)] border border-[var(--line)] px-4 py-2 text-sm">
              Ver documentos
            </Link>
            <button
              type="button"
              onClick={() => {
                setResultado(null);
                setItems([{ nombre: "", unidad: "", cantidad: 1, precio: 0, exento: false }]);
              }}
              className="rounded-[var(--radius-md)] border border-[var(--line)] px-4 py-2 text-sm"
            >
              Emitir otro
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Emitir DTE" subtitle="Nuevo documento tributario electrónico">
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Datos generales */}
        <section className="pf-card space-y-4 p-5">
          <h2 className="font-display text-base font-semibold text-ink-900">Datos generales</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">Tipo de documento</span>
              <select
                className={fieldClass}
                value={tipo}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  window.location.href = `/dte/nuevo?tipo=${t}`;
                }}
              >
                {TIPOS_DTE.filter((t) => [33, 61, 56, 52, 39, 46].includes(t.codigo)).map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">Fecha de emisión</span>
              <input type="date" className={fieldClass} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">Forma de pago</span>
              <select
                className={fieldClass}
                value={formaPago}
                onChange={(e) => setFormaPago(Number(e.target.value) === 2 ? 2 : 1)}
              >
                <option value={1}>Contado</option>
                <option value={2}>Crédito</option>
              </select>
            </label>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[var(--warn-soft)] px-4 py-3 text-sm text-[var(--warn)]">
            {disponibles > 0
              ? `${disponibles} folios disponibles para ${tipoNombre}${proximoFolio ? ` · Próximo folio: #${proximoFolio}` : ""}`
              : `Sin folios para ${tipoNombre}. Carga un CAF de certificación en /caf.`}
          </div>
        </section>

        {/* Receptor */}
        <section className="pf-card space-y-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-ink-900">Receptor (cliente)</h2>
            {clientes.length > 0 ? (
              <label className="text-sm">
                <span className="mb-1 block font-medium text-[var(--ink-muted)]">Cargar cliente guardado</span>
                <select
                  className={cn(fieldClass, "min-w-[220px]")}
                  defaultValue=""
                  onChange={(e) => {
                    const c = clientes.find((x) => String(x.id) === e.target.value);
                    if (c) applyCliente(c);
                  }}
                >
                  <option value="">Seleccionar…</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.razon_social} ({c.rut_formateado})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-12">
            <label className="text-sm sm:col-span-3">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">RUT</span>
              <input
                className={fieldClass}
                value={rutCuerpo}
                onChange={(e) => setRutCuerpo(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onBlur={onRutBlur}
                placeholder="76354771"
                required
              />
            </label>
            <label className="text-sm sm:col-span-1">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">DV</span>
              <input
                className={fieldClass}
                value={rutDv}
                onChange={(e) => setRutDv(e.target.value.toUpperCase().replace(/[^0-9K]/g, "").slice(0, 1))}
                onBlur={onRutBlur}
                placeholder="K"
                required
              />
            </label>
            <div className="flex items-end sm:col-span-3">
              <button
                type="button"
                onClick={() => void verificarStc()}
                disabled={buscandoStc || !rutCuerpo}
                className="w-full rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2.5 text-sm font-medium hover:bg-[var(--surface-sunken)] disabled:opacity-50"
              >
                {buscandoStc ? "Consultando…" : "Verificar en SII"}
              </button>
            </div>
            <label className="text-sm sm:col-span-5">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">Razón social</span>
              <input
                className={fieldClass}
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">Giro</span>
              <input className={fieldClass} value={giro} onChange={(e) => setGiro(e.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">Dirección</span>
              <input className={fieldClass} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">Comuna</span>
              <input className={fieldClass} value={comuna} onChange={(e) => setComuna(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">Ciudad</span>
              <input className={fieldClass} value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">Casilla de intercambio del receptor</span>
              <input
                className={fieldClass}
                type="email"
                value={casilla}
                onChange={(e) => setCasilla(e.target.value)}
                placeholder="dte@cliente.cl"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-[var(--ink-muted)]">Enviar copia con el PDF a (opcional)</span>
              <input
                className={fieldClass}
                type="email"
                value={emailPdf}
                onChange={(e) => setEmailPdf(e.target.value)}
                placeholder="pagos@cliente.cl"
              />
            </label>
          </div>
        </section>

        {/* Ítems */}
        <section className="pf-card space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-ink-900">Ítems / Servicios</h2>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--pulso)]"
              onClick={() =>
                setItems((prev) => [...prev, { nombre: "", unidad: "", cantidad: 1, precio: 0, exento: false }])
              }
            >
              <Plus className="h-4 w-4" /> Agregar ítem
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={impuestoAdicional}
              onChange={(e) => setImpuestoAdicional(e.target.checked)}
            />
            Este documento lleva impuesto adicional (licores, vinos, cervezas, bebidas, art. 37)
          </label>
          {impuestoAdicional ? (
            <p className="text-xs text-[var(--warn)]">
              El impuesto adicional aún no se declara en el XML; desmarca si no aplica.
            </p>
          ) : null}

          <div className="space-y-3">
            {items.map((it, idx) => {
              const monto = Math.round(Number(it.cantidad) * Number(it.precio));
              return (
                <div key={idx} className="rounded-[var(--radius-md)] border border-[var(--line)] p-3">
                  <div className="grid gap-2 sm:grid-cols-12">
                    <label className="text-sm sm:col-span-5">
                      <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Descripción</span>
                      <input
                        list="productos-list"
                        className={fieldClass}
                        value={it.nombre}
                        placeholder="Descripción del ítem"
                        onChange={(e) => {
                          const p = productos.find((x) => x.nombre === e.target.value);
                          setItem(idx, {
                            nombre: e.target.value,
                            precio: p ? p.precio : it.precio,
                            exento: p ? p.exento : it.exento,
                            unidad: p ? p.unidad : it.unidad,
                          });
                        }}
                        required
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Unidad</span>
                      <select
                        className={fieldClass}
                        value={it.unidad}
                        onChange={(e) => setItem(idx, { unidad: e.target.value })}
                      >
                        <option value="">Sin unidad</option>
                        {UNIDADES.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm sm:col-span-1">
                      <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Cant.</span>
                      <input
                        type="number"
                        min={0.001}
                        step="any"
                        className={fieldClass}
                        value={it.cantidad}
                        onChange={(e) => setItem(idx, { cantidad: Number(e.target.value) })}
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Precio sin IVA</span>
                      <input
                        type="number"
                        min={0}
                        className={fieldClass}
                        value={it.precio}
                        onChange={(e) => setItem(idx, { precio: Number(e.target.value) })}
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-[var(--ink-muted)]">Precio con IVA</span>
                      <input
                        type="number"
                        min={0}
                        className={fieldClass}
                        value={precioConIva(it.precio, it.exento)}
                        onChange={(e) =>
                          setItem(idx, { precio: precioDesdeConIva(Number(e.target.value), it.exento) })
                        }
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={it.exento}
                        onChange={(e) => setItem(idx, { exento: e.target.checked })}
                      />
                      Exento o no afecto a IVA
                    </label>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-[var(--ink-muted)]">Monto ítem</span>
                      <span className="font-semibold tabular-nums">{formatCLP(monto)}</span>
                      {items.length > 1 ? (
                        <button
                          type="button"
                          className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--danger)]"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Quitar ítem"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <datalist id="productos-list">
            {productos.map((p) => (
              <option key={p.id} value={p.nombre} />
            ))}
          </datalist>
        </section>

        {/* Cuotas */}
        <section className="pf-card space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-ink-900">Pago en cuotas (opcional)</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Si este documento se paga en cuotas, decláralas acá: el calendario viaja al SII. Lo normal es forma de
                pago crédito. Hasta 30 cuotas.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--pulso)]"
              onClick={() => {
                setFormaPago(2);
                setCuotas((prev) => [...prev, { fecha: hoyIso(), monto: 0, glosa: "" }].slice(0, 30));
              }}
            >
              <Plus className="h-4 w-4" /> Agregar cuota
            </button>
          </div>
          {cuotas.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">Sin cuotas.</p>
          ) : (
            <div className="space-y-2">
              {cuotas.map((c, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-12">
                  <input
                    type="date"
                    className={cn(fieldClass, "sm:col-span-3")}
                    value={c.fecha}
                    onChange={(e) =>
                      setCuotas((prev) => prev.map((row, i) => (i === idx ? { ...row, fecha: e.target.value } : row)))
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    className={cn(fieldClass, "sm:col-span-3")}
                    placeholder="Monto"
                    value={c.monto}
                    onChange={(e) =>
                      setCuotas((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, monto: Number(e.target.value) } : row)),
                      )
                    }
                  />
                  <input
                    className={cn(fieldClass, "sm:col-span-5")}
                    placeholder="Glosa (opcional)"
                    value={c.glosa}
                    onChange={(e) =>
                      setCuotas((prev) => prev.map((row, i) => (i === idx ? { ...row, glosa: e.target.value } : row)))
                    }
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--line)] p-2 text-[var(--danger)] sm:col-span-1"
                    onClick={() => setCuotas((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="mx-auto h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Totales */}
        <section className="pf-card p-5">
          <h2 className="mb-3 font-display text-base font-semibold text-ink-900">Totales</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <TotalBox label="Monto neto" value={formatCLP(totals.neto)} />
            <TotalBox label="IVA (19%)" value={formatCLP(totals.iva)} />
            <TotalBox label="Monto exento" value={formatCLP(totals.exento)} />
            <TotalBox label="Total" value={formatCLP(totals.total)} highlight />
          </div>
        </section>

        {/* Referencias */}
        <section className="pf-card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-ink-900">Referencias (opcional)</h2>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--pulso)]"
              onClick={() => setRefs((prev) => [...prev, { tipo_doc: "801", folio: "", fecha: hoyIso(), razon: "" }])}
            >
              <Plus className="h-4 w-4" /> Agregar
            </button>
          </div>
          {refs.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">Sin referencias</p>
          ) : (
            <div className="space-y-2">
              {refs.map((r, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-12">
                  <input
                    className={cn(fieldClass, "sm:col-span-2")}
                    placeholder="Tipo"
                    value={r.tipo_doc}
                    onChange={(e) =>
                      setRefs((prev) => prev.map((row, i) => (i === idx ? { ...row, tipo_doc: e.target.value } : row)))
                    }
                  />
                  <input
                    className={cn(fieldClass, "sm:col-span-2")}
                    placeholder="Folio"
                    value={r.folio}
                    onChange={(e) =>
                      setRefs((prev) => prev.map((row, i) => (i === idx ? { ...row, folio: e.target.value } : row)))
                    }
                  />
                  <input
                    type="date"
                    className={cn(fieldClass, "sm:col-span-3")}
                    value={r.fecha}
                    onChange={(e) =>
                      setRefs((prev) => prev.map((row, i) => (i === idx ? { ...row, fecha: e.target.value } : row)))
                    }
                  />
                  <input
                    className={cn(fieldClass, "sm:col-span-4")}
                    placeholder="Razón"
                    value={r.razon}
                    onChange={(e) =>
                      setRefs((prev) => prev.map((row, i) => (i === idx ? { ...row, razon: e.target.value } : row)))
                    }
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--line)] p-2 text-[var(--danger)] sm:col-span-1"
                    onClick={() => setRefs((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="mx-auto h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {error ? (
          <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pb-6">
          <Link
            href="/dte"
            className="rounded-[var(--radius-md)] border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-medium"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading || disponibles <= 0}
            className="rounded-[var(--radius-md)] bg-[var(--pulso)] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Emitiendo…" : "Emitir DTE al SII"}
          </button>
        </div>
      </form>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3">
      <p className="text-xs text-[var(--ink-muted)]">{label}</p>
      <p className="font-display text-base font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function TotalBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border px-3 py-3",
        highlight
          ? "border-[color-mix(in_srgb,var(--pulso)_30%,transparent)] bg-[var(--pulso-soft)]"
          : "border-[var(--line)] bg-white",
      )}
    >
      <p className="text-xs text-[var(--ink-muted)]">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums text-ink-900">{value}</p>
    </div>
  );
}

export default function NuevoDtePage() {
  return (
    <Suspense fallback={<AppShell title="Emitir DTE" subtitle="Cargando…"><div className="p-6 text-sm text-[var(--ink-muted)]">Cargando formulario…</div></AppShell>}>
      <NuevoDteForm />
    </Suspense>
  );
}
