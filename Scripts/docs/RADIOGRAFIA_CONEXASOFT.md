# RADIOGRAFÍA DE CONEXASOFT

> Análisis estratégico y técnico del ecosistema ConexaSoft / ErpConexa.  
> Basado exclusivamente en evidencia del repositorio DevConexa.  
> Fecha de referencia: agosto 2026.

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura del ecosistema](#2-arquitectura-del-ecosistema)
3. [Mapa funcional](#3-mapa-funcional)
4. [Inventario de módulos](#4-inventario-de-módulos)
5. [Modelo multiempresa](#5-modelo-multiempresa)
6. [Seguridad](#6-seguridad)
7. [Integraciones](#7-integraciones)
8. [Facturación DIAN](#8-facturación-dian)
9. [Datos y reportes](#9-datos-y-reportes)
10. [Automatización](#10-automatización)
11. [Inteligencia artificial](#11-inteligencia-artificial)
12. [Problemas que resuelve](#12-problemas-que-resuelve)
13. [Perfil de cliente](#13-perfil-de-cliente)
14. [Diferenciadores](#14-diferenciadores)
15. [Marca actual](#15-marca-actual)
16. [Landing Page actual](#16-landing-page-actual)
17. [Capacidades reales vs futuras](#17-capacidades-reales-vs-futuras)
18. [Tres posibles posicionamientos](#18-tres-posibles-posicionamientos)
19. [ADN propuesto](#19-adn-propuesto)
20. [Oportunidades futuras](#20-oportunidades-futuras)
21. [Recomendaciones](#21-recomendaciones)
22. [Conclusión](#22-conclusión)

---

## 1. Resumen ejecutivo

**ConexaSoft S.A.S.** es la empresa propietaria y operadora de la plataforma. En el código también existe como tenant operativo (`slug: conexasoft`) para facturar sus propios servicios. **ErpConexa** es el producto: un ERP SaaS multi-compañía, modular, orientado a PYMES colombianas, con el núcleo más maduro en **ventas + facturación electrónica DIAN**.

### Lo que el producto sí es hoy

- Plataforma de operación comercial (cotizar → prefacturar → facturar → enviar a DIAN → entregar PDF/XML al cliente).
- Sistema multiempresa con módulos contratables, usuarios, permisos y tema visual por compañía.
- Conjunto operativo conectado: **agenda, caja e inventario pueden convertirse en factura**.
- Módulo de **contabilidad** funcional, pero todavía **manual** (no genera asiento automático desde ventas/caja/inventario).
- Sitio comercial editable (misión, visión, paquetes, contacto) y canal interno de soporte.

### Lo que el producto no es hoy

- No hay inteligencia artificial, predicción ni recomendaciones.
- No hay motor de automatización, workflows ni alertas analíticas.
- No hay dashboard de negocio (KPIs de ventas, cartera, inventario crítico, etc.).
- Nómina y el módulo genérico “Reportes” están en catálogo, no implementados.
- ChatBoot (WhatsApp) existe como prototipo **aparte**, no integrado al ERP.

### Conclusión de marca vs producto

La marca comunica “ERP modular para PYMES” y “gestión inteligente”. Lo primero es cierto. Lo segundo es un eslogan: en el código, “inteligente” no corresponde a IA.

---

## 2. Arquitectura del ecosistema

Monorepo `DevConexa` con cinco piezas. Evidencia: `README.md`, `Scripts/docs/ARQUITECTURA.md`, `docker-compose.yml`.

| Pieza | Rol real | Puerto | Evidencia |
|-------|----------|--------|-----------|
| **ErpConexa** | Frontend Quasar/Vue 3: landing, login, ERP de compañía, panel `/admin` | 9500 | `ErpConexa/src/router/routes.js` |
| **Sever.Conexa** | API REST + PostgreSQL. Auth, tenants, módulos, UBL DIAN, PDF, correo | 3500 | `Sever.Conexa/src/index.js` |
| **ServerFEpos** | Firma XMLDSig, ZIP, SOAP DIAN, certificados `.p12` por compañía | 3000 | `ServerFEpos/server.js`, `services/signer.js` |
| **ChatBoot** | Chatbot WhatsApp/Meta para armar una factura por diálogo | 3001 | `ChatBoot/src/bot/handlers.js` |
| **Scripts** | Migraciones SQL (001–037) y documentación | — | `Scripts/database/`, `Scripts/docs/` |

### Flujo técnico real

```
Navegador (ErpConexa)
        │  JWT Bearer
        ▼
API (Sever.Conexa) ── PostgreSQL `Conexa` (tenant = company_id)
        │
        ├── genera UBL 2.1  →  ServerFEpos (firma + SOAP DIAN)
        ├── genera PDF/ZIP  →  SMTP de la compañía (Nodemailer)
        └── CMS público     →  landing `/`
```

ChatBoot **no entra** en ese flujo: usa otra base (`chatboot`) y un `FACTURA_API_URL` genérico (`ChatBoot/.env.example`). No llama a `/api/company/ventas`.

### Capas de seguridad

Documentadas en `Scripts/docs/SEGURIDAD.md`: guards de ruta en frontend, JWT + permisos + `company_id` en API, SQL parametrizado, secretos cifrados.

### Infraestructura

- **Desarrollo diario:** PostgreSQL local + Node directo (`Scripts/dev.ps1`).
- **Integración:** Docker solo para PostgreSQL (`docker-compose.yml`).
- **Producción:** HTTPS opcional en Sever.Conexa; CORS con soporte para `connetcgroup.com`.

**Modelo de datos:** una sola base PostgreSQL, aislamiento lógico por `company_id`. No hay base por tenant.

---

## 3. Mapa funcional

Lo que realmente existe en el código:

```
CONEXASOFT S.A.S. (dueña + tenant operativo)
│
├── PANEL PLATAFORMA (/admin) — super_admin
│     Compañías · Módulos contratados · Permisos
│     CMS del sitio · Paquetes comerciales · Tickets de soporte
│
└── TENANT / EMPRESA (company_id)
      ├── Usuarios y permisos
      ├── Identidad (logo, colores, NIT, slug)
      │
      ├── CATÁLOGO COMPARTIDO
      │     Clientes (campos DIAN + DANE) · Servicios
      │
      ├── VENTAS
      │     Cotización → Prefactura → Factura
      │
      ├── FACTURACIÓN ELECTRÓNICA
      │     Resolución DIAN · Emisión · Envío · Notas crédito
      │     CUFE · XML/ZIP · PDF · Correo al cliente
      │
      ├── CAJA ──────────────────────────────┐
      ├── AGENDA DE CITAS ───────────────────┼──► Factura
      ├── INVENTARIO (bodegas, lotes, kardex)┘
      │
      ├── CONTABILIDAD (manual)
      │     PUC · Comprobantes · Centros de costo
      │     Periodos · Impuestos · Cierre · Reportes
      │
      └── SOPORTE (tickets hacia ConexaSoft)
```

**Huecos del mapa:** nómina (solo catálogo), reportes analíticos globales, compras como módulo, cartera/CXC operativa, asientos automáticos, IA, WhatsApp integrado.

---

## 4. Inventario de módulos

### Ventas

| Aspecto | Detalle |
|---------|---------|
| **Función** | Ciclo comercial previo a la factura: cotizaciones y prefacturas, conversión a factura, PDF y envío al cliente |
| **Procesos** | Crear/editar/confirmar cotización, prefactura, facturar documento, catálogo de clientes y servicios, variables (prefijo de códigos) |
| **Usuarios** | Vendedor, admin de compañía |
| **Dependencias** | Clientes/servicios compartidos con agenda; facturación para convertir; SMTP para enviar cotización |
| **Ubicación** | `VentasPage.vue`, `ConfigVentasPage.vue`; `ventas.js`; `006_ventas_facturacion.sql`, `008_sales_documents.sql` |
| **Madurez** | **Alto** |
| **Potencial comercial** | Alto |

---

### Facturación electrónica DIAN

| Aspecto | Detalle |
|---------|---------|
| **Función** | Emitir, firmar, enviar y rastrear facturas electrónicas; notas crédito; entrega al cliente |
| **Detalle técnico** | Ver [sección 8](#8-facturación-dian) |
| **Ubicación** | `FacturacionPage.vue`, `DianSubmissionsPanel.vue`; `ubl-invoice.js`, `fepos-client.js`; `ServerFEpos/` |
| **Madurez** | **Alto** |
| **Potencial comercial** | **Diferenciador #1** |

---

### Caja

| Aspecto | Detalle |
|---------|---------|
| **Función** | Puntos de cobro, apertura/cierre, recibos, arqueo, conversión a factura |
| **Procesos** | Cajas, sesión diaria, ingresos/egresos, formas de pago, usuario ligado a caja, PDF recibo/arqueo, facturar recibo |
| **Ubicación** | `CajaPage.vue`; `caja.js`; `024_caja.sql` y 025–027 |
| **Madurez** | **Alto** |

---

### Inventario

| Aspecto | Detalle |
|---------|---------|
| **Función** | Existencias por bodega y lote, movimientos, reportes PDF/Excel, facturar movimiento |
| **Nota** | “Entradas por compras” es tipo de movimiento, no módulo de compras |
| **Ubicación** | `InventarioPage.vue`, `ConfigInventarioPage.vue`; `inventario.js`; `030_inventario.sql` |
| **Madurez** | **Alto / medio-alto** |

---

### Agenda de citas

| Aspecto | Detalle |
|---------|---------|
| **Función** | Programar servicios con profesionales, horarios, clientes; facturar cita cumplida |
| **Ubicación** | `AgendaPage.vue`; `agenda.js`; `005_agenda_citas.sql` |
| **Madurez** | **Alto** |

---

### Contabilidad

| Aspecto | Detalle |
|---------|---------|
| **Función** | PUC, comprobantes, centros de costo, periodos, impuestos, movimiento diario, cierre, reportes |
| **Limitación** | Enum `accounting_journal_source` preparado para `ventas|caja|inventario|nomina`, pero **sin generador automático** |
| **Ubicación** | `ContabilidadPage.vue`, `ConfigContabilidadPage.vue`, `ReportesContabilidadPage.vue`; `contabilidad.js` |
| **Madurez** | **Medio-alto** (libro); **medio** (integración ERP) |

---

### Usuarios, roles y permisos

| **Función** | Administración de usuarios y permisos granulares |
| **Ubicación** | `UsersPage.vue`; `users.js`; `004_permissions_users.sql`; `permissions.js` |
| **Madurez** | **Alto** |

---

### Administración de plataforma

| **Función** | Altas de compañías, logo/tema, módulos, CMS, paquetes, tickets, permisos |
| **Ubicación** | `AdminLayout.vue`, `CompaniesPage.vue`, `SiteContentPage.vue`, `PlansPage.vue`, etc. |
| **Madurez** | **Alto** |
| **Nota** | Planes comerciales **no aprovisionan** módulos automáticamente |

---

### Sitio público / landing · Soporte interno · Dashboard

| Módulo | Madurez | Nota |
|--------|---------|------|
| Landing CMS | **Medio** | `LandingPage.vue`, `037_public_site_support.sql` |
| Soporte (tickets) | **Medio** | `SupportPage.vue`, `support.js` |
| Dashboard compañía | **Bajo** | Solo cuenta usuarios y módulos activos |

---

### Catálogo sin implementar

| Módulo | Estado | Evidencia |
|--------|--------|-----------|
| **Nómina** | Catálogo vacío | `001_init_schema.sql`; menú “Próximamente” en `CompanyLayout.vue` |
| **Reportes** | Catálogo vacío | Reportes reales solo embebidos en inventario y contabilidad |

**No comunicar** nómina ni reportes como módulos activos.

---

## 5. Modelo multiempresa

**Sí existe y es el eje del producto.**

### Cómo funciona

1. Tabla `companies` + `company_modules` (módulos por contrato, con fechas `contract_start/end`).
2. Usuarios con `company_id`. `super_admin` tiene `company_id = NULL`.
3. El JWT lleva `companyId`; las consultas filtran por ese valor, no por un ID que mande el cliente.
4. El mismo email puede existir en varias compañías; el login pide `slug` (`LoginPage.vue`, `loginCompany` en `auth.js`).
5. Cada tenant tiene tema (colores), logo, NIT/DV, certificado DIAN, SMTP, resoluciones, variables.
6. ServerFEpos resuelve certificado por `X-Company-Id` (`company-config.js`).

### Roles

| Rol | `company_id` | Acceso |
|-----|--------------|--------|
| `super_admin` | `NULL` | Panel `/admin` |
| `company_admin` | UUID | Administra su compañía |
| `user` | UUID | Módulos habilitados según permisos |

### Robustez

Sólida para un SaaS de este tamaño. Aislamiento lógico (no físico). Permisos por usuario y por compañía. Sin rate limiting ni revocación de JWT. Los planes comerciales **no están atados** al aprovisionamiento.

### Ventaja comercial

Vender por módulos, operar varias empresas con un mismo operador, white-label visual, y que ConexaSoft también sea cliente de su propio ERP (`029_conexasoft_company.sql`).

---

## 6. Seguridad

Documentado además en `Scripts/docs/SEGURIDAD.md`.

| Control | Estado | Evidencia |
|---------|--------|-----------|
| JWT Bearer, expiración configurable | Implementado | `middleware/auth.js`, `config.js` |
| bcrypt cost 12 | Implementado | login en `auth.js` |
| Roles `super_admin / company_admin / user` | Implementado | `001_init_schema.sql` |
| Permisos granulares `requirePermission` | Implementado | `permissions.js` + cada router |
| SQL parametrizado | Implementado | consultas `$1, $2` |
| Aislamiento por `company_id` del token | Implementado | routers de compañía |
| Separación admin vs tenant | Implementado | 403 cruzado |
| Secretos DIAN/SMTP cifrados AES-256-CBC | Implementado | `encryptSecret` en `dian-certificate.js` |
| CSP en frontend | Implementado | `ErpConexa/index.html` |
| CORS acotado + `connetcgroup.com` | Implementado | `index.js` |
| HTTPS opcional en API | Implementado | `index.js` |
| Certificados fuera de Git | Implementado | `ServerFEpos/cert/` |
| Rate limiting / 2FA / refresh / blacklist JWT / Helmet | **No encontrado** | — |
| Sesión en `localStorage` | Implementado, consciente | `SEGURIDAD.md` |

La autorización real está en el servidor. El frontend solo oculta menús.

---

## 7. Integraciones

Integraciones externas encontradas en el repositorio, **excluyendo DIAN** (detalle en [sección 8](#8-facturación-dian)).

| Integración | Estado | Qué hace | Evidencia |
|-------------|--------|----------|-----------|
| **ServerFEpos** | Implementada | Firma XML y envío SOAP a DIAN | `fepos-client.js`, `ServerFEpos/` |
| **Correo SMTP** | Implementada | Envío de facturas, cotizaciones y paquetes al cliente | `invoice-email.js`, `013_company_invoice_email.sql` |
| **Catálogo DANE** | Implementada | Departamentos y municipios para adquirientes | `010_dane_locations.sql`, `catalog.js` |
| **Excel** | Implementada (acotada) | Import/export plan de cuentas; export inventario | `accounting-chart-excel.js`, `inventario-report-excel.js` |
| **WhatsApp / Meta** | Prototipo desconectado | ChatBoot con Cloud API; otra base de datos | `ChatBoot/` |
| **Almacenamiento certificados** | Implementada | `.p12` por compañía, sincronizado desde ERP | `dian-certificate.js`, `ServerFEpos/cert/companies/` |

### No encontrado

Pasarelas de pago, SIIGO/Helisa, bancos, Google Calendar, S3/cloud storage como producto, SMS, firmas digitales distintas del certificado DIAN, OpenAI u otros LLM, APIs públicas para terceros.

---

## 8. Facturación DIAN

Módulo más profundo del ecosistema. Es el **diferenciador técnico y comercial #1**.

### Alcance funcional

| Capacidad | Estado | Evidencia |
|-----------|--------|-----------|
| Factura electrónica tipo 01 (UBL 2.1) | Implementada | `ubl-invoice.js` |
| Notas crédito electrónicas | Implementada | `ubl-credit-note.js`, `021_dian_credit_note_concepts.sql` |
| Resoluciones y numeración DIAN | Implementada | `dian_resolutions`, `006_ventas_facturacion.sql` |
| Ambientes habilitación / producción | Implementada | `dian_environment`, `020_dian_environment_pruebas.sql` |
| Certificado digital `.p12` por compañía | Implementada | `015_dian_certificate.sql`, `dian-certificate.js` |
| Firma XMLDSig + empaquetado ZIP | Implementada | `ServerFEpos/services/signer.js`, `packager.js` |
| Envío SOAP a DIAN | Implementada | `ServerFEpos/services/dian-client.js` |
| CUFE y trazabilidad de envíos | Implementada | `invoices.cufe`, `dian_submissions` |
| Seguimiento de intentos (refresh, detalle) | Implementada | `DianSubmissionsPanel.vue`, endpoints en `ventas.js` |
| AttachedDocument y paquete al cliente | Implementada | `invoice-delivery.js`, `ubl-attached-document.js` |
| PDF de factura con logo de empresa | Implementada | `invoice-pdf.js`, `019_company_logo_invoice.sql` |
| Envío por correo (PDF + XML) | Implementada | `invoice-email.js` |
| Consulta de adquiriente DIAN | Implementada | `dian-acquirer.js` |
| Anulación vía nota crédito | Implementada | `ventas.anular`, `facturacion.notas_credito` |
| Campos DIAN en clientes (NIT, DV, responsabilidad fiscal) | Implementada | `009_client_dian_fields.sql`, `ClientFormFields.vue` |
| Software ID, PIN, Test Set ID | Implementada | `012_dian_config_fields.sql`, `014_dian_software_pin.sql` |

### Flujo de facturación

```
1. Origen del documento
   ├── Ventas: cotización / prefactura → convertir
   ├── Caja: recibo confirmado → facturar
   ├── Agenda: cita cumplida → facturar
   └── Inventario: movimiento → facturar

2. Emisión (borrador → emitida)
   └── PATCH /invoices/:id/emit

3. Generación UBL 2.1
   └── Sever.Conexa: ubl-invoice.js

4. Firma y envío
   └── ServerFEpos: signXML → ZIP → SOAP DIAN
       Headers: X-Company-Id, X-Dian-Technical-Key, X-Dian-Environment, etc.

5. Registro de respuesta
   └── dian_submissions (intentos, XML, éxito/error)

6. Entrega al cliente
   └── PDF + AttachedDocument por SMTP de la compañía
```

### Estados de factura

Definidos en `006_ventas_facturacion.sql`:

`borrador` → `emitida` → `enviada_dian` → `aprobada_dian` | `rechazada_dian` → `anulada`

También existe `convertida` para documentos de venta transformados (`008_sales_documents.sql`).

### Configuración por compañía

Cada tenant configura en **Ventas → Configuración → Resoluciones / DIAN**:

- Resolución DIAN (prefijo, rango, vigencia, clave técnica).
- Certificado `.p12` (subida, sincronización con ServerFEpos).
- Software ID, PIN, Test Set ID.
- SMTP para envío de documentos al cliente.
- Ambiente: habilitación o producción.

Readiness check: `dian-readiness.js` valida campos obligatorios antes de emitir.

### Permisos relacionados

| Código | Acción |
|--------|--------|
| `facturacion.acceso` | Ingresar al módulo |
| `facturacion.emitir` | Emitir facturas |
| `facturacion.notas_credito` | Notas crédito |
| `facturacion.seguimiento_dian` | Panel de seguimiento |
| `ventas.facturar` | Convertir documentos a factura |
| `ventas.enviar_dian` | Enviar a DIAN |
| `ventas.ver_dian` | Ver envíos y paquete cliente |
| `ventas.anular` | Anular facturas |
| `ventas.resoluciones` | Configurar resolución y certificado |

### Madurez y riesgos comerciales

| Aspecto | Evaluación |
|---------|------------|
| **Madurez técnica** | **Alta** — código extenso, migraciones DIAN 012–023, tests en ServerFEpos |
| **Comunicable** | **Sí**, con evidencia de habilitación/producción real con clientes |
| **Riesgo** | Depende de certificado vigente, ambiente correcto y ServerFEpos activo |
| **No incluye hoy** | Nómina electrónica, POS electrónico, documento soporte, RADIAN |

### Valor para el cliente

Cumplir normativa DIAN **dentro** del flujo operativo diario, sin un facturador separado ni duplicar clientes y numeración.

---

## 9. Datos y reportes

| Capacidad | Clasificación | Evidencia |
|-----------|---------------|-----------|
| Dashboard de negocio (ventas, márgenes, cartera) | **NO ENCONTRADA** | `DashboardPage.vue` solo cuenta usuarios/módulos |
| Gráficos / KPIs | **NO ENCONTRADA** | sin chart libraries |
| Reportes contables (balance prueba, auxiliares, general) | **REALMENTE IMPLEMENTADA** | `contabilidad-journal.js`, `ReportesContabilidadPage.vue` |
| Reportes de inventario PDF/Excel | **REALMENTE IMPLEMENTADA** | `inventario-report-pdf.js`, `inventario-report-excel.js` |
| PDF operativos (factura, cotización, recibo, arqueo) | **REALMENTE IMPLEMENTADA** | `invoice-pdf.js`, `sales-document-pdf.js`, `caja-arqueo-pdf.js` |
| Históricos operativos (citas, sesiones, envíos DIAN) | **REALMENTE IMPLEMENTADA** | tablas y pantallas de historial |
| Trazabilidad DIAN (intentos, XML, respuesta) | **REALMENTE IMPLEMENTADA** | `dian_submissions`, `DianSubmissionsPanel.vue` |
| Trazabilidad de lotes / existencias | **REALMENTE IMPLEMENTADA** | `inventory_lots`, kardex por movimiento |
| Alertas (stock mínimo, vencimiento, cuota DIAN) | **NO ENCONTRADA** | hay `expiry_date` en lotes, sin alertas |
| Consultas analíticas / data warehouse | **NO ENCONTRADA** | — |
| CMS y mensajes de contacto | **REALMENTE IMPLEMENTADA** | `site_content`, `public_contact_messages` |

“Inventario en tiempo real” en la landing es **defendible** (existencias al confirmar movimiento). No hay analítica ni “inteligencia de datos”.

---

## 10. Automatización

| Capacidad | Clasificación |
|-----------|---------------|
| Conversión cotización/prefactura → factura | **REALMENTE IMPLEMENTADA** (acción de usuario) |
| Cita / recibo de caja / movimiento de inventario → factura | **REALMENTE IMPLEMENTADA** (acción de usuario) |
| Numeración interna y DIAN | **REALMENTE IMPLEMENTADA** |
| Lotes internos automáticos | **REALMENTE IMPLEMENTADA** (`company-settings.js`) |
| Envío a DIAN y correo | **REALMENTE IMPLEMENTADA** (disparado por el usuario) |
| Cierre de mes contable (cálculo de saldos) | **REALMENTE IMPLEMENTADA** (disparado por el usuario) |
| Motor de reglas / workflows / cron / colas | **NO ENCONTRADA** |
| Asiento contable automático desde ventas/caja/inventario | **INFRAESTRUCTURA PREPARADA** (enum, sin productor) |
| Chatbot que factura por WhatsApp | **INFRAESTRUCTURA PREPARADA** (ChatBoot no cableado) |
| Alertas automáticas | **NO ENCONTRADA** |

Hay **automatización de proceso** (un hecho genera factura). No hay **automatización de plataforma** (jobs, reglas, bots en producción).

---

## 11. Inteligencia artificial

**No existe IA en este repositorio.**

Búsqueda de `openai`, `chatgpt`, `inteligencia artificial`, `machine learning`, `predicción`, `recomendación` (como producto): sin implementaciones. ChatBoot es un **árbol de estados** (`STATES.AWAITING_CLAVE`, etc. en `states.js`), no un modelo.

El tagline **“Gestión inteligente para empresas reales.”** (`brand-assets.js`, seed de `037_public_site_support.sql`) es copy. No debe usarse como prueba de IA.

| Clasificación | Estado |
|---------------|--------|
| IA | **NO ENCONTRADA** |
| Chatbot WhatsApp | **Prototipo desconectado** |

---

## 12. Problemas que resuelve

Solo los que el código ataca de forma razonable:

1. **Facturar a la DIAN aparte del día a día.** Cotización, caja, cita e inventario desembocan en la misma factura electrónica.
2. **Numeración y resolución desordenadas.** Resoluciones, rangos, consecutivos y ambientes por compañía.
3. **No saber si DIAN aceptó o rechazó.** Seguimiento por intento, XML y refresh de estado.
4. **Entregar el documento al cliente a mano.** PDF + AttachedDocument por correo con SMTP propio.
5. **Caja sin arqueo ni responsable.** Sesión, formas de pago, diferencia, usuario ligado a caja.
6. **Inventario sin lote ni bodega.** Existencias por bodega/lote, movimientos numerados, PDF/Excel.
7. **Agenda en papel o Excel, facturación aparte.** Cita cumplida → factura.
8. **Varias empresas con datos mezclados.** Tenant `company_id`, slug, módulos por contrato.
9. **Todo el mundo ve y puede hacer lo mismo.** Permisos por acción.
10. **Contabilidad en otra herramienta, sin PUC propio.** Libro, cierre y reportes (aún no integrados al resto).
11. **Soporte informal.** Tickets dentro del producto.
12. **Datos de cliente incompletos para FE.** Campos DIAN + DANE + lookup de adquiriente.

No hay evidencia de que resuelva: predicción de demanda, conciliación bancaria, nómina, compras formales, BI, o unificación con sistemas terceros.

---

## 13. Perfil de cliente

### Lo que el diseño asume (con evidencia)

| Dimensión | Perfil |
|-----------|--------|
| **País** | Colombia (DIAN, DANE, NIT/DV, COP, UBL 2.1) |
| **Tamaño** | PYME. Landing: “ERP modular para PYMES”. Planes seed: 3 / 10 / ilimitados usuarios |
| **Operación** | Servicios con cita y/o mostrador con caja y/o inventario con lotes. Puede ser solo FE (plan Esencial) |
| **Complejidad** | Media. No es ERP de manufactura ni gran empresa |
| **Usuarios** | Pocos a decenas, con roles distintos |
| **Multiempresa** | Sí, para grupos o un operador que atiende varias NITs |
| **Administrativo** | Alto (permisos, cajas, resoluciones, certificado) |
| **Contable** | Presente, pero el contador todavía asienta a mano |
| **Comercial** | Cotizar y facturar es el centro |

**No inventar sectores.** El icono `medical_services` y el campo `specialty` **sugieren** servicios profesionales; no hay vertical de salud, retail o construcción como producto.

**Huella de un operador real:** CORS y ejemplo de slug `connetc-group-sas`; autor del frontend `jose.jimenez@ixcolombia.com`.

---

## 14. Diferenciadores

| # | Diferenciador | Evidencia | Valor para el cliente | Nivel |
|---|---------------|-----------|----------------------|-------|
| 1 | **Facturación electrónica DIAN dentro del flujo, no como add-on** | UBL, ServerFEpos, seguimiento, notas crédito | Cumplir sin un segundo software | **Alta** |
| 2 | **Un hecho operativo → una factura** (cita, caja, inventario) | `agenda.js`, `caja.js`, `inventory-invoice.js` | Menos retrabajo y datos duplicados | **Alta** |
| 3 | **SaaS multi-compañía con módulos por contrato** | `company_modules`, panel admin | Pagar solo lo que se usa | **Media-alta** |
| 4 | **Permisos por acción, no solo por menú** | `requirePermission` en cada endpoint | Cajero sin anular DIAN | **Media** |
| 5 | **Identidad visual por empresa** (logo + colores en UI y PDF) | `CompanyFormPage.vue`, `007_company_theme.sql` | El sistema “se ve de ellos” | **Media** |
| 6 | **Trazabilidad DIAN seria** (intentos, XML, refresh, AttachedDocument) | `dian_submissions`, panel de seguimiento | Defenderse ante rechazo o auditoría | **Alta** |
| 7 | **Localización colombiana de verdad** (NIT/DV, DANE, lookup adquiriente) | `009_client_dian_fields.sql`, `dian-acquirer.js` | Menos errores de habilitación | **Media-alta** |
| 8 | **ConexaSoft opera el mismo producto que vende** | `029_conexasoft_company.sql` | Credibilidad comercial | **Media** |
| 9 | **Soporte y CMS dentro de la plataforma** | tickets + `site_content` | Relación cercana | **Baja-media** |
| 10 | Chatbot WhatsApp / IA | — | **No es diferenciador actual** | — |

---

## 15. Marca actual

### Textos encontrados

| Pieza | Texto | Fuente |
|-------|-------|--------|
| Badge hero | “ERP modular para PYMES” | `LandingPage.vue` (hardcoded) |
| Título default | “ConexaSoft ERP” | `037_public_site_support.sql` |
| Tagline | “Gestión inteligente para empresas reales.” | `brand-assets.js` + seed |
| Misión | Facilitar la operación diaria de las PYMES colombianas… | seed CMS |
| Visión | Plataforma preferida en Colombia por simplicidad, soporte y cumplimiento | seed CMS |
| Beneficios | FE DIAN, inventario, caja, contabilidad, soporte, multi-compañía | seed CMS |
| Paquetes | Esencial 99.000 / Profesional 199.000 / Empresarial 349.000 COP | seed |
| Product name HTML | `ErpConexa` | `package.json` |

### Qué comunica

ERP colombiano, modular, PYME, cumplimiento DIAN, cercanía.

### Qué está bien

Honestidad relativa de los beneficios. Tono de cumplimiento. CMS editable.

### Qué está débil

“Inteligente” sin IA; landing genérica; no muestra el flujo operativo → factura; CTA único; contacto placeholder; botón **Admin** en header público.

### Qué está desactualizado

Paleta landing **verde/teal** (`#0d7377`) vs marca **azul** (`#1976D2`). Producto interno ya migró (`028_conexasoft_theme_defaults.sql`).

### Contradicciones producto vs página

- “Gestión inteligente” ≠ no hay IA.
- Planes no aprovisionan módulos.
- “Todos los módulos” no incluye nómina ni reportes.
- Home no explica agenda ni encadenamiento operativo.
- Título browser: “ErpConexa”, no ConexaSoft.

---

## 16. Landing Page actual

Ruta `/` → `PublicLayout.vue` + `LandingPage.vue`. Contenido dinámico: `GET /api/public/site` y `/api/public/plans`.

| Sección | Qué comunica | Problema | Qué debería comunicar (propuesta) |
|---------|--------------|----------|-----------------------------------|
| **Nav** | Inicio, Paquetes, Contacto, Ingresar, Admin | “Admin” es interno | Marca + producto + ingreso clientes |
| **Hero** | ERP PYME + logo + demo/login | Tagline “inteligente” inflado; teal ≠ marca | Operación colombiana + FE DIAN |
| **Misión/visión** | Propósito institucional | Poco comercial | Mover a “Nosotros” |
| **Beneficios** | 6 cards CMS | Listan módulos, no el flujo | Problema → capacidad → prueba |
| **Módulos** | **No existe** | Producto modular invisible | Vitrina de módulos maduros |
| **Paquetes** | 3 planes con precio | No aprovisionan módulos | Orientación o atar a `company_modules` |
| **Contacto** | Formulario + datos | WhatsApp en CMS no se muestra | Canal real |
| **Footer** | ConexaSoft + Admin | Expone Admin | Legal + portal compañía |
| **CTA** | Demo y Contactar | Sin prueba visual | Demo + “ver facturación DIAN” |

---

## 17. Capacidades reales vs futuras

| CAPACIDAD | EXISTE HOY | MADUREZ | COMUNICABLE | OPORTUNIDAD FUTURA |
|-----------|------------|---------|-------------|-------------------|
| Multi-compañía / tenant | Sí | Alta | Sí | Políticas más estrictas si el cliente lo exige |
| Módulos por contrato | Sí | Alta | Sí | Atar planes → módulos |
| Ventas (cotiz. / prefactura) | Sí | Alta | Sí | — |
| Facturación electrónica DIAN | Sí | Alta | Sí, con evidencia habilitación | Doc. soporte, nómina electrónica, POS |
| Notas crédito + seguimiento DIAN | Sí | Alta | Sí | — |
| Caja y arqueo | Sí | Alta | Sí | — |
| Agenda → factura | Sí | Alta | Sí | Recordatorios, portal cliente |
| Inventario / lotes / bodegas | Sí | Alta | Sí | Alertas vencimiento, compras |
| Contabilidad | Sí | Media-alta | Sí, con matices | Asiento automático |
| Permisos granulares | Sí | Alta | Sí (B2B) | — |
| Tema / logo por empresa | Sí | Alta | Sí | — |
| Correo de documentos | Sí | Alta | Sí | — |
| Soporte por tickets | Sí | Media | Con cuidado | SLA, adjuntos |
| CMS + planes | Sí | Media | Sitio sí; precios si son reales | Checkout self-service |
| Dashboard analítico | Casi no | Baja | **No** | Mayor gap de “datos” |
| Nómina | Catálogo | Baja | **No** | Módulo futuro |
| Reportes como módulo | Catálogo | Baja | **No** | Unificar reportes |
| Compras / proveedores | Solo tipo movimiento | Baja | **No** | Módulo compras |
| Cartera / CXC | Clase contable | Baja | **No** | Cartera operativa |
| WhatsApp | Prototipo | Baja | **No** | Integrar a Sever.Conexa |
| Workflows / cron | No | — | **No** | Motor de reglas |
| IA | No | — | **No** | Solo con caso real |
| Integraciones ERP/bancos | No | — | **No** | APIs públicas |

---

## 18. Tres posibles posicionamientos

### A. “La operación que termina en una factura DIAN”

| Elemento | Contenido |
|----------|-----------|
| **Slogan** | Operar, facturar y cumplir, en el mismo flujo. |
| **Idea central** | Caja, cita, inventario y venta desembocan en FE. |
| **Promesa** | Lo que cobra o despacha la empresa sale listo para DIAN y para el cliente. |
| **Público** | PYME colombiana con puente Excel ↔ facturador. |
| **Diferenciadores** | FE integrada, conversión desde tres frentes, seguimiento DIAN. |
| **Riesgos** | Demostrar habilitación/producción real. |
| **Ventajas** | 100% alineado con el código. No promete IA. |

### B. “ERP modular para quien opera más de una empresa”

| Elemento | Contenido |
|----------|-----------|
| **Slogan** | Una plataforma, cada empresa en su lugar. |
| **Idea central** | SaaS multi-NIT, módulos contratables, permisos y cara visual propia. |
| **Promesa** | Orden entre compañías sin mezclar datos. |
| **Público** | Grupos pequeños, contadores multi-NIT. |
| **Riesgos** | “Multiempresa” es higiene SaaS; brilla junto a DIAN. |
| **Ventajas** | Explica paquetes y panel admin. |

### C. “Cumplimiento colombiano sin complicar el día a día”

| Elemento | Contenido |
|----------|-----------|
| **Slogan** | Hecho para cómo se factura en Colombia. |
| **Idea central** | DANE, NIT, certificado, UBL, correo, notas crédito. |
| **Promesa** | Menos susto de habilitación y menos rechazos. |
| **Público** | PYME que teme a la DIAN. |
| **Riesgos** | Suena a “software DIAN”; hay que enseñar caja/agenda/inventario. |
| **Ventajas** | Honesto, local, defendible. |

**No recomendado:** “operación + datos + inteligencia” — analítica débil e IA inexistente.

---

## 19. ADN propuesto

> Propuestas conceptuales, no textos definitivos.

| Elemento | Propuesta |
|----------|-----------|
| **PROPÓSITO** | Ordenar la operación de empresas colombianas para que vender, cobrar y cumplir con la DIAN sea un solo sistema. |
| **MISIÓN** | Dar a las PYMES una plataforma modular con datos aislados por empresa y soporte cercano. |
| **VISIÓN** | Ser el sistema en el que las empresas colombianas operan el día a día y salen a paz y salvo con la DIAN. |
| **PROPUESTA DE VALOR** | ErpConexa conecta operación con factura electrónica y control por empresa. |
| **PROMESA DE MARCA** | Lo que ocurre en el negocio puede convertirse en un documento válido, rastreable y entregable. |

### 6 principios / valores

1. **Cumplir de verdad** — DIAN es el flujo, no un banner.
2. **No vender humo** — no hay IA hoy.
3. **Un dato, un tenant** — la empresa A no ve la B.
4. **Módulos con oficio** — solo lo que está listo.
5. **Cercanía operativa** — soporte dentro del producto.
6. **La empresa se ve ella** — logo, colores, NIT, certificado.

### 4 pilares de marca

1. Operación conectada · 2. Cumplimiento DIAN · 3. Multiempresa y permisos · 4. Cercanía

### Slogan (candidato)

**Operar y facturar, en un solo Conexa.**

### Descripciones cortas

- **ConexaSoft:** crea y opera ErpConexa y usa el mismo producto para facturar sus servicios.
- **ErpConexa:** ERP modular multi-compañía con ventas, caja, agenda, inventario, FE DIAN y contabilidad.

---

## 20. Oportunidades futuras

Oportunidades identificadas a partir de huecos del código y de la matriz real vs futuro. **Ninguna existe hoy como producto completo.**

### Producto y operación

| Oportunidad | Base actual | Qué faltaría |
|-------------|-------------|--------------|
| **Dashboard de negocio** | Dashboard solo cuenta usuarios | KPIs ventas, caja, DIAN, inventario |
| **Contabilización automática** | Enum `accounting_journal_source` | Productores desde ventas/caja/inventario |
| **Módulo de nómina** | Fila en `modules` | Tablas, UI, lógica de pagos |
| **Módulo de compras** | Tipo movimiento “Entradas por compras” | Órdenes, proveedores, recepción |
| **Cartera / CXC operativa** | Clase contable `cxc` | Aging, cobranza, estados de cuenta |
| **Reportes unificados** | Reportes embebidos por módulo | Módulo transversal o BI |
| **Alertas operativas** | `expiry_date` en lotes | Motor de notificaciones |
| **Recordatorios de agenda** | Citas programadas | SMS/email/WhatsApp integrado |

### Facturación y normativa

| Oportunidad | Nota |
|-------------|------|
| Documento soporte de adquisiciones | No implementado |
| Nómina electrónica | No implementado |
| POS electrónico | No implementado |
| RADIAN / recepción de facturas de proveedor | No implementado |

### Integraciones y conectividad

| Oportunidad | Base actual |
|-------------|-------------|
| **WhatsApp integrado al ERP** | ChatBoot desconectado; integrar vía Sever.Conexa |
| **API pública para terceros** | No hay endpoints documentados para externos |
| **Pasarelas de pago** | No encontrado |
| **Integración contable externa** (SIIGO, Helisa) | No encontrado |
| **Bancos / conciliación** | No encontrado |

### Plataforma y comercial

| Oportunidad | Base actual |
|-------------|-------------|
| **Planes → aprovisionamiento automático** | `subscription_plans.module_codes` sin enlace a `companies` |
| **Alta self-service / checkout** | Solo formulario de contacto |
| **Multi-base por tenant** | Hoy una sola PostgreSQL |
| **Rate limiting / 2FA / revocación JWT** | Documentado como mejora en SEGURIDAD.md |

### Marca y posicionamiento futuro

| Oportunidad | Condición |
|-------------|-----------|
| Pilar **“Datos”** | Cuando exista dashboard analítico real |
| Pilar **“Inteligencia”** | Cuando exista un caso de IA con evidencia (no eslogan) |
| Vertical de **servicios con cita** | Reforzar agenda + recordatorios + portal |
| Vertical **retail / mostrador** | Reforzar caja + inventario + FE |

---

## 21. Recomendaciones

### Marca y comunicación

1. **Cambiar percepción:** de “ERP genérico / inteligente” hacia **operación colombiana que termina en DIAN**. ConexaSoft = empresa; ErpConexa = producto.
2. **Dejar de comunicar:** IA, nómina, reportes como módulo, WhatsApp, “todos los módulos”, inventario “mágico”, Admin en home.
3. **Empezar a comunicar:** flujo cita/caja/inventario/venta → FE → correo; multiempresa; seguimiento DIAN; que ConexaSoft usa su propio ERP.

### Producto (antes de inflar la marca)

1. Dashboard mínimo de operación.
2. Contabilización automática (enum ya preparado).
3. Cablear ChatBoot o no mencionarlo.
4. Ocultar nómina/reportes del menú como “Próximamente”.
5. Ligar planes a `company_modules` si se venden en la web.

### Landing Page

1. Hero con problema colombiano concreto.
2. Quitar o redefinir “inteligente”.
3. Sección de flujo operativo → factura.
4. Vitrina de módulos maduros.
5. Alinear color al azul corporativo.
6. Esconder Admin; mostrar WhatsApp de contacto si existe.

### Qué mantener

Logo, estructura simple, CMS editable, tono cercano, flujos de facturación (no tocar el diferencial).

---

## 22. Conclusión

ConexaSoft es una software house colombiana que construyó **ErpConexa**: un ERP SaaS multi-compañía cuyo centro de gravedad real es **conectar la operación diaria con la facturación electrónica DIAN**. Ahí el código es denso, coherente y comercialmente defendible.

Alrededor hay módulos maduros (caja, agenda, inventario, ventas, permisos, tema por empresa) y una contabilidad honesta pero aún desconectada del resto. Hay un prototipo de WhatsApp y un catálogo de nómina/reportes que **no deben salir a venta**.

La marca hoy se presenta como “ERP modular para PYMES” con un eslogan de “gestión inteligente”. El primer mensaje es correcto. El segundo se adelanta al producto. El siguiente paso de identidad no es inventar IA: es **nombrar con precisión lo que ya hace mejor** — operar, integrar esos procesos en una factura válida y aislar cada empresa — y alinear la home a esa verdad.

---

*Documento generado a partir del análisis del repositorio DevConexa. Etapa 1: solo lectura, sin modificaciones al código.*
