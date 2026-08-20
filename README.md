# DevConexa

Monorepo del ecosistema Conexa: ERP, API, facturación electrónica DIAN y chatbot WhatsApp.

## Proyectos

| Carpeta | Descripción | Puerto |
|---------|-------------|--------|
| [ErpConexa](./ErpConexa) | Frontend Quasar/Vue 3 | 9500 |
| [Sever.Conexa](./Sever.Conexa) | API REST multi-compañía | 3500 |
| [ServerFEpos](./ServerFEpos) | Facturación electrónica DIAN | 3000 |
| [ChatBoot](./ChatBoot) | Chatbot WhatsApp / Meta | 3001* |
| [Scripts](./Scripts) | Migraciones SQL y documentación | — |

\* ChatBoot usa el puerto 3001 en desarrollo para no chocar con ServerFEpos (3000). Configúralo en `ChatBoot/.env`.

## Requisitos

- Node.js >= 18 (recomendado >= 22 para ErpConexa)
- PostgreSQL instalado localmente (desarrollo diario)
- Docker Desktop (solo pruebas de fin de jornada)
- Cursor o VS Code

## Flujo de trabajo

### Durante el día (rápido, sin Docker)

Usamos **PostgreSQL local** + servicios Node directos. No levantamos Docker para no perder tiempo.

```powershell
# Setup inicial (una vez)
.\Scripts\setup.ps1

# Cada mañana / al empezar a codear
.\Scripts\dev.ps1 -Profile erp
```

Configura `Sever.Conexa/.env` con tu PostgreSQL local:

```
DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/Conexa
```

### Fin de jornada (pruebas integradas con Docker)

Al cerrar el día, subimos PostgreSQL a Docker y probamos el stack completo:

```powershell
# 1. Levanta PostgreSQL en Docker + migraciones
.\Scripts\docker-up.ps1

# 2. Cambia temporalmente DATABASE_URL en Sever.Conexa/.env a:
#    postgresql://postgres:postgres@localhost:5432/Conexa

# 3. Inicia servicios y prueba
.\Scripts\dev.ps1 -Profile erp

# 4. Al terminar
.\Scripts\docker-down.ps1
#    Restaura DATABASE_URL local en .env
```

## Inicio rápido

### 1. Abrir el workspace

```
Archivo → Abrir workspace desde archivo → DevConexa.code-workspace
```

### 2. Configuración inicial

```powershell
.\Scripts\setup.ps1
```

Instala dependencias, crea `.env` donde falte y migra contra PostgreSQL **local**.

Opcional (solo si quieres Docker desde el inicio):

```powershell
.\Scripts\setup.ps1 -WithDocker
```

## URLs de desarrollo

| Servicio | URL |
|----------|-----|
| Frontend ERP | http://localhost:9500 |
| API | http://localhost:3500 |
| Facturación DIAN | http://localhost:3000 |
| ChatBoot | http://localhost:3001 |

## Credenciales admin (ERP)

| Campo | Valor |
|-------|-------|
| Email | admin@conexa.com |
| Contraseña | Admin123! |

Panel admin: http://localhost:9500/admin/login

## Base de datos

**Desarrollo diario:** PostgreSQL local, base de datos `Conexa`.

```powershell
cd Sever.Conexa
npm run db:migrate
```

**Fin de jornada:** Docker (`docker-compose.yml`) solo para PostgreSQL.

Esquema SQL de referencia en `Scripts/database/`.

## Documentación

- [Arquitectura](./Scripts/docs/ARQUITECTURA.md)
- [Permisos](./Scripts/docs/PERMISOS.md)
- [Seguridad (evaluación comercial)](./Scripts/docs/SEGURIDAD.md)
- README por proyecto en cada carpeta
