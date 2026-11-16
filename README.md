# Facturador GDT DevSur

Réplica local del portal de facturación electrónica (Next.js 15 + Tailwind), basada en el estudio de `facturador.pulsandotech.cl` vía navegador Cursor + CDP `:9222` / REA.

## Arranque

```bash
npm install --ignore-scripts
npm run dev
```

Abre [http://localhost:3000/login](http://localhost:3000/login)

Demo: `nfigueroa@gdtdevsur.cl` / cualquier contraseña

## Módulos

Dashboard, Documentos, Nuevo DTE, Carga masiva, Programadas, Recibidos, Clientes, Productos, CAF/Folios, Documentos autorizados, Contable, Certificado, **Conexión SII**, API Keys, Empresa, Cuenta, Planes, Módulos.

API local bajo `/api/v1/*` (mismo prefijo que el sistema original).

## Conexión SII

1. Copia `.env.example` → `.env.local` y completa.
2. Pon el certificado en `data/certs/empresa.p12`.
3. Pon los CAF XML en `data/caf/`.
4. Abre `/sii` y usa **Probar semilla / token SII**.

### Qué debes entregar

- Certificado tributario `.p12` / `.pfx`
- Contraseña del certificado
- RUT del titular del certificado
- CAF XML por tipo de DTE (desde maullin en certificación)
- N° y fecha de resolución (en cert suele ser `0` + fecha de postulación)
