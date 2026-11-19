export type Ambiente = "certificacion" | "produccion";

export type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  tenant_id: number;
  organization_id: number | null;
  cartera_completa: boolean;
};

export type GiroSii = {
  codigo: string;
  glosa: string;
  rubro?: string;
  categoria?: string;
  fecha_inicio?: string;
  principal?: boolean;
};

export type Tenant = {
  id: number;
  rut: string;
  dv: string;
  razon_social: string;
  rut_formateado: string;
  ambiente: Ambiente;
  plan: string;
  max_dte_mes: number;
  features: string[];
  email?: string;
  telefono?: string;
  direccion?: string;
  comuna?: string;
  ciudad?: string;
  giro?: string;
  acteco?: string;
  nombre_fantasia?: string;
  unidad_sii?: string;
  usar_logo?: boolean;
  formato_impresion?: string | null;
  volumen_estimado?: string | null;
  giros?: GiroSii[];
  documentos_emitir?: number[];
};

export type AuthState = {
  user: User;
  token: string;
  tenantId: number | null;
  tenant: Tenant | null;
  scope: string;
  organizacion: null;
  empresas: Tenant[];
  is_platform?: boolean;
  features?: string[];
};

export type DteItem = {
  id: number;
  tipo_dte: number;
  tipo_nombre: string;
  folio: number;
  fecha_emision: string;
  receptor_rut: string;
  receptor_razon_social: string;
  monto_total: number;
  /** Desglose guardado al emitir; ausente en DTE antiguos (se estima en lib/contable). */
  monto_neto?: number;
  monto_exento?: number;
  monto_iva?: number;
  estado: string;
  ambiente: Ambiente;
};

/** Factura de compra en el registro del SII (módulo Recibidos). */
export type RecibidoEstado = "aceptada" | "reclamable" | "reclamada";
/** RCD: reclamo al contenido · RFP: falta parcial de mercaderías · RFT: falta total. */
export type MotivoReclamo = "RCD" | "RFP" | "RFT";

export type RecibidoItem = {
  id: number;
  tipo_dte: number;
  tipo_nombre: string;
  folio: number;
  fecha_emision: string;
  emisor_rut: string;
  emisor_razon_social: string;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  estado: RecibidoEstado;
  /** Recepción en el SII (YYYY-MM-DD); desde acá corren los 8 días de reclamo. */
  fecha_recepcion?: string | null;
  motivo_reclamo?: MotivoReclamo;
  /** YYYY-MM del periodo RCV */
  periodo: string;
};

/** Cotización comercial (no es DTE del SII). */
export type CotizacionItem = {
  nombre: string;
  cantidad: number;
  precio: number;
  exento?: boolean;
};

export type Cotizacion = {
  id: number;
  folio: number;
  numero: string; // COT-0001
  fecha: string;
  validez_dias: number;
  estado: "borrador" | "guardada" | "enviada" | "aceptada" | "rechazada" | "anulada";
  receptor_rut: string;
  receptor_razon_social: string;
  receptor_giro?: string;
  receptor_direccion?: string;
  receptor_comuna?: string;
  receptor_email?: string;
  items: CotizacionItem[];
  neto: number;
  exento: number;
  iva: number;
  total: number;
  notas?: string;
  archivo_path?: string | null;
  created_at: string;
  updated_at: string;
};

export type GiroCliente = {
  codigo: string;
  glosa: string;
};

export type Cliente = {
  id: number;
  rut: string;
  dv: string;
  rut_formateado: string;
  razon_social: string;
  giro: string;
  /** Giros seleccionados desde la consulta STC del SII */
  giros?: GiroCliente[];
  /** Casilla de intercambio DTE */
  email: string;
  /** Correos en copia del PDF */
  email_cc?: string;
  direccion: string;
  comuna: string;
  ciudad: string;
  telefono?: string;
  contacto?: string;
};

export type Producto = {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  precio: number;
  unidad: string;
  exento: boolean;
};

export type ApiKey = {
  id: number;
  name: string;
  /** sha256 de la clave; la clave en claro solo se devuelve al crearla. */
  key_hash?: string;
  /** "sk_test_ab12…9f3c" para reconocerla en la lista. */
  key_hint?: string;
  /** Claves antiguas guardadas en claro: se invalidan al listar. */
  key?: string;
  ambiente: string;
  permissions: string[];
  permisos_sin_lista: boolean;
  activo: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
};
