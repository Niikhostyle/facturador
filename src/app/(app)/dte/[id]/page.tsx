"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, Eye, Printer } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api, getAuth } from "@/lib/api";
import { formatCLP } from "@/lib/utils";
import { formatRutPuntos } from "@/lib/sii/rut";

type Dte = {
  id: number;
  tipo_dte: number;
  tipo_nombre: string;
  folio: number;
  fecha_emision: string;
  receptor_rut: string;
  receptor_razon_social: string;
  monto_total: number;
  estado: string;
  ambiente: string;
};

export default function DteDetallePage() {
  const params = useParams();
  const id = String(params.id || "");
  const [dte, setDte] = useState<Dte | null>(null);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const meta = await api<{ data: Dte; xml_path: string | null }>(`/dte/${id}`);
        setDte(meta.data);
        const auth = getAuth();
        const res = await fetch(`/api/v1/dte/${id}/documento?format=html`, {
          headers: {
            Accept: "text/html",
            ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
            ...(auth?.tenantId ? { "X-Tenant-Id": String(auth.tenantId) } : {}),
          },
        });
        if (!res.ok) throw new Error("No se pudo cargar el documento");
        setHtml(await res.text());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
  }, [id]);

  async function descargarPdf() {
    if (!dte) return;
    setLoadingPdf(true);
    try {
      const auth = getAuth();
      const res = await fetch(`/api/v1/dte/${dte.id}/documento?format=pdf`, {
        headers: {
          Accept: "application/pdf",
          ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
          ...(auth?.tenantId ? { "X-Tenant-Id": String(auth.tenantId) } : {}),
        },
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DTE_T${dte.tipo_dte}_F${dte.folio}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo descargar el PDF");
    } finally {
      setLoadingPdf(false);
    }
  }

  function imprimir() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  if (error && !dte) {
    return (
      <AppShell title="Documento">
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        <Link href="/dte" className="mt-3 inline-block text-sm text-brand-700">
          ← Volver
        </Link>
      </AppShell>
    );
  }

  if (!dte) {
    return (
      <AppShell title="Documento">
        <p className="text-sm text-slate-500">Cargando…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title={`${dte.tipo_nombre} #${dte.folio}`} subtitle={`${dte.receptor_razon_social} · ${dte.fecha_emision}`}>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/dte" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          ← Volver
        </Link>
        <button
          type="button"
          onClick={imprimir}
          disabled={!html}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
        >
          <Printer className="h-4 w-4" />
          Imprimir
        </button>
        <button
          type="button"
          onClick={descargarPdf}
          disabled={loadingPdf}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {loadingPdf ? "Generando…" : "Descargar PDF"}
        </button>
      </div>

      <div className="card mb-4 grid gap-3 p-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Receptor</p>
          <p className="font-medium">{dte.receptor_razon_social}</p>
          <p className="text-slate-600">{formatRutPuntos(dte.receptor_rut)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Fecha</p>
          <p className="font-medium">{dte.fecha_emision}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Estado</p>
          <p className="font-medium capitalize">{dte.estado}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Total</p>
          <p className="font-display text-lg font-semibold">{formatCLP(dte.monto_total)}</p>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm text-slate-500">
          <Eye className="h-4 w-4" />
          Vista previa del documento
        </div>
        {html ? (
          <iframe title="Documento DTE" srcDoc={html} className="h-[80vh] w-full bg-white" />
        ) : (
          <div className="grid place-items-center py-16 text-sm text-slate-500">Cargando documento…</div>
        )}
      </section>
    </AppShell>
  );
}
