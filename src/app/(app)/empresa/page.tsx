"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save, Star, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

type Giro = { codigo: string; glosa: string; principal?: boolean };
type Empresa = {
  razon_social: string;
  rut_formateado: string;
  nombre_fantasia: string;
  giro: string;
  acteco: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  telefono: string;
  email: string;
  unidad_sii: string;
  usar_logo: boolean;
  formato_impresion: string | null;
  volumen_estimado: string | null;
  giros: Giro[];
  documentos_emitir: number[];
};

const DOC_OPTIONS = [
  { codigo: 33, label: "Factura" },
  { codigo: 34, label: "Factura Exenta" },
  { codigo: 39, label: "Boleta" },
  { codigo: 41, label: "Boleta Exenta" },
  { codigo: 46, label: "Factura de Compra" },
  { codigo: 52, label: "Guía de Despacho" },
  { codigo: 56, label: "Nota de Débito" },
  { codigo: 61, label: "Nota de Crédito" },
];

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none ring-brand-600/20 focus:ring disabled:bg-slate-50 disabled:text-slate-500";

export default function EmpresaPage() {
  const [form, setForm] = useState<Empresa | null>(null);
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<Empresa>("/empresa").then((e) =>
      setForm({
        ...e,
        nombre_fantasia: e.nombre_fantasia || "",
        telefono: e.telefono || "",
        unidad_sii: e.unidad_sii || "",
        giros: e.giros || [],
        documentos_emitir: e.documentos_emitir || [],
        usar_logo: Boolean(e.usar_logo),
        formato_impresion: e.formato_impresion ?? "",
        volumen_estimado: e.volumen_estimado ?? "",
      }),
    );
  }, []);

  function set<K extends keyof Empresa>(key: K, value: Empresa[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleDoc(codigo: number) {
    if (!form) return;
    const has = form.documentos_emitir.includes(codigo);
    set(
      "documentos_emitir",
      has ? form.documentos_emitir.filter((c) => c !== codigo) : [...form.documentos_emitir, codigo],
    );
  }

  function verificarSii() {
    if (!form?.acteco || !form.giro) return;
    const others = form.giros.filter((g) => g.codigo !== form.acteco);
    set("giros", [{ codigo: form.acteco, glosa: form.giro, principal: true }, ...others]);
  }

  async function onSave(e?: FormEvent) {
    e?.preventDefault();
    if (!form) return;
    setLoading(true);
    setSaved("");
    try {
      const next = await api<Empresa>("/empresa", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          formato_impresion: form.formato_impresion || null,
          volumen_estimado: form.volumen_estimado || null,
        }),
      });
      setForm({
        ...next,
        telefono: next.telefono || "",
        nombre_fantasia: next.nombre_fantasia || "",
        unidad_sii: next.unidad_sii || "",
        giros: next.giros || [],
        documentos_emitir: next.documentos_emitir || [],
        formato_impresion: next.formato_impresion ?? "",
        volumen_estimado: next.volumen_estimado ?? "",
      });
      setSaved("Cambios guardados. Si completaste los datos, el % de habilitación sube en el Dashboard.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="Mi empresa"
      subtitle="Datos del emisor que aparecen en tus documentos"
      actions={
        <button
          onClick={() => onSave()}
          disabled={!form || loading}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {loading ? "Guardando…" : "Guardar"}
        </button>
      }
    >
      {!form ? (
        <div className="grid place-items-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <form onSubmit={onSave} className="space-y-4">
          <section className="card p-5">
            <h2 className="font-display text-base font-semibold text-ink-900">Identificación</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">RUT</span>
                <input className={fieldClass} value={form.rut_formateado} disabled />
                <span className="mt-1 block text-xs text-slate-500">El RUT no se puede modificar</span>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Razón social</span>
                <input
                  className={fieldClass}
                  value={form.razon_social}
                  onChange={(e) => set("razon_social", e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Nombre de fantasía</span>
                <input
                  className={fieldClass}
                  value={form.nombre_fantasia}
                  onChange={(e) => set("nombre_fantasia", e.target.value)}
                  placeholder="GDT DEVSUR"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Giro principal</span>
                <input
                  className={fieldClass}
                  value={form.giro}
                  onChange={(e) => set("giro", e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Código de actividad económica (acteco)</span>
                <input
                  className={fieldClass}
                  value={form.acteco}
                  onChange={(e) => set("acteco", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Ej: 620100"
                  required
                />
                <span className="mt-1 block text-xs text-slate-500">El que tienes registrado en el SII (6 dígitos)</span>
              </label>
            </div>

            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">Giros de la empresa</p>
                <button
                  type="button"
                  onClick={verificarSii}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  Verificar en SII
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                El primer giro (★) se usa como giro principal en los DTE
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {form.giros.length === 0 ? (
                  <p className="text-sm text-slate-500">Aún no hay giros. Completa acteco/giro y pulsa Verificar en SII.</p>
                ) : (
                  form.giros.map((g) => (
                    <span
                      key={g.codigo}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
                    >
                      <Star className={`h-3.5 w-3.5 ${g.principal ? "fill-brand-600 text-brand-600" : "text-slate-300"}`} />
                      <span className="truncate">{g.glosa}</span>
                      <button
                        type="button"
                        aria-label="Quitar giro"
                        onClick={() => set("giros", form.giros.filter((x) => x.codigo !== g.codigo))}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-display text-base font-semibold text-ink-900">Ubicación y contacto</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Dirección</span>
                <input className={fieldClass} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} required />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Comuna</span>
                <input className={fieldClass} value={form.comuna} onChange={(e) => set("comuna", e.target.value)} required />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Ciudad</span>
                <input className={fieldClass} value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} required />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Teléfono</span>
                <input className={fieldClass} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Email</span>
                <input
                  type="email"
                  className={fieldClass}
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">Unidad del SII (en tus documentos)</span>
                <input
                  className={fieldClass}
                  value={form.unidad_sii}
                  onChange={(e) => set("unidad_sii", e.target.value)}
                  placeholder="S.I.I. - CAUQUENES"
                />
              </label>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-display text-base font-semibold text-ink-900">Logo (opcional)</h2>
            <p className="mt-1 text-sm text-slate-500">Se puede usar en documentos carta.</p>
            <input type="file" accept="image/*" className="mt-3 block w-full text-sm" />
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.usar_logo}
                onChange={(e) => set("usar_logo", e.target.checked)}
              />
              Usar el logo en los documentos (carta)
            </label>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-slate-700">Formato de impresión</span>
              <select
                className={fieldClass}
                value={form.formato_impresion || ""}
                onChange={(e) => set("formato_impresion", e.target.value)}
              >
                <option value="">Por defecto</option>
                <option value="carta">Carta</option>
                <option value="thermal80">Térmica 80mm</option>
              </select>
            </label>
          </section>

          <section className="card p-5">
            <h2 className="font-display text-base font-semibold text-ink-900">Contacto ante el SII</h2>
            <p className="mt-1 text-sm text-slate-500">
              Correos SII asociados: {form.email || "sin email"}
            </p>
          </section>

          <section className="card p-5">
            <h2 className="font-display text-base font-semibold text-ink-900">Cómo llegas a Facturador GDT DevSur</h2>
            <label className="mt-3 block text-sm">
              <span className="font-medium text-slate-700">¿Cuántos documentos emites al mes? (opcional)</span>
              <select
                className={fieldClass}
                value={form.volumen_estimado || ""}
                onChange={(e) => set("volumen_estimado", e.target.value)}
              >
                <option value="">Sin indicar</option>
                <option value="0-50">0-50</option>
                <option value="51-200">51-200</option>
                <option value="201-1000">201-1000</option>
                <option value="1000+">1000+</option>
              </select>
            </label>
          </section>

          <section className="card p-5">
            <h2 className="font-display text-base font-semibold text-ink-900">¿Qué documentos vas a emitir?</h2>
            <p className="mt-1 text-sm text-slate-500">Define los tipos que usarás en certificación y producción.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {DOC_OPTIONS.map((d) => (
                <label key={d.codigo} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.documentos_emitir.includes(d.codigo)}
                    onChange={() => toggleDoc(d.codigo)}
                  />
                  <span className="font-medium text-slate-500">{d.codigo}</span>
                  <span>{d.label}</span>
                </label>
              ))}
            </div>
          </section>

          {saved ? <p className="text-sm text-emerald-700">{saved}</p> : null}
        </form>
      )}
    </AppShell>
  );
}
