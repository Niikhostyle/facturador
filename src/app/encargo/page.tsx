import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Acuerdo de Encargo de Tratamiento" };

export default function EncargoPage() {
  return (
    <LegalPage titulo="Acuerdo de Encargo de Tratamiento de Datos">
      <p>
        Al emitir documentos, el Cliente ingresa al Servicio datos personales de sus propios clientes, proveedores y contactos. Respecto de esos
        datos el Cliente es el responsable y GDT DevSur SpA actúa como encargado del tratamiento, en los términos de la Ley N° 21.719.
      </p>
      <h2>1. Objeto</h2>
      <p>GDT trata esos datos solo para prestar el Servicio: generar, firmar, transmitir al SII, enviar y almacenar los documentos del Cliente.</p>
      <h2>2. Obligaciones de GDT</h2>
      <ul>
        <li>Tratar los datos únicamente según las instrucciones del Cliente expresadas a través del uso del Servicio.</li>
        <li>Mantener la confidencialidad y exigirla a las personas que acceden a ellos.</li>
        <li>Aplicar las medidas de seguridad descritas en la Política de Privacidad.</li>
        <li>Recurrir solo a subencargados necesarios para el Servicio (alojamiento, correo, pagos) con obligaciones equivalentes.</li>
        <li>Avisar al Cliente sin demora indebida si detecta una vulneración de seguridad que afecte sus datos.</li>
        <li>Ayudar al Cliente a responder solicitudes de los titulares en lo que el Servicio permita.</li>
      </ul>
      <h2>3. Obligaciones del Cliente</h2>
      <ul>
        <li>Contar con una base de licitud para tratar los datos que ingresa (por ejemplo, la emisión de documentos tributarios exigida por ley).</li>
        <li>Ingresar solo los datos necesarios para sus documentos.</li>
      </ul>
      <h2>4. Término</h2>
      <p>
        Al terminar el Servicio, el Cliente puede descargar sus documentos durante 90 días. Después GDT elimina los datos, salvo que la ley
        exija conservarlos.
      </p>
    </LegalPage>
  );
}
