# Arquitectura ErpConexa

## Proyectos del ecosistema

| Proyecto | Descripción | Puerto |
|----------|-------------|--------|
| **ErpConexa** | Frontend Quasar/Vue | 9500 |
| **Sever.Conexa** | API REST + PostgreSQL | 3500 |
| **Scripts** | Migraciones SQL y documentación | — |
| **ChatBoot** | Chatbot WhatsApp / Meta | 3001 |
| **ServerFEpos** | Facturación electrónica DIAN | — |

## Módulo Ventas (006)

Tablas en `Scripts/database/006_ventas_facturacion.sql`:

| Tabla | Uso |
|-------|-----|
| `clients`, `services` | Catálogo compartido con agenda |
| `dian_resolutions` | Resolución DIAN y numeración |
| `invoices` | Encabezado factura |
| `invoice_details` | Detalle por línea |
| `dian_submissions` | Envío y respuesta DIAN |

Ruta frontend: `/ventas` — API: `/api/company/ventas/*`

## Modelo multi-compañía

Cada compañía es un **tenant** aislado por `company_id`. Los datos de negocio siempre se filtran por la compañía del usuario autenticado.

### Roles

| Rol | `company_id` | Acceso |
|-----|--------------|--------|
| `super_admin` | `NULL` | Panel `/admin` — crea compañías, asigna módulos |
| `company_admin` | UUID | Administra su compañía |
| `user` | UUID | Usa módulos habilitados en su compañía |

### Rutas del frontend

- `/login` — Login de usuarios de compañía
- `/dashboard` — Dashboard de la compañía
- `/admin/login` — Login del administrador del sistema
- `/admin/dashboard` — Panel administrativo
- `/admin/companies` — Gestión de compañías y módulos

### API

- `POST /api/admin/auth/login` — Login super admin
- `GET  /api/admin/companies` — Listar compañías
- `POST /api/admin/companies` — Crear compañía
- `PUT  /api/admin/companies/:id/modules` — Asignar módulos
- `POST /api/auth/login` — Login usuario de compañía
- `GET  /api/dashboard` — Dashboard (filtrado por tenant)

## Base de datos

PostgreSQL con esquema en `Scripts/database/`.

```bash
# Crear la base de datos en PostgreSQL local
createdb Conexa

# Ejecutar migraciones
cd Sever.Conexa
npm run db:migrate
```

> **Desarrollo diario:** PostgreSQL local (rápido, sin Docker).  
> **Fin de jornada:** `.\Scripts\docker-up.ps1` levanta PostgreSQL en Docker para pruebas integradas.
