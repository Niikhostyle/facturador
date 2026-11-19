"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, ShieldAlert, ShieldCheck, ShieldX, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { btnDanger, btnPrimary, btnSecondary, card, dialogCls, input } from "@/lib/ui";

type Cert = {
  tiene_certificado: boolean;
  data: {
    vigente: boolean;
    sujeto: string;
    emisor: string;
    vence_el: string;
    dias_restantes: number;
    rut_titular?: string;
  } | null;
};

const ERR = "rounded-[var(--radius-md)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]";
const OK = "rounded-[var(--radius-md)] bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]";
const MAX_BYTES = 1_000_000;
const AVISO_DIAS = 30;

const fechaCl = (iso: string) => iso.split("-").reverse().join("-");

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
}

export default function CertificadoPage() {
  const [data, setData] = useState<Cert | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loadError, setLoadError] = useState("");
  const [dialogo, setDialogo] = useState<"reemplazar" | "eliminar" | null>(null);
  const dlgRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoadError("");
    try {
      setData(await api<Cert>("/certificado/estado"));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No pudimos cargar el certificado.");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError("");
    setOk("");
    if (f && !/\.(p12|pfx)$/i.test(f.name)) {
      setError("El archivo debe terminar en .p12 o .pfx.");
      e.target.value = "";
      return setArchivo(null);
    }
    if (f && f.size > MAX_BYTES) {
      setError("El archivo pesa más de 1 MB; un certificado .p12/.pfx suele pesar menos de 20 KB.");
      e.target.value = "";
      return setArchivo(null);
    }
    setArchivo(f);
  }

  function abrir(d: "reemplazar" | "eliminar") {
    setDialogo(d);
    dlgRef.current?.showModal();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo || !password) return;
    if (tiene) abrir("reemplazar");
    else void subir();
  }

  async function subir() {
    if (!archivo) return;
    setGuardando(true);
    setError("");
    setOk("");
    try {
      const p12_base64 = await fileToBase64(archivo);
      const r = await api<{ data: Cert }>("/certificado/upload", {
        method: "POST",
        body: JSON.stringify({ p12_base64, password }),
      });
      const d = r.data.data;
      setOk(`Certificado guardado: ${d?.sujeto ?? ""}${d?.rut_titular ? ` (${d.rut_titular})` : ""}. Ya puedes firmar.`);
      setPassword("");
      setArchivo(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el certificado.");
    } finally {
      setGuardando(false);
      dlgRef.current?.close();
    }
  }

  async function eliminar() {
    setGuardando(true);
    setError("");
    setOk("");
    try {
      await api("/certificado/eliminar", { method: "POST", body: JSON.stringify({}) });
      setOk("Certificado eliminado. Sube otro para volver a emitir.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el certificado.");
    } finally {
      setGuardando(false);
      dlgRef.current?.close();
    }
  }

  const c = data?.tiene_certificado ? data.data : null;
  const tiene = Boolean(c);
  const porVencer = c?.vigente && c.dias_restantes <= AVISO_DIAS;
  const estado = !c
    ? null
    : !c.vigente
      ? { Icon: ShieldX, txt: "Vencido", cls: "bg-[var(--danger-soft)] text-[var(--danger)]" }
      : porVencer
        ? { Icon: ShieldAlert, txt: `Vence en ${c.dias_restantes} ${c.dias_restantes === 1 ? "día" : "días"}`, cls: "bg-[var(--warn-soft)] text-[var(--warn)]" }
        : { Icon: ShieldCheck, txt: `Vigente · ${c.dias_restantes} días`, cls: "bg-[var(--ok-soft)] text-[var(--ok)]" };

  return (
    <AppShell title="Certificado digital" subtitle="Tu firma electrónica para emitir ante el SII">
      {loadError && (
        <p role="alert" className={cn("mb-3 flex flex-wrap items-center justify-between gap-2", ERR)}>
          {loadError}
          <button type="button" onClick={() => void load()} className="font-semibold underline underline-offset-2">Reintentar</button>
        </p>
      )}
      <div role="status" aria-live="polite">
        {ok && <p className={cn("mb-3", OK)}>{ok}</p>}
      </div>

      <section className={cn(card, "p-5")} aria-labelledby="cert-actual">
        <h2 id="cert-actual" className="font-display text-base font-semibold">Certificado actual</h2>
        {!data && !loadError ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-[var(--ink-muted)]" role="status">
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Cargando certificado…
          </p>
        ) : c && estado ? (
          <>
            <p className={cn("mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", estado.cls)}>
              <estado.Icon aria-hidden className="h-4 w-4" />
              {estado.txt}
            </p>
            {(porVencer || !c.vigente) && (
              <p className="mt-3 max-w-prose text-sm text-[var(--ink-muted)]">
                {c.vigente ? "Renuévalo antes del vencimiento" : "Con un certificado vencido no puedes firmar ni emitir"}: pide uno nuevo a tu entidad certificadora y súbelo aquí.
              </p>
            )}
            <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-medium text-[var(--ink-muted)]">Titular</dt><dd>{c.sujeto}</dd></div>
              {c.rut_titular && <div><dt className="text-xs font-medium text-[var(--ink-muted)]">RUT titular</dt><dd className="tabular-nums">{c.rut_titular}</dd></div>}
              <div><dt className="text-xs font-medium text-[var(--ink-muted)]">Entidad certificadora</dt><dd>{c.emisor}</dd></div>
              <div><dt className="text-xs font-medium text-[var(--ink-muted)]">Vence el</dt><dd className="tabular-nums">{fechaCl(c.vence_el)}</dd></div>
            </dl>
          </>
        ) : data ? (
          <p className="mt-2 max-w-prose text-sm text-[var(--ink-muted)]">
            Aún no hay certificado. Sin él no puedes firmar documentos ni conectarte al SII.
          </p>
        ) : null}
      </section>

      <form onSubmit={onSubmit} className={cn(card, "mt-4 p-5")} aria-labelledby="cert-subir">
        <h2 id="cert-subir" className="font-display text-base font-semibold">{tiene ? "Reemplazar certificado" : "Subir certificado"}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">1. Archivo .p12 o .pfx</span>
            <input
              ref={fileRef}
              type="file"
              accept=".p12,.pfx,application/x-pkcs12"
              onChange={onArchivo}
              aria-describedby="cert-archivo-ayuda"
              className="block w-full text-sm text-[var(--ink-muted)] file:mr-3 file:h-10 file:cursor-pointer file:rounded-[var(--radius-md)] file:border file:border-[var(--line-strong)] file:bg-[var(--surface)] file:px-4 file:text-[13.5px] file:font-semibold file:text-[var(--ink)] hover:file:bg-[var(--surface-sunken)]"
            />
            <span id="cert-archivo-ayuda" className="mt-1 block text-xs text-[var(--ink-muted)]">
              {archivo ? `${archivo.name} · ${(archivo.size / 1024).toFixed(1)} KB` : "Debe incluir la llave privada."}
            </span>
          </label>
          <div className="text-sm">
            <label htmlFor="cert-clave" className="mb-1 block font-medium">2. Clave del certificado</label>
            <div className="relative">
              <input
                id="cert-clave"
                type={verClave ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn(input, "pr-11")}
                autoComplete="new-password"
                aria-describedby="cert-clave-ayuda"
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                aria-label={verClave ? "Ocultar clave" : "Mostrar clave"}
                aria-pressed={verClave}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-[var(--radius-md)] text-[var(--ink-muted)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fiscal-raise)]"
              >
                {verClave ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
              </button>
            </div>
            <span id="cert-clave-ayuda" className="mt-1 block text-xs text-[var(--ink-muted)]">
              La que definiste al exportar el archivo. Se guarda cifrada y solo se usa para firmar tus documentos.
            </span>
          </div>
        </div>

        {error && <p role="alert" className={cn("mt-4", ERR)}>{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={!archivo || !password || guardando} className={btnPrimary}>
            {guardando && !dialogo ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Upload aria-hidden className="h-4 w-4" />}
            {guardando && !dialogo ? "Validando…" : "3. Validar y guardar"}
          </button>
          {tiene && (
            <button type="button" onClick={() => abrir("eliminar")} disabled={guardando} className={btnSecondary}>
              <Trash2 aria-hidden className="h-4 w-4 text-[var(--ink-muted)]" />
              Eliminar certificado
            </button>
          )}
        </div>

        <details className="mt-5 border-t border-[var(--line)] pt-4 text-sm">
          <summary className="cursor-pointer font-medium text-[var(--ink)]">¿Qué es el certificado digital y dónde lo consigo?</summary>
          <ul className="mt-2 max-w-prose list-disc space-y-1 pl-5 text-[var(--ink-muted)]">
            <li>Es tu firma electrónica: con ella se firman los DTE y se autentica la conexión con el SII.</li>
            <li>Se compra a una entidad certificadora autorizada (E-CertChile, Acepta, Camerfirma, entre otras) y dura 1 a 3 años.</li>
            <li>Debe estar a nombre de una persona autorizada ante el SII para firmar por la empresa.</li>
            <li>Si lo tienes instalado en el navegador o en Windows, expórtalo como .pfx <strong>incluyendo la llave privada</strong> y define una clave.</li>
          </ul>
        </details>
      </form>

      <dialog ref={dlgRef} aria-labelledby="dlg-cert" className={dialogCls} onClose={() => setDialogo(null)}>
        {dialogo && (
          <div className="space-y-4 p-6">
            <h2 id="dlg-cert" className="font-display text-lg font-semibold">
              {dialogo === "eliminar" ? "¿Eliminar el certificado?" : "¿Reemplazar el certificado actual?"}
            </h2>
            <p className="text-sm">
              {dialogo === "eliminar"
                ? "No podrás firmar ni emitir documentos hasta que subas otro."
                : `El certificado de ${c?.sujeto ?? "—"} se reemplaza por ${archivo?.name ?? "el nuevo"}. Desde ahora todos los documentos se firman con el nuevo.`}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={btnSecondary} onClick={() => dlgRef.current?.close()}>Cancelar</button>
              <button
                type="button"
                disabled={guardando}
                className={dialogo === "eliminar" ? btnDanger : btnPrimary}
                onClick={() => void (dialogo === "eliminar" ? eliminar() : subir())}
              >
                {guardando && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                {dialogo === "eliminar" ? "Sí, eliminar" : "Sí, reemplazar"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </AppShell>
  );
}
