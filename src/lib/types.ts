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
  tenantId: number;
  tenant: Tenant;
  scope: string;
  organizacion: null;
  empresas: Tenant[];
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
  estado: string;
  ambiente: Ambiente;
};

export type Cliente = {
  id: number;
  rut: string;
  dv: string;
  rut_formateado: string;
  razon_social: string;
  giro: string;
  email: string;
  direccion: string;
  comuna: string;
  ciudad: string;
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
  key: string;
  ambiente: string;
  permissions: string[];
  permisos_sin_lista: boolean;
  activo: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
};
