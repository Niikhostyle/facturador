import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Política de Privacidad" };

export default function PrivacidadPage() {
  return (
    <LegalPage titulo="Política de Privacidad">
      <p>
        Esta política explica qué datos personales trata GDT DevSur SpA al prestar el Servicio, para qué y cuáles son tus derechos, conforme a
        la Ley N° 19.628 sobre protección de la vida privada y a la Ley N° 21.719 de protección de datos personales.
      </p>
      <h2>1. Datos que tratamos</h2>
      <ul>
        <li>De los usuarios: nombre, correo, contraseña (guardada solo como huella cifrada) y registros de uso.</li>
        <li>De la empresa cliente: RUT, razón social, giro, dirección, contacto, certificado digital y folios del SII.</li>
        <li>
          De los clientes y proveedores del Cliente que aparecen en sus documentos (RUT, razón social, dirección, correo). Estos datos los
          tratamos por encargo del Cliente; ver el Acuerdo de Encargo de Tratamiento.
        </li>
      </ul>
      <h2>2. Para qué los usamos</h2>
      <ul>
        <li>Prestar el Servicio: emitir, firmar, transmitir al SII y enviar por correo los documentos.</li>
        <li>Administrar la cuenta, cobrar los planes y enviar avisos operativos (folios, certificado, recuperación de contraseña).</li>
        <li>Mantener la seguridad, prevenir fraudes y cumplir obligaciones legales.</li>
      </ul>
      <p>No vendemos ni arrendamos datos personales, ni los usamos para publicidad de terceros.</p>
      <h2>3. Con quién los compartimos</h2>
      <ul>
        <li>Con el SII, al transmitir los documentos que el Cliente emite.</li>
        <li>Con proveedores que nos prestan servicios necesarios (alojamiento del servidor, correo y procesador de pagos), bajo obligaciones de confidencialidad.</li>
        <li>Con autoridades, cuando la ley lo exija.</li>
      </ul>
      <h2>4. Seguridad</h2>
      <p>
        Usamos conexión cifrada (HTTPS), contraseñas con huella criptográfica, la clave del certificado digital cifrada, separación de datos por
        empresa y respaldos diarios con acceso restringido.
      </p>
      <h2>5. Cuánto tiempo los guardamos</h2>
      <p>
        Mientras la cuenta esté activa y hasta 90 días después de su término, salvo que la ley exija conservarlos por más tiempo. Los respaldos se
        eliminan automáticamente a los 14 días.
      </p>
      <h2>6. Tus derechos</h2>
      <p>
        Puedes pedir acceso, rectificación, supresión, oposición, portabilidad y bloqueo de tus datos personales. Responderemos dentro de los
        plazos legales. Si no quedas conforme, puedes recurrir a la autoridad de protección de datos que corresponda.
      </p>
      <h2>7. Almacenamiento en tu navegador</h2>
      <p>
        Guardamos en tu navegador la sesión iniciada y algunas preferencias de la interfaz. No usamos cookies de publicidad ni de seguimiento de
        terceros.
      </p>
    </LegalPage>
  );
}
