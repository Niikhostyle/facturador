import type { ApiKey, Cliente, DteItem, Producto, Tenant, User } from "./types";

export const USER: User = {
  id: 50,
  name: "Nicolas Figueroa Fernandez",
  email: "nfigueroa@gdtdevsur.cl",
  role: "admin",
  tenant_id: 56,
  organization_id: null,
  cartera_completa: false,
};

/** Identidad mínima al registrar; el resto se completa desde Mi empresa. */
export const TENANT: Tenant = {
  id: 56,
  rut: "78533567",
  dv: "8",
  razon_social: "GRUPO DESARROLLO TECNOLOGICO DEVSUR SPA",
  rut_formateado: "78.533.567-8",
  ambiente: "certificacion",
  plan: "empresa",
  max_dte_mes: 0,
  features: ["dte", "recibidos", "programadas", "carga_masiva", "api", "contable"],
  email: "nfigueroa@gdtdevsur.cl",
  telefono: "",
  direccion: "",
  comuna: "",
  ciudad: "",
  giro: "",
  acteco: "",
  nombre_fantasia: "",
  unidad_sii: "",
  usar_logo: false,
  formato_impresion: null,
  volumen_estimado: null,
  giros: [],
  documentos_emitir: [],
};

export const TIPOS_DTE = [
  { codigo: 33, nombre: "Factura Electrónica" },
  { codigo: 34, nombre: "Factura No Afecta" },
  { codigo: 39, nombre: "Boleta Electrónica" },
  { codigo: 41, nombre: "Boleta No Afecta" },
  { codigo: 43, nombre: "Liquidación-Factura" },
  { codigo: 46, nombre: "Factura de Compra" },
  { codigo: 52, nombre: "Guía de Despacho" },
  { codigo: 56, nombre: "Nota de Débito" },
  { codigo: 61, nombre: "Nota de Crédito" },
] as const;

/** Catálogo de tipos visibles en CAF; todos parten en 0. */
export const CAF_TIPOS_BASE = [
  { tipo_dte: 33, tipo_nombre: "Factura Electrónica" },
  { tipo_dte: 34, tipo_nombre: "Factura No Afecta o Exenta Electrónica" },
  { tipo_dte: 39, tipo_nombre: "Boleta Electrónica" },
  { tipo_dte: 41, tipo_nombre: "Boleta Exenta Electrónica" },
  { tipo_dte: 46, tipo_nombre: "Factura de Compra Electrónica" },
  { tipo_dte: 52, tipo_nombre: "Guía de Despacho Electrónica" },
  { tipo_dte: 56, tipo_nombre: "Nota de Débito Electrónica" },
  { tipo_dte: 61, tipo_nombre: "Nota de Crédito Electrónica" },
] as const;

export const ONBOARDING_FASES = [
  { key: "datos_empresa", label: "Datos de la empresa", descripcion: "Razón social, RUT, giro, dirección, comuna y ciudad registrados." },
  { key: "certificado", label: "Certificado digital", descripcion: "Certificado .p12 cargado y vigente." },
  { key: "renuncia_portal_gratuito", label: "Salida del sistema gratuito de boletas del SII", descripcion: "El SII ya no lo registra en su sistema gratuito de boletas." },
  { key: "inscripcion_sii", label: "Inscripción ante el SII", descripcion: "El SII ya le registra documentos autorizados." },
  { key: "folios_certificacion", label: "Folios de certificación", descripcion: "CAF de certificación cargados para emitir pruebas." },
  { key: "prueba_certificacion", label: "Prueba en certificación", descripcion: "Emitir set de pruebas y declarar avance ante el SII." },
  { key: "produccion_habilitada", label: "Producción habilitada", descripcion: "Ambiente de producción listo." },
  { key: "folios_palena", label: "Folios de palena", descripcion: "CAF de producción disponibles." },
  { key: "emitiendo_produccion", label: "Emitiendo en producción", descripcion: "Documentos con valor tributario emitidos." },
] as const;

export const CICLO = {
  con_890_vigente: false,
  decision: null,
  decision_pendiente: false,
  desafiliacion_facturas: true,
  estado: "NUEVA",
  estado_etiqueta: "Empresa nueva, sin inscribir",
  nro_resol: 99,
  opciones: ["quedarme", "certificar"],
  puede_decidir: true,
  renuncia_890_aplica: false,
  tenant: { id: 56, razon_social: TENANT.razon_social, rut: TENANT.rut_formateado },
  tipos: ["facturas", "boletas", "ambas"],
};

export const SUSCRIPCION = {
  cambio_programado: null,
  cartera: null,
  cobro_pendiente: null,
  data: null,
  pasarela: {
    clave: "webpay_plus",
    detalle: "El pago lo procesa Webpay, de Transbank.",
    medios: "tarjetas de crédito, débito y prepago",
    nombre: "Transbank",
  },
  plan_actual: { id: 6, nombre: "gratis", precio: 0, slug: "free" },
  plan_por_elegir: false,
};

export const PLANES = [
  {
    slug: "free",
    nombre: "Gratis",
    precio: 0,
    dte_mes: 50,
    descripcion: "Prueba el portal sin compromiso.",
    features: ["dte"],
  },
  {
    slug: "pyme",
    nombre: "Profesional",
    precio: 29990,
    dte_mes: 3000,
    descripcion: "Certificación SII, recibidos, programadas y carga masiva.",
    features: ["dte", "recibidos", "programadas", "carga_masiva"],
  },
  {
    slug: "empresa",
    nombre: "Empresa",
    precio: 49990,
    dte_mes: 0,
    descripcion: "DTE ilimitados, API, contable y todos los módulos.",
    features: ["dte", "recibidos", "programadas", "carga_masiva", "api", "contable"],
  },
];

export const MODULOS = [
  { key: "dte", nombre: "Emisión DTE", activo: true, descripcion: "Facturas, boletas, notas y guías." },
  { key: "recibidos", nombre: "Recibidos", activo: true, descripcion: "Documentos de proveedores y acuse." },
  { key: "api", nombre: "API Keys", activo: true, descripcion: "Integración programática." },
  { key: "contable", nombre: "Contable / RCV", activo: true, descripcion: "Libros y registro de compras/ventas." },
  { key: "carga_masiva", nombre: "Carga masiva", activo: true, descripcion: "Emisión por planilla." },
  { key: "programadas", nombre: "Programadas", activo: true, descripcion: "Emisiones recurrentes." },
];

export const INITIAL_API_KEYS: ApiKey[] = [];
export const INITIAL_CLIENTES: Cliente[] = [];
export const INITIAL_PRODUCTOS: Producto[] = [];
export const INITIAL_DTES: DteItem[] = [];
