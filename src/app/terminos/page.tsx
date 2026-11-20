import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Términos y Condiciones" };

export default function TerminosPage() {
  return (
    <LegalPage titulo="Términos y Condiciones del Servicio">
      <h2>1. El servicio</h2>
      <p>
        GDT DevSur SpA (&quot;GDT&quot;) ofrece un software en línea para emitir, enviar y administrar documentos tributarios electrónicos ante el
        Servicio de Impuestos Internos (SII), cotizaciones y reportes asociados (&quot;el Servicio&quot;). Al crear una cuenta, la empresa que se
        registra (&quot;el Cliente&quot;) acepta estos términos.
      </p>
      <h2>2. Cuenta y uso</h2>
      <ul>
        <li>El Cliente declara que los datos de registro son verdaderos y que quien se registra está autorizado para representarlo.</li>
        <li>El Cliente es responsable de las credenciales de sus usuarios y de toda actividad realizada con ellas.</li>
        <li>El Servicio no puede usarse para emitir documentos falsos, simulados o que infrinjan la normativa tributaria.</li>
      </ul>
      <h2>3. Responsabilidad tributaria</h2>
      <p>
        El Cliente es el emisor de sus documentos y el único responsable de su contenido, de los montos, de los impuestos declarados y de cumplir
        sus obligaciones ante el SII, incluida la conservación de su documentación por los plazos legales. GDT provee la herramienta técnica y no
        presta asesoría contable ni tributaria.
      </p>
      <h2>4. Certificado digital y folios</h2>
      <p>
        Para firmar documentos el Cliente sube su certificado digital y los folios (CAF) que le autoriza el SII. GDT guarda la clave del
        certificado cifrada y lo usa solo para firmar y transmitir los documentos que el Cliente ordena emitir. El Cliente puede eliminar su
        certificado en cualquier momento desde el Servicio.
      </p>
      <h2>5. Planes, pagos y suspensión</h2>
      <ul>
        <li>Los planes, sus límites y precios se informan en el Servicio y pueden cambiar con aviso previo de 30 días.</li>
        <li>Los planes pagados se cobran por adelantado en forma periódica. Si un pago no se realiza, GDT puede limitar o suspender la cuenta.</li>
        <li>Durante una suspensión el Cliente conserva acceso para consultar y descargar sus documentos.</li>
      </ul>
      <h2>6. Disponibilidad</h2>
      <p>
        GDT procura que el Servicio esté disponible de forma continua y realiza respaldos diarios, pero no garantiza un funcionamiento
        ininterrumpido. El Servicio depende también de la disponibilidad de los sistemas del SII, que GDT no controla.
      </p>
      <h2>7. Datos del Cliente</h2>
      <p>
        Los documentos y datos que el Cliente ingresa le pertenecen. GDT los trata según la{" "}
        <Link href="/privacidad" className="font-semibold text-brand-600 hover:underline">Política de Privacidad</Link> y el{" "}
        <Link href="/encargo" className="font-semibold text-brand-600 hover:underline">Acuerdo de Encargo de Tratamiento</Link>. Al terminar
        el contrato, el Cliente puede descargar sus documentos durante 90 días; después GDT puede eliminarlos, salvo que la ley exija
        conservarlos.
      </p>
      <h2>8. Limitación de responsabilidad</h2>
      <p>
        En lo que la ley permita, la responsabilidad total de GDT frente al Cliente se limita al monto pagado por el Servicio en los 12 meses
        anteriores al hecho que la origina. GDT no responde por multas o perjuicios derivados del contenido de los documentos emitidos por el
        Cliente ni de caídas de los sistemas del SII.
      </p>
      <h2>9. Término</h2>
      <p>El Cliente puede terminar el Servicio en cualquier momento. GDT puede terminarlo ante un incumplimiento grave de estos términos.</p>
      <h2>10. Cambios y ley aplicable</h2>
      <p>
        GDT puede actualizar estos términos y avisará por correo los cambios relevantes con 30 días de anticipación. Estos términos se rigen por
        las leyes de Chile.
      </p>
    </LegalPage>
  );
}
