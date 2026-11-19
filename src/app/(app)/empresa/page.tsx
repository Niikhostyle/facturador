"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save, Star, Trash2, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api, getAuth } from "@/lib/api";

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
  has_logo?: boolean;
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
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMsg, setLogoMsg] = useState("");

  async function loadLogoPreview(hasLogo: boolean) {
    if (!hasLogo) {
      setLogoPreview(null);
      return;
    }
    try {
      const auth = getAuth();
      const res = await fetch("/api/v1/empresa/logo", {
        headers: {
          ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
          ...(auth?.tenantId ? { "X-Tenant-Id": String(auth.tenantId) } : {}),
        },
      });
      if (!res.ok) {
        setLogoPreview(null);
        return;
      }
      const blob = await res.blob();
      setLogoPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch {
      setLogoPreview(null);
    }
  }

  useEffect(() => {
    api<Empresa>("/empresa").then((e) => {
      setForm({
        ...e,
        nombre_fantasia: e.nombre_fantasia || "",
        telefono: e.telefono || "",
        unidad_sii: e.unidad_sii || "",
        giros: e.giros || [],
        documentos_emitir: e.documentos_emitir || [],
        usar_logo: Boolean(e.usar_logo),
        has_logo: Boolean(e.has_logo),
        formato_impresion: e.formato_impresion ?? "",
        volumen_estimado: e.volumen_estimado ?? "",
      });
      loadLogoPreview(Boolean(e.has_logo));
    });
  }, []);

  async function onLogoFile(file: File | null) {
    if (!file || !form) return;
    setLogoBusy(true);
    setLogoMsg("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("Selecciona una imagen (PNG, JPG o WebP).");
      if (file.size > 2.5 * 1024 * 1024) throw new Error("El logo no puede superar 2,5 MB.");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
        reader.readAsDataURL(file);
      });
      const res = await api<{ ok: boolean; message?: string; usar_logo?: boolean; has_logo?: boolean }>(
        "/empresa/logo",
        {
          method: "POST",
          body: JSON.stringify({ image_base64: dataUrl, mime: file.type }),
        },
      );
      setForm((prev) =>
        prev ? { ...prev, usar_logo: res.usar_logo !== false, has_logo: true } : prev,
      );
      setLogoPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return dataUrl;
      });
      setLogoMsg(res.message || "Logo guardado.");
      setSaved("Logo actualizado. Guarda el resto de datos si cambiaste algo más.");
    } catch (e) {
      setLogoMsg(e instanceof Error ? e.message : "No se pudo subir el logo");
    } finally {
      setLogoBusy(false);
    }
  }

  async function onDeleteLogo() {
    if (!form) return;
    setLogoBusy(true);
    setLogoMsg("");
    try {
      await api("/empresa/logo", { method: "DELETE" });
      setForm((prev) => (prev ? { ...prev, usar_logo: false, has_logo: false } : prev));
      setLogoPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      setLogoMsg("Logo eliminado.");
    } catch (e) {
      setLogoMsg(e instanceof Error ? e.message : "No se pudo eliminar");
    } finally {
      setLogoBusy(false);
    }
  }

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

  // RUT de la empresa para abrir la consulta en el SII.
  const rutConsulta = form?.rut_formateado || "";

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

            {/* Consultar situación tributaria en el SII (el SII exige reCAPTCHA: se abre en su sitio) */}
            <div className="mt-5 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Consultar situación tributaria en el SII</p>
                  <p className="text-xs text-slate-500">
                    El SII protege la consulta con reCAPTCHA, por eso se abre en su sitio. Copia la
                    razón social, el giro principal y el acteco a los campos de arriba.
                  </p>
                </div>
                <a
                  href="https://www2.sii.cl/stc/noauthz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  Consultar en el SII
                </a>
              </div>
              {rutConsulta && (
                <p className="mt-2 text-xs text-slate-500">
                  RUT a consultar: <span className="font-medium text-slate-700">{rutConsulta}</span>
                </p>
              )}
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
            <p className="mt-1 text-sm text-slate-500">
              Aparece en facturas PDF y cotizaciones. PNG, JPG o WebP · máx. 2,5 MB.
            </p>

            {logoPreview ? (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoPreview}
                  alt="Logo de la empresa"
                  className="h-16 max-w-[200px] rounded-lg border border-slate-200 bg-white object-contain p-2"
                />
                <button
                  type="button"
                  onClick={onDeleteLogo}
                  disabled={logoBusy}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  Quitar logo
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Aún no hay logo cargado.</p>
            )}

            <label className="mt-4 block text-sm">
              <span className="font-medium text-slate-700">
                {form.has_logo ? "Reemplazar logo" : "Seleccionar logo"}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/*"
                className="mt-1.5 block w-full text-sm"
                disabled={logoBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  onLogoFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            {logoBusy ? <p className="mt-2 text-sm text-slate-500">Subiendo…</p> : null}
            {logoMsg ? (
              <p
                className={`mt-2 text-sm ${logoMsg.includes("No se") || logoMsg.includes("supera") || logoMsg.includes("Formato") ? "text-red-600" : "text-emerald-700"}`}
              >
                {logoMsg}
              </p>
            ) : null}

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.usar_logo}
                onChange={(e) => set("usar_logo", e.target.checked)}
                disabled={!form.has_logo && !logoPreview}
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
