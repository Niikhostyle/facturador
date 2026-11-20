"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Send, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api, getAuth } from "@/lib/api";
import { btnPrimary, btnSecondary, card, input } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Operacion = "VENTA" | "COMPRA" | "GUIAS";
type ResultadoLibro = {
  documentos: number;
  ambiente: string;
  archivo: string;
  envio: { ok: boolean; track_id: string | null; glosa: string | null } | null;
};
type ResultadoIntercambio = {
  dtes: { tipo: number; folio: number; mntTotal: number; rutRecep: string }[];
  emisor: string;
  acuse: string;
  recibos: string | null;
  resultado: string;
};

const PASOS = [
  { t: "Set de pruebas", d: "Emite los casos que te entrega el SII con referencia tipo «SET» y el número de caso en el folio de referencia.", href: "/dte/nuevo" },
  { t: "Simulación", d: "Emite documentos como los de tu operación real (facturas, notas, guías) en maullín.", href: "/dte/nuevo" },
  { t: "Intercambio", d: "Sube el EnvioDTE que te envía el SII y descarga el acuse, los recibos y el resultado para subirlos a su sitio.", href: "#intercambio" },
  { t: "Muestras impresas", d: "Descarga el PDF de cada documento del set: incluye la copia CEDIBLE de las facturas.", href: "/dte" },
  { t: "Libros", d: "Genera y envía los libros de ventas, compras y guías del período del set.", href: "#libros" },
  { t: "Declaración", d: "Con todo aprobado, declara el cumplimiento en el sitio del SII y pasa a producción.", href: "/dashboard" },
];

const ERR = "rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]";
const OK = "rounded-[var(--radius-md)] bg-emerald-50 px-3 py-2 text-sm text-emerald-800";
const LABEL = "mb-1 block text-xs font-medium text-[var(--ink-muted)]";

/** El XML del SII va en ISO-8859-1: cada carácter es un byte. */
function descargarXml(nombre: string, xml: string) {
  const bytes = Uint8Array.from(xml, (c) => c.charCodeAt(0) & 0xff);
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([bytes], { type: "application/xml" })),
    download: nombre,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Compras del set: tipo;folio;fecha;rut;razón social;exento;neto;iva;total[;iva uso común][;cód. IVA no rec.;monto IVA no rec.] */
function parseCompras(txt: string) {
  return txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const c = l.split(";").map((x) => x.trim());
      if (c.length < 9) throw new Error(`Línea ${i + 1}: faltan columnas (mínimo 9).`);
      const num = (v: string) => Number(v.replace(/\./g, "") || 0);
      return {
        tpoDoc: num(c[0]),
        nroDoc: num(c[1]),
        fchDoc: c[2],
        rutDoc: c[3],
        rznSoc: c[4],
        mntExe: num(c[5]),
        mntNeto: num(c[6]),
        mntIva: num(c[7]),
        mntTotal: num(c[8]),
        ...(c[9] ? { ivaUsoComun: num(c[9]) } : {}),
        ...(c[10] && c[11] ? { ivaNoRec: { cod: num(c[10]), monto: num(c[11]) } } : {}),
      };
    });
}

/** Ajustes de guías: folio;anulada (1 folio anulado · 2 guía anulada · vacío);tipo ref;folio ref;fecha ref */
function parseAjustes(txt: string) {
  const out: Record<string, { anulado?: 1 | 2; ref?: { tipo: number; folio: number; fecha: string } }> = {};
  for (const l of txt.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
    const [folio, anulado, tipo, folioRef, fecha] = l.split(";").map((x) => x.trim());
    out[folio] = {
      ...(anulado === "1" || anulado === "2" ? { anulado: Number(anulado) as 1 | 2 } : {}),
      ...(tipo && folioRef && fecha ? { ref: { tipo: Number(tipo), folio: Number(folioRef), fecha } } : {}),
    };
  }
  return out;
}

export default function CertificacionPage() {
  const [op, setOp] = useState<Operacion>("VENTA");
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [tipoLibro, setTipoLibro] = useState<"ESPECIAL" | "MENSUAL">("ESPECIAL");
  const [folioNotif, setFolioNotif] = useState("");
  const [compras, setCompras] = useState("");
  const [factor, setFactor] = useState("");
  const [ajustes, setAjustes] = useState("");
  const [libroBusy, setLibroBusy] = useState(false);
  const [libroRes, setLibroRes] = useState<ResultadoLibro | null>(null);
  const [libroErr, setLibroErr] = useState("");

  const [archivo, setArchivo] = useState<{ nombre: string; xml: string } | null>(null);
  const [decision, setDecision] = useState<"aceptar" | "rechazar">("aceptar");
  const [recinto, setRecinto] = useState("");
  const [glosa, setGlosa] = useState("");
  const [icBusy, setIcBusy] = useState(false);
  const [icRes, setIcRes] = useState<ResultadoIntercambio | null>(null);
  const [icErr, setIcErr] = useState("");

  async function libro(enviar: boolean) {
    setLibroBusy(true);
    setLibroErr("");
    setLibroRes(null);
    try {
      const body = {
        operacion: op,
        periodo,
        tipo_libro: tipoLibro,
        folio_notificacion: folioNotif ? Number(folioNotif) : undefined,
        enviar,
        ...(op === "COMPRA" && compras.trim() ? { lineas: parseCompras(compras) } : {}),
        ...(op === "COMPRA" && factor ? { factor_proporcionalidad: Number(factor.replace(",", ".")) } : {}),
        ...(op === "GUIAS" && ajustes.trim() ? { ajustes_guias: parseAjustes(ajustes) } : {}),
      };
      const r = await api<ResultadoLibro>("/certificacion/libro", { method: "POST", body: JSON.stringify(body) });
      setLibroRes(r);
      if (!enviar) await bajarLibro();
    } catch (e) {
      setLibroErr(e instanceof Error ? e.message : "No se pudo generar el libro.");
    } finally {
      setLibroBusy(false);
    }
  }

  async function bajarLibro() {
    const auth = getAuth();
    const res = await fetch(`/api/v1/certificacion/libro?operacion=${op}&periodo=${periodo}`, {
      headers: {
        ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        ...(auth?.tenantId ? { "X-Tenant-Id": String(auth.tenantId) } : {}),
      },
    });
    if (!res.ok) throw new Error("No se pudo descargar el XML.");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(await res.blob()),
      download: `Libro_${op}_${periodo}.xml`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onArchivo(f: File | null) {
    setIcRes(null);
    setIcErr("");
    if (!f) return setArchivo(null);
    // latin1: el EnvioDTE del SII viene en ISO-8859-1.
    const buf = new Uint8Array(await f.arrayBuffer());
    setArchivo({ nombre: f.name, xml: Array.from(buf, (b) => String.fromCharCode(b)).join("") });
  }

  async function intercambio() {
    if (!archivo) return;
    setIcBusy(true);
    setIcErr("");
    setIcRes(null);
    try {
      const r = await api<ResultadoIntercambio>("/certificacion/intercambio", {
        method: "POST",
        body: JSON.stringify({ xml: archivo.xml, nombre_archivo: archivo.nombre, decision, recinto: recinto || undefined, glosa: glosa || undefined }),
      });
      setIcRes(r);
    } catch (e) {
      setIcErr(e instanceof Error ? e.message : "No se pudo procesar el archivo.");
    } finally {
      setIcBusy(false);
    }
  }

  return (
    <AppShell title="Certificación SII" subtitle="Pasos para quedar autorizado como emisor electrónico">
      <div className="space-y-4">
        <section className={cn(card, "p-5")} aria-labelledby="pasos">
          <h2 id="pasos" className="font-display text-base font-semibold text-ink-900">
            Etapas de la certificación
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Se hacen en ambiente de certificación (maullín), con CAF de prueba. El SII revisa cada etapa en su sitio.
          </p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PASOS.map((p, i) => (
              <li key={p.t} className="rounded-[var(--radius-md)] border border-[var(--line)] p-3">
                <p className="text-sm font-semibold text-ink-900">
                  {i + 1}. {p.t}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{p.d}</p>
                <Link href={p.href} className="mt-2 inline-block text-xs font-semibold text-[var(--pulso)] hover:underline">
                  Ir
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section id="libros" className={cn(card, "space-y-4 p-5")} aria-labelledby="libros-t">
          <div>
            <h2 id="libros-t" className="font-display text-base font-semibold text-ink-900">
              Libros electrónicos
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Ventas y guías se arman con los documentos emitidos en el período. Compras usa tus recibidos o las líneas que pegues.
            </p>
          </div>

          <div role="tablist" aria-label="Libro" className="flex flex-wrap gap-2">
            {(
              [
                ["VENTA", "Ventas"],
                ["COMPRA", "Compras"],
                ["GUIAS", "Guías de despacho"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={op === k}
                onClick={() => {
                  setOp(k);
                  setLibroRes(null);
                  setLibroErr("");
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  op === k ? "border-[var(--fiscal)] bg-[var(--fiscal-soft)] font-semibold text-[var(--fiscal)]" : "border-[var(--line)] text-[var(--ink)]",
                )}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className={LABEL}>Período</span>
              <input type="month" className={input} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className={LABEL}>Tipo de libro</span>
              <select className={input} value={tipoLibro} onChange={(e) => setTipoLibro(e.target.value as "ESPECIAL" | "MENSUAL")}>
                <option value="ESPECIAL">Especial (certificación)</option>
                <option value="MENSUAL">Mensual</option>
              </select>
            </label>
            {tipoLibro === "ESPECIAL" ? (
              <label className="text-sm">
                <span className={LABEL}>Folio de notificación (lo indica el SII)</span>
                <input inputMode="numeric" className={input} value={folioNotif} onChange={(e) => setFolioNotif(e.target.value.replace(/\D/g, ""))} />
              </label>
            ) : null}
          </div>

          {op === "COMPRA" ? (
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <label className="text-sm">
                <span className={LABEL}>Compras del set (opcional, una por línea)</span>
                <textarea
                  rows={5}
                  className={cn(input, "h-auto py-2 font-mono text-xs")}
                  placeholder={"33;234;2026-11-02;77888999-0;PROVEEDOR SPA;0;100000;19000;119000\n33;235;2026-11-03;77888999-0;PROVEEDOR SPA;0;20000;0;23800;3800"}
                  value={compras}
                  onChange={(e) => setCompras(e.target.value)}
                />
                <span className="mt-1 block text-xs text-[var(--ink-muted)]">
                  tipo;folio;fecha;rut;razón social;exento;neto;iva;total[;IVA uso común][;cód. IVA no recuperable;monto]
                </span>
              </label>
              <label className="text-sm">
                <span className={LABEL}>Factor de proporcionalidad (uso común)</span>
                <input inputMode="decimal" className={input} placeholder="0,60" value={factor} onChange={(e) => setFactor(e.target.value)} />
              </label>
            </div>
          ) : null}

          {op === "GUIAS" ? (
            <label className="block text-sm">
              <span className={LABEL}>Ajustes del set (opcional, una guía por línea)</span>
              <textarea
                rows={3}
                className={cn(input, "h-auto py-2 font-mono text-xs")}
                placeholder={"2;;33;15;2026-11-05\n3;2"}
                value={ajustes}
                onChange={(e) => setAjustes(e.target.value)}
              />
              <span className="mt-1 block text-xs text-[var(--ink-muted)]">
                folio;anulada (1 folio anulado · 2 guía anulada);tipo factura;folio factura;fecha factura
              </span>
            </label>
          ) : null}

          {libroErr ? (
            <p role="alert" className={ERR}>
              {libroErr}
            </p>
          ) : null}
          {libroRes ? (
            <p role="status" className={libroRes.envio && !libroRes.envio.ok ? ERR : OK}>
              {libroRes.documentos} documentos · {libroRes.archivo}
              {libroRes.envio
                ? libroRes.envio.ok
                  ? ` · Enviado al SII, track-id ${libroRes.envio.track_id}.`
                  : ` · El SII no lo aceptó: ${libroRes.envio.glosa ?? "sin detalle"}.`
                : " · XML descargado."}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={libroBusy} onClick={() => libro(false)}>
              <Download className="h-4 w-4" aria-hidden />
              Generar XML
            </button>
            <button type="button" className={btnPrimary} disabled={libroBusy} onClick={() => libro(true)}>
              <Send className="h-4 w-4" aria-hidden />
              {libroBusy ? "Procesando…" : "Generar y enviar al SII"}
            </button>
          </div>
        </section>

        <section id="intercambio" className={cn(card, "space-y-4 p-5")} aria-labelledby="ic-t">
          <div>
            <h2 id="ic-t" className="font-display text-base font-semibold text-ink-900">
              Intercambio
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Sube el EnvioDTE que te envió el SII. Te devolvemos el acuse de recibo, el recibo de mercaderías (Ley 19.983) y el resultado comercial, firmados.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className={LABEL}>EnvioDTE recibido (.xml)</span>
              <input type="file" accept=".xml,application/xml,text/xml" className="block text-sm" onChange={(e) => onArchivo(e.target.files?.[0] ?? null)} />
            </label>
            <label className="text-sm">
              <span className={LABEL}>Respuesta comercial</span>
              <select className={input} value={decision} onChange={(e) => setDecision(e.target.value as "aceptar" | "rechazar")}>
                <option value="aceptar">Aceptar</option>
                <option value="rechazar">Rechazar</option>
              </select>
            </label>
            {decision === "aceptar" ? (
              <label className="text-sm">
                <span className={LABEL}>Lugar de recepción (recinto)</span>
                <input className={input} placeholder="Oficina central" value={recinto} onChange={(e) => setRecinto(e.target.value)} />
              </label>
            ) : (
              <label className="text-sm">
                <span className={LABEL}>Motivo del rechazo</span>
                <input className={input} value={glosa} onChange={(e) => setGlosa(e.target.value)} />
              </label>
            )}
          </div>
          {icErr ? (
            <p role="alert" className={ERR}>
              {icErr}
            </p>
          ) : null}
          <button type="button" className={btnPrimary} disabled={!archivo || icBusy} onClick={intercambio}>
            <Upload className="h-4 w-4" aria-hidden />
            {icBusy ? "Procesando…" : "Generar respuestas"}
          </button>
          {icRes ? (
            <div role="status" className="space-y-3">
              <p className={OK}>
                {icRes.dtes.length} documento(s) del emisor {icRes.emisor}: {icRes.dtes.map((d) => `T${d.tipo} F${d.folio}`).join(", ")}.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnSecondary} onClick={() => descargarXml("RespuestaEnvio.xml", icRes.acuse)}>
                  <Download className="h-4 w-4" aria-hidden /> Acuse de recibo
                </button>
                {icRes.recibos ? (
                  <button type="button" className={btnSecondary} onClick={() => descargarXml("EnvioRecibos.xml", icRes.recibos!)}>
                    <Download className="h-4 w-4" aria-hidden /> Recibo de mercaderías
                  </button>
                ) : null}
                <button type="button" className={btnSecondary} onClick={() => descargarXml("ResultadoDTE.xml", icRes.resultado)}>
                  <Download className="h-4 w-4" aria-hidden /> Resultado comercial
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
