# RADIOGRAFÍA REAL DE CONEXASOFT

> Informe basado en exploración directa de fuentes en `C:\DevConexa`: pantallas `.vue`, routers API, migraciones SQL, ChatBoot, ServerFEpos.  
> Sin modificar archivos de aplicación.  
> Fecha de referencia: agosto 2026.

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Ecosistema](#2-ecosistema)
3. [Módulos](#3-módulos)
4. [Funcionalidades](#4-funcionalidades)
5. [Multiempresa](#5-multiempresa)
6. [Seguridad](#6-seguridad)
7. [Integraciones](#7-integraciones)
8. [DIAN](#8-dian)
9. [Datos y reportes](#9-datos-y-reportes)
10. [Automatización](#10-automatización)
11. [IA](#11-ia)
12. [Problemas que resuelve](#12-problemas-que-resuelve)
13. [Cliente objetivo](#13-cliente-objetivo)
14. [Diferenciadores](#14-diferenciadores)
15. [Capacidades actuales](#15-capacidades-actuales)
16. [Capacidades futuras](#16-capacidades-futuras)
17. [Posicionamiento](#17-posicionamiento)
18. [Recomendaciones para la marca](#18-recomendaciones-para-la-marca)

---

## 1. Resumen ejecutivo

**ConexaSoft S.A.S.** es la empresa desarrolladora. En código también es un tenant (`029_conexasoft_company.sql`, `slug: conexasoft`).

**ErpConexa** es el producto: ERP SaaS multi-compañía para operación comercial colombiana, con núcleo en **ventas + facturación electrónica DIAN**.

**Ecosistema real (5 proyectos):**

| Proyecto | Evidencia | Rol |
|----------|-----------|-----|
| ErpConexa | `ErpConexa/src/` | Frontend Quasar/Vue |
| Sever.Conexa | `Sever.Conexa/src/` | API + lógica de negocio |
| ServerFEpos | `ServerFEpos/server.js` | Firma XML y SOAP DIAN |
| ChatBoot | `ChatBoot/src/` | WhatsApp (prototipo aislado) |
| Scripts | `Scripts/database/` | 37 migraciones SQL |

**Lo más maduro:** facturación DIAN, ventas, caja, agenda, inventario, permisos multiempresa.

**Lo que no existe:** IA, dashboard analítico, nómina, módulo reportes, WhatsApp integrado al ERP, contabilización automática desde operación, aprovisionamiento automático de planes.

---

## 2. Ecosistema

```
                    ┌─────────────────┐
                    │  Landing / CMS  │  ErpConexa → GET /api/public/*
                    └────────┬────────┘
                             │
┌──────────────┐    JWT     ┌▼──────────────────────────────────┐
│  ErpConexa   │◄──────────►│  Sever.Conexa (PostgreSQL Conexa) │
│  9500        │            │  3500                              │
└──────────────┘            │  · /api/auth, /api/dashboard       │
                            │  · /api/company/{ventas,caja,...}  │
                            │  · /api/admin/*                    │
                            └──────────┬─────────────────────────┘
                                       │ UBL XML
                            ┌──────────▼──────────┐
                            │  ServerFEpos 3000   │
                            │  POST /factura      │
                            │  GET /adquiriente   │
                            └──────────┬──────────┘
                                       │ SOAP
                            ┌──────────▼──────────┐
                            │  DIAN Colombia      │
                            └─────────────────────┘

ChatBoot 3001 ──► PostgreSQL chatboot ──► FACTURA_API_URL (externo, no Sever.Conexa)
```

**Aislamiento de datos:** `company_id` en tablas de negocio (`001_init_schema.sql`, todos los routers de compañía).

---

## 3. Módulos

Catálogo en `modules` (`001_init_schema.sql` + `024_caja.sql`):

| Código | UI | API | Tablas | Estado global |
|--------|----|----|--------|---------------|
| `ventas` | Sí | Sí | `invoices`, docs venta | **IMPLEMENTADO** |
| `facturacion` | Sí | Sí (en ventas.js) | `dian_submissions`, etc. | **IMPLEMENTADO** |
| `caja` | Sí | Sí | `cash_*` | **IMPLEMENTADO** |
| `agenda_citas` | Sí | Sí | `appointments`, `professionals`, etc. | **IMPLEMENTADO** |
| `inventario` | Sí | Sí | `inventory_*` | **IMPLEMENTADO** |
| `contabilidad` | Sí | Sí | `accounting_*` | **IMPLEMENTADO** |
| `nomina` | No | No | No | **NO ENCONTRADO** (solo catálogo) |
| `reportes` | No | No | No | **NO ENCONTRADO** (solo catálogo) |

Módulos sin menú propio muestran **"Próximamente"** en `CompanyLayout.vue` líneas 83–88.

Además existen (fuera de `modules`): **sitio público**, **panel admin**, **soporte**, **usuarios/permisos**.

---

## 4. Funcionalidades

### Inventario funcional por área

#### VENTAS

| Funcionalidad | Qué hace | Evidencia | Estado | Valor cliente |
|---------------|----------|-----------|--------|---------------|
| Cotizaciones | Crear, confirmar, PDF, enviar al cliente | `VentasPage.vue` tab `cotizaciones`; `POST /documents` | IMPLEMENTADO | Propuesta comercial formal |
| Prefacturas | Igual flujo, conversión a factura | tab `prefacturas`; `POST /documents/:id/convert` | IMPLEMENTADO | Puente venta → factura |
| Conversión a factura | Documento → factura | `ventas.js` `/documents/:id/convert` | IMPLEMENTADO | Un solo dato comercial |
| Variables ventas | Prefijo códigos servicios | `ConfigVentasPage.vue` tab `variables`; `company_system_variables` | IMPLEMENTADO | Numeración consistente |

#### CLIENTES

| Funcionalidad | Qué hace | Evidencia | Estado | Valor cliente |
|---------------|----------|-----------|--------|---------------|
| CRUD clientes | Alta/edición con campos DIAN | `ConfigVentasPage.vue`, `ClientFormFields.vue`; tabla `clients` (`005_agenda_citas.sql`, `009_client_dian_fields.sql`) | IMPLEMENTADO | Base única para ventas/agenda/caja |
| Lookup DIAN adquiriente | Consulta datos en DIAN | `GET .../clients/dian-lookup`; `dian-acquirer.js` | IMPLEMENTADO | Menos errores de habilitación |
| Catálogo DANE | Depto/municipio | `dane_departments`, `dane_cities`; `GET /catalog/cities` | IMPLEMENTADO | Datos válidos para FE |
| Servicios | Catálogo precio/duración | tabla `services`; CRUD en ventas y agenda | IMPLEMENTADO | Catálogo comercial compartido |

#### FACTURACIÓN / DIAN

| Funcionalidad | Qué hace | Evidencia | Estado | Valor cliente |
|---------------|----------|-----------|--------|---------------|
| Resoluciones DIAN | Numeración autorizada | `dian_resolutions`; `ConfigVentasPage.vue` tab `resolutions` | IMPLEMENTADO | Cumplimiento legal |
| Certificado .p12 | Subida y sync ServerFEpos | `dian-certificate.js`; `POST /dian-certificate` | IMPLEMENTADO | Firma válida |
| Emisión factura | borrador → emitida | `PATCH /invoices/:id/emit` | IMPLEMENTADO | Control antes de DIAN |
| UBL 2.1 | Generación XML | `ubl-invoice.js` | IMPLEMENTADO | Estándar DIAN |
| Envío DIAN | Firma + SOAP | `fepos-client.js` → `ServerFEpos` `POST /factura` | IMPLEMENTADO | Transmisión oficial |
| Seguimiento envíos | Intentos, refresh, detalle | `dian_submissions`; `DianSubmissionsPanel.vue`; `FacturacionPage.vue` tab `dian-tracking` | IMPLEMENTADO | Saber si aprobó/rechazó |
| Notas crédito | Crear, emitir, anular | `ubl-credit-note.js`; tab `credit-notes` | IMPLEMENTADO | Anulación normativa |
| PDF factura | Con logo empresa | `invoice-pdf.js` | IMPLEMENTADO | Entrega al cliente |
| Paquete cliente | PDF + AttachedDocument | `invoice-delivery.js`; `GET /client-package` | IMPLEMENTADO | Envío completo |
| Correo SMTP | Envío por compañía | `invoice-email.js`; campos en `companies` | IMPLEMENTADO | Automatiza entrega |
| Anulación factura | Void + NC | `PATCH /invoices/:id/void` | IMPLEMENTADO | Corrección legal |

#### CAJA

| Funcionalidad | Qué hace | Evidencia | Estado | Valor cliente |
|---------------|----------|-----------|--------|---------------|
| Cajas (puntos de cobro) | CRUD | `CajaPage.vue` tab `cajas`; `cash_registers` | IMPLEMENTADO | Multi-caja |
| Apertura/cierre sesión | Saldo, arqueo | `POST /sessions/open`, `/close`; `cash_sessions` | IMPLEMENTADO | Control diario |
| Recibos ingreso/egreso | Borrador → confirmado | `cash_receipts`; `CajaPage.vue` tab `operacion` | IMPLEMENTADO | Registro de cobros |
| Formas de pago | efectivo, tarjetas, transferencia, otro | `PAYMENT_METHODS` en `caja.js` | IMPLEMENTADO | Arqueo por método |
| Usuario asignado a caja | Restricción operador | `users.cash_register_id`; `loadUserCashContext` | IMPLEMENTADO | Responsabilidad |
| PDF arqueo/recibo | Impresión | `caja-arqueo-pdf.js`, `CashReceiptPrint.vue` | IMPLEMENTADO | Cierre documentado |
| Facturar recibo | Recibo → factura | `POST /receipts/:id/invoice` | IMPLEMENTADO | Cobro → FE |

#### INVENTARIO

| Funcionalidad | Qué hace | Evidencia | Estado | Valor cliente |
|---------------|----------|-----------|--------|---------------|
| Bodegas | CRUD, prefijo documental | `ConfigInventarioPage.vue`; `inventory_warehouses` | IMPLEMENTADO | Multi-bodega |
| Artículos y tipos | Catálogo | `inventory_articles`, `inventory_article_types` | IMPLEMENTADO | Maestro de productos |
| Movimientos entrada/salida | Borrador → confirmado → anular | `InventarioPage.vue`; `inventory_movements` | IMPLEMENTADO | Kardex |
| Lotes internos/proveedor | Trazabilidad | `inventory_lots`; `030_inventario.sql` | IMPLEMENTADO | Control por lote |
| Existencias | Saldos por bodega/lote | tab `existencias`; `inventory_lot_balances` | IMPLEMENTADO | Stock actual |
| Reportes PDF/Excel | Movimientos y existencias | `inventario-report-pdf.js`, `export-excel` endpoints | IMPLEMENTADO | Información exportable |
| Facturar movimiento | Movimiento → factura | `POST /movements/:id/create-invoice`; `inventory-invoice.js` | IMPLEMENTADO | Venta desde bodega |

#### AGENDA

| Funcionalidad | Qué hace | Evidencia | Estado | Valor cliente |
|---------------|----------|-----------|--------|---------------|
| Profesionales | CRUD | `AgendaPage.vue` tab `professionals`; `professionals` | IMPLEMENTADO | Quién atiende |
| Modelos de horario | Plantillas + programación | tab `models`; `schedule_templates` | IMPLEMENTADO | Cupos disponibles |
| Citas | Agendar, cumplir, reagendar | `appointments`; `POST /appointments` | IMPLEMENTADO | Operación de citas |
| Facturar cita | Cita cumplida → factura | `POST /appointments/:id/invoice` | IMPLEMENTADO | Servicio → FE |
| Listado facturado | Tickets del día | tab `billing`; `GET /tickets/daily` | IMPLEMENTADO | Control de lo cobrado |

#### CONTABILIDAD

| Funcionalidad | Qué hace | Evidencia | Estado | Valor cliente |
|---------------|----------|-----------|--------|---------------|
| Plan de cuentas (PUC) | CRUD, import/export Excel | `ConfigContabilidadPage.vue`; `accounting_accounts` | IMPLEMENTADO | Libro propio |
| Comprobantes / tipos | Catálogo | `accounting_voucher_types` | IMPLEMENTADO | Clasificación asientos |
| Movimiento diario | Asientos borrador → contabilizar | `ContabilidadPage.vue`; `accounting_journal_entries` | IMPLEMENTADO | Registro contable |
| Centros de costo | CRUD | tab `centros-costo` | IMPLEMENTADO | Análisis por área |
| Periodos | Abiertos/cerrados | `accounting_periods` | IMPLEMENTADO | Control mensual |
| Impuestos | Tasas, clases | `035_accounting_taxes.sql` | IMPLEMENTADO | Config fiscal contable |
| Cierre de mes | Saldos cuenta/tercero/factura | `accounting-period-close.js`; tab `cierre` | IMPLEMENTADO | Cierre formal |
| Reportes contables | Balance prueba, auxiliares, general | `ReportesContabilidadPage.vue`; `/reports/*` | IMPLEMENTADO | Informes legales básicos |
| Asientos desde ventas/caja/inventario | Automático | enum `accounting_journal_source` incluye `ventas\|caja\|inventario` pero default `'manual'`; sin productor en JS | PREPARADO | Integración futura |

#### USUARIOS, ROLES, PERMISOS

| Funcionalidad | Qué hace | Evidencia | Estado | Valor cliente |
|---------------|----------|-----------|--------|---------------|
| Roles | super_admin, company_admin, user | `001_init_schema.sql` enum `user_role` | IMPLEMENTADO | Gobierno de acceso |
| Permisos granulares | ~60+ códigos por módulo | `permissions`, `user_permissions`; `requirePermission` | IMPLEMENTADO | Cajero ≠ facturador |
| Login multi-compañía | Mismo email, distinto slug | `LoginPage.vue`; `loginCompany` en `auth.js` | IMPLEMENTADO | Grupos multi-NIT |
| Gestión usuarios | CRUD + permisos | `UsersPage.vue`, `UserFormPage.vue` | IMPLEMENTADO | Autogestión tenant |

#### ADMIN PLATAFORMA

| Funcionalidad | Qué hace | Evidencia | Estado | Valor cliente |
|---------------|----------|-----------|--------|---------------|
| CRUD compañías | Alta, logo, tema, slug | `CompanyFormPage.vue`; `/api/admin/companies` | IMPLEMENTADO | Onboarding SaaS |
| Módulos por contrato | Toggle por empresa | `CompanyModulesPage.vue`; `company_modules` | IMPLEMENTADO | Venta modular |
| CMS sitio web | Misión, visión, beneficios | `SiteContentPage.vue`; `site_content` | IMPLEMENTADO | Marketing editable |
| Paquetes comerciales | Precios en landing | `PlansPage.vue`; `subscription_plans` | PARCIAL | Se muestran pero **no activan módulos** (sin `plan_id` en `companies`) |
| Soporte global | Tickets de tenants | `SupportTicketsPage.vue` | IMPLEMENTADO | Operación ConexaSoft |

#### SOPORTE TENANT

| Funcionalidad | Qué hace | Evidencia | Estado | Valor cliente |
|---------------|----------|-----------|--------|---------------|
| Tickets soporte/requerimiento/error | Crear, conversar | `SupportPage.vue`; `support_tickets` | IMPLEMENTADO | Canal formal |

#### NÓMINA / REPORTES (módulo)

| Funcionalidad | Evidencia | Estado |
|---------------|-----------|--------|
| Nómina | Fila en `modules`; menú "Próximamente" | **NO ENCONTRADO** |
| Reportes analíticos globales | Fila en `modules`; menú "Próximamente" | **NO ENCONTRADO** |

#### DASHBOARD

| Funcionalidad | Qué hace | Evidencia | Estado | Valor cliente |
|---------------|----------|-----------|--------|---------------|
| Dashboard compañía | Cuenta usuarios y módulos activos | `DashboardPage.vue`; `GET /api/dashboard` | PARCIAL | Bienvenida, no decisión |
| Dashboard admin | Cuenta compañías activas | `admin/DashboardPage.vue` | PARCIAL | Resumen operador |

---

### Pantallas frontend (49 `.vue` en `ErpConexa/src`)

**Público:** `LandingPage.vue`, `PublicLayout.vue`

**Auth:** `LoginPage.vue`, `admin/LoginPage.vue`, `LoginPageShell.vue`

**Compañía (ERP):**

| Ruta | Pantalla | Tabs principales |
|------|----------|------------------|
| `/dashboard` | `DashboardPage.vue` | — |
| `/ventas` | `VentasPage.vue` | cotizaciones, prefacturas |
| `/ventas/configuracion` | `ConfigVentasPage.vue` | resolutions, clients, services, variables |
| `/facturacion` | `FacturacionPage.vue` | invoices, credit-notes, dian-tracking |
| `/caja` | `CajaPage.vue` | operacion, cajas, historial |
| `/agenda` | `AgendaPage.vue` | agenda, professionals, services, clients, models, billing |
| `/inventario` | `InventarioPage.vue` | movimientos, existencias |
| `/inventario/configuracion` | `ConfigInventarioPage.vue` | bodegas, articulos, tipos, variables |
| `/contabilidad` | `ContabilidadPage.vue` | movimientos, cierre |
| `/contabilidad/configuracion` | `ConfigContabilidadPage.vue` | cuentas, comprobantes, centros-costo, periodos, impuestos |
| `/contabilidad/reportes` | `ReportesContabilidadPage.vue` | balance-prueba, libros-auxiliares, balance-general |
| `/users` | `UsersPage.vue`, `UserFormPage.vue` | — |
| `/soporte` | `SupportPage.vue` | — |

**Admin:** `CompaniesPage`, `CompanyFormPage`, `CompanyModulesPage`, `PermissionsPage`, `SiteContentPage`, `PlansPage`, `SupportTicketsPage`, `DashboardPage`

**Componentes clave:** `DianSubmissionsPanel.vue`, `InvoicePdfDialog.vue`, `ClientFormFields.vue`, `CajaArqueoPdfDialog.vue`

---

### Endpoints API principales (Sever.Conexa)

**Público** (`public.js`): `GET /site`, `GET /plans`, `POST /contact`

**Auth:** `POST /api/auth/login`, `GET /api/dashboard`

**Admin** (`index.js`): companies, modules, permissions, site, plans, contact-messages, support/tickets

**Compañía** (prefijo `/api/company/`):

| Prefijo | Endpoints (conteo aprox.) | Archivo |
|---------|---------------------------|---------|
| `/ventas/*` | ~46 | `ventas.js` |
| `/caja/*` | ~25 | `caja.js` |
| `/inventario/*` | ~31 | `inventario.js` |
| `/contabilidad/*` | ~35 | `contabilidad.js` + `contabilidad-journal.js` |
| `/agenda/*` | ~19 | `agenda.js` |
| `/support/*` | 4 | `support.js` |
| `/users/*` | 6 | `users.js` |
| `/catalog/*` | 2 | `catalog.js` (DANE) |

**ServerFEpos:** `GET /health`, `POST /factura`, `POST /firmar`, `GET /adquiriente`, `GET /estado/:zipKey`

**ChatBoot:** `GET/POST /webhook` (Meta WhatsApp)

---

### Tablas principales (migraciones)

| Dominio | Tablas clave | Migración |
|---------|--------------|-----------|
| Core | `companies`, `modules`, `company_modules`, `users` | 001 |
| Permisos | `permissions`, `user_permissions` | 004 |
| Agenda/clientes | `clients`, `services`, `professionals`, `appointments` | 005 |
| Ventas/FE | `invoices`, `invoice_details`, `dian_resolutions`, `dian_submissions` | 006, 008 |
| DIAN config | campos en `companies`, certificado, secuencias | 012–023 |
| Caja | `cash_registers`, `cash_sessions`, `cash_receipts` | 024–027 |
| Inventario | `inventory_*` (10 tablas) | 030–032 |
| Contabilidad | `accounting_*` (12+ tablas) | 033–036 |
| Sitio/soporte | `site_content`, `subscription_plans`, `support_tickets` | 037 |
| DANE | `dane_departments`, `dane_cities` | 010 |

---

## 5. Multiempresa

| Aspecto | Evidencia | Estado |
|---------|-----------|--------|
| Tenant por `company_id` | Todas las tablas de negocio | IMPLEMENTADO |
| Módulos contratados | `company_modules.is_enabled` | IMPLEMENTADO |
| JWT con `companyId` | `middleware/auth.js`, `loginCompany` | IMPLEMENTADO |
| Slug en login | `companies.slug`; `LoginPage.vue` | IMPLEMENTADO |
| Tema/logo por empresa | `007_company_theme.sql`, upload logo | IMPLEMENTADO |
| Certificado DIAN por tenant | `ServerFEpos/cert/companies/` | IMPLEMENTADO |
| Planes comerciales → módulos | `subscription_plans.module_codes` sin enlace a `companies` | PREPARADO |
| Base de datos separada por tenant | Una sola DB `Conexa` | No (modelo SaaS lógico) |

**Valor comercial:** operar varias NITs, vender por módulos, white-label visual.

---

## 6. Seguridad

Evidencia en `middleware/auth.js`, `permissions.js`, `dian-certificate.js` (`encryptSecret`), `ErpConexa/index.html` (CSP).

| Control | Estado |
|---------|--------|
| JWT + roles + permisos por endpoint | IMPLEMENTADO |
| bcrypt passwords | IMPLEMENTADO |
| SQL parametrizado | IMPLEMENTADO |
| Aislamiento `company_id` del token | IMPLEMENTADO |
| Secretos DIAN/SMTP cifrados AES | IMPLEMENTADO |
| Rate limiting / 2FA / JWT blacklist | NO ENCONTRADO |
| Sesión persistente en localStorage | IMPLEMENTADO (documentado en `SEGURIDAD.md`) |

---

## 7. Integraciones

| Integración | Evidencia | Estado |
|-------------|-----------|--------|
| DIAN (SOAP) | ServerFEpos + Sever.Conexa | IMPLEMENTADO |
| SMTP por compañía | nodemailer, `invoice-email.js` | IMPLEMENTADO |
| DANE (deptos/municipios) | `010_dane_locations.sql` | IMPLEMENTADO |
| Excel import/export | exceljs en contabilidad e inventario | IMPLEMENTADO |
| WhatsApp Meta | ChatBoot `whatsapp.js`, webhook | PARCIAL (aislado) |
| Pasarelas pago, bancos, SIIGO/Helisa, OpenAI | Búsqueda en repo | NO ENCONTRADO |

---

## 8. DIAN

Resumen de facturación electrónica:

- **IMPLEMENTADO:** UBL 2.1, firma, ZIP, envío, CUFE, seguimiento, NC, adquiriente, PDF, AttachedDocument, correo, ambientes hab/prd.
- **NO ENCONTRADO:** nómina electrónica, documento soporte, POS electrónico, RADIAN.
- **Dependencia crítica:** ServerFEpos debe estar activo (`pingFePos` en `fepos-client.js`).

Ver detalle en sección 4 (Facturación / DIAN).

---

## 9. Datos y reportes

| Capacidad | Estado |
|-----------|--------|
| Reportes contables (3 tipos) | IMPLEMENTADO |
| Reportes inventario PDF/Excel | IMPLEMENTADO |
| PDFs operativos (factura, cotización, caja) | IMPLEMENTADO |
| Históricos (citas, caja, DIAN) | IMPLEMENTADO |
| Dashboard KPIs ventas/inventario | NO ENCONTRADO |
| Gráficos / BI | NO ENCONTRADO |
| Alertas stock/vencimiento | NO ENCONTRADO |
| Módulo "Reportes" global | NO ENCONTRADO |

---

## 10. Automatización

| Capacidad | Estado |
|-----------|--------|
| Conversión operación → factura (cita/caja/inventario/venta) | IMPLEMENTADO (acción usuario) |
| Numeración automática (interna, DIAN, lotes) | IMPLEMENTADO |
| Envío DIAN + correo tras acción | IMPLEMENTADO |
| Cierre contable calculado | IMPLEMENTADO |
| Workflows, cron, colas, reglas | NO ENCONTRADO |
| Asientos contables automáticos | PREPARADO (enum sin código) |
| ChatBoot facturación WhatsApp | PREPARADO (no cableado a ERP) |

---

## 11. IA

Búsqueda en todo el repo de `openai`, `chatgpt`, `tensorflow`, `langchain`, `machine learning`, `predicción`, `embedding`: **0 coincidencias**.

| Capacidad | Estado |
|-----------|--------|
| Modelos de IA / LLM | NO ENCONTRADO |
| ChatBoot | Árbol de estados (`ChatBoot/src/bot/states.js`), **no es IA** |
| Tagline "Gestión inteligente" | Copy en `brand-assets.js` — **no evidencia técnica** |

---

## 12. Problemas que resuelve

1. Facturación DIAN desconectada del día a día → un flujo desde caja/cita/inventario/venta.
2. Numeración y resolución desordenadas → `dian_resolutions` por compañía.
3. Incertidumbre post-envío DIAN → `dian_submissions` + panel seguimiento.
4. Entrega manual al cliente → PDF + XML por SMTP.
5. Caja sin control → sesiones, arqueo, formas de pago, usuario asignado.
6. Inventario sin trazabilidad → bodegas, lotes, movimientos, existencias.
7. Agenda y facturación en silos → facturar cita cumplida.
8. Datos mezclados entre empresas → multi-tenant `company_id`.
9. Acceso indiscriminado → permisos por acción en API.
10. Clientes con datos DIAN incompletos → campos normativos + lookup + DANE.
11. Contabilidad externa sin PUC propio → módulo contable con cierre y reportes (manual respecto a operación).
12. Soporte informal → tickets integrados.

---

## 13. Cliente objetivo

**Evidencia en código (no sectores inventados):**

- **País:** Colombia (DIAN, DANE, UBL, COP, NIT/DV en todo el stack).
- **Tamaño:** PYME — badge landing "ERP modular para PYMES" (`LandingPage.vue`); planes seed 3/10/∞ usuarios (`037_public_site_support.sql`).
- **Operación:** venta de servicios y/o productos con necesidad de FE; opcional caja, citas, inventario.
- **Complejidad:** media — no hay manufactura, MRP, ni consolidación multi-país.
- **Multi-NIT:** grupos pequeños o operadores (slug login, panel admin).
- **No hay vertical de sector** codificado; icono `medical_services` en agenda sugiere servicios profesionales, no un producto de salud.

---

## 14. Diferenciadores

1. **FE DIAN integrada al flujo operativo** — no add-on (`ubl-invoice.js`, `FacturacionPage.vue`).
2. **Operación → factura** desde 4 frentes (`agenda.js`, `caja.js`, `inventory-invoice.js`, `ventas.js`).
3. **Trazabilidad DIAN** por intento (`dian_submissions`, `DianSubmissionsPanel.vue`).
4. **Localización colombiana profunda** (DANE, NIT, adquiriente, responsabilidades fiscales).
5. **SaaS multi-compañía real** (`company_modules`, slug, tema).
6. **Permisos granulares en API** (`requirePermission` en cada router).
7. **White-label** (logo + colores en UI y PDF).
8. **ConexaSoft usa su propio ERP** (`029_conexasoft_company.sql`).
9. **Contabilidad con cierre y reportes** embebida (`accounting-period-close.js`).
10. **Soporte y CMS en plataforma** (`support_tickets`, `site_content`).

**No son diferenciadores hoy:** IA, WhatsApp integrado, BI, nómina.

---

## 15. Capacidades actuales

### A. ¿Qué es realmente ConexaSoft?

Empresa desarrolladora y operadora SaaS; también es tenant de su propio ERP (`029_conexasoft_company.sql`).

### B. ¿Qué es realmente ErpConexa?

ERP multi-compañía modular; núcleo ventas + FE DIAN + operación conectada (caja, agenda, inventario, contabilidad).

### C. ¿Qué problemas empresariales resuelve?

Ver sección 12.

### D. ¿Cuál parece ser el cliente objetivo?

PYME colombiana con obligación o necesidad de FE; operación comercial simple-media; posible multi-NIT.

### E. ¿Cuáles son los 10 principales diferenciadores?

Ver sección 14.

### Comunicables HOY (F)

- ERP modular multi-compañía para PYMES colombianas.
- Ventas: cotizaciones, prefacturas, conversión a factura.
- Facturación electrónica DIAN (emisión, envío, seguimiento, notas crédito, PDF, correo).
- Caja con apertura, arqueo y facturación de recibos.
- Agenda de citas con facturación.
- Inventario con bodegas, lotes, movimientos, existencias, reportes.
- Contabilidad: PUC, asientos, cierre, balances.
- Permisos por rol y acción.
- Identidad visual por empresa.
- Soporte por tickets.

### NO prometer todavía (G)

- "Inteligencia" / IA / predicciones.
- WhatsApp como canal del ERP.
- Nómina.
- Módulo "Reportes" analítico global.
- "Todo queda contabilizado automáticamente".
- "Inventario en tiempo real" como dashboard live.
- Planes que auto-activan módulos al contratar.
- Compras, cartera operativa, conciliación bancaria.
- Integraciones con SIIGO, bancos, pasarelas.
- POS electrónico, documento soporte, nómina electrónica DIAN.

### Documentación vs realidad

| Aparece en docs/catálogo | Realidad en código |
|--------------------------|-------------------|
| Módulo `nomina` en `001_init_schema.sql` | Sin UI, API ni tablas |
| Módulo `reportes` en `001_init_schema.sql` | Sin UI; reportes solo embebidos |
| `accounting_journal_source` ventas/caja/inventario | Enum existe; asientos son `manual` |
| Planes con `module_codes` | No hay `plan_id` en `companies` |
| README: ChatBoot en ecosistema | Proyecto separado, otra DB, API externa genérica |
| Tagline "Gestión inteligente" | Sin IA en código |
| `SEGURIDAD.md`: mejoras planificables (rate limit, etc.) | No implementadas |

---

## 16. Capacidades futuras

### Oportunidades de producto (H)

1. Dashboard operativo (ventas, DIAN, caja, stock).
2. Contabilización automática desde operación (enum ya preparado).
3. Integrar ChatBoot con `/api/company/ventas`.
4. Módulo nómina.
5. Compras / proveedores (hoy solo tipo movimiento inventario).
6. Cartera/CXC operativa.
7. Alertas (vencimiento lotes, rechazos DIAN).
8. Aprovisionamiento planes → `company_modules`.
9. API pública para integradores.
10. Documentos DIAN adicionales (soporte, POS, nómina electrónica).

---

## 17. Posicionamiento

### I. ¿Cómo debería posicionarse ConexaSoft?

**Recomendación:** **Concepto 1 (ERP con FE integrada)** — es el único 100% respaldado por código. El concepto 3 (inteligente) **no debe usarse** hoy.

---

### Tres conceptos de posicionamiento

#### 1. Conexa como ERP

| | |
|---|---|
| **Slogan** | Operar y facturar, en un solo sistema. |
| **Concepto** | ERP modular colombiano donde ventas, caja, agenda, inventario y contabilidad comparten clientes y desembocan en factura DIAN. |
| **Promesa** | Dejar Excel y el facturador suelto; un solo lugar para operar y cumplir. |
| **Ventajas** | Honesto, alineado al producto, fácil de demostrar. |
| **Riesgos** | Suena genérico ("otro ERP"); hay que mostrar el flujo operativo → FE. |
| **Lo respalda hoy** | 6 módulos implementados, 49 pantallas, ~170 endpoints, multi-tenant, permisos, PUC, caja, agenda, inventario, FE completa. |

#### 2. Conexa como ecosistema empresarial

| | |
|---|---|
| **Slogan** | Una plataforma, cada empresa conectada. |
| **Concepto** | Ecosistema de servicios (ERP + FE + admin + soporte + sitio) para operar varias empresas desde un operador central. |
| **Promesa** | Conectar procesos y compañías sin mezclar datos. |
| **Ventajas** | Explica monorepo real (5 proyectos), panel admin, multi-NIT, CMS, tickets. |
| **Riesgos** | "Ecosistema" puede sonar más grande de lo que es; ChatBoot no está integrado; no hay APIs abiertas. |
| **Lo respalda hoy** | Sever.Conexa + ErpConexa + ServerFEpos + admin panel + `company_modules` + soporte + landing CMS. **No respalda:** WhatsApp integrado, integraciones terceros, automatización de plataforma. |

#### 3. Conexa como plataforma empresarial inteligente

| | |
|---|---|
| **Slogan** | Gestión inteligente para empresas reales. *(texto actual en `brand-assets.js`)* |
| **Concepto** | Plataforma que conecta operación, datos e inteligencia para decidir mejor. |
| **Promesa** | Más que un ERP: insights y automatización inteligente. |
| **Ventajas** | Suena moderno; el tagline ya existe. |
| **Riesgos** | **Alto:** no hay IA, no hay BI, no hay dashboard analítico, ChatBoot no es IA. Prometer esto hoy es **vender humo**. |
| **Lo respalda hoy** | Casi nada: tagline y copy CMS. Automatización limitada a "hecho → factura". **No respalda:** IA, predicción, recomendaciones, datos analíticos. |

**Recomendación:** adoptar **Concepto 1** como principal; usar elementos del **Concepto 2** solo para multi-NIT y operador; **descartar Concepto 3** hasta tener dashboard + al menos una capacidad analítica demostrable.

---

## 18. Recomendaciones para la marca

1. **Separar marcas:** ConexaSoft = empresa; ErpConexa = producto (`package.json` aún dice solo ErpConexa).
2. **Dejar de decir "inteligente"** como atributo técnico hasta que exista evidencia en código.
3. **Protagonismo comercial:** flujo operación → factura DIAN; seguimiento DIAN; multiempresa.
4. **Ocultar o marcar "Próximamente"** nómina y reportes en comunicación externa (ya lo hace el menú interno).
5. **Landing:** mostrar módulos reales, flujo conectado, alinear color azul corporativo (`conexasoft-brand.js` vs teal de `LandingPage.vue`).
6. **No prometer WhatsApp** hasta integrar ChatBoot con Sever.Conexa.
7. **Planes:** comunicar precios solo si son comerciales reales; aclarar que la activación de módulos es manual hoy.
8. **Credibilidad:** "Facturamos con lo que vendemos" — ConexaSoft es tenant (`029_conexasoft_company.sql`).
9. **Prioridad producto antes de ampliar marca:** dashboard mínimo + contabilización automática + cablear o silenciar ChatBoot.
10. **Posicionamiento ganador:** *ERP colombiano donde operar y cumplir con la DIAN es el mismo flujo.*

---

*Análisis exclusivamente de lectura. Evidencia en fuentes bajo `C:\DevConexa`. No se modificó código de aplicación.*
