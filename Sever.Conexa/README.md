# Server.Conexa

API REST multi-compañía para ErpConexa.

## Requisitos

- Node.js >= 18
- PostgreSQL 14+

## Inicio rápido

```bash
# 1. Crear la base de datos en PostgreSQL local
#    createdb Conexa   (o desde pgAdmin)

# 2. Configurar variables de entorno
cp .env.example .env

# 3. Instalar dependencias
npm install

# 4. Ejecutar migraciones
npm run db:migrate

# 5. Iniciar servidor
npm run dev
```

El servidor corre en `http://localhost:3500`.

## Credenciales admin por defecto

| Campo | Valor |
|-------|-------|
| Email | admin@conexa.com |
| Contraseña | Admin123! |

Cambiar en `.env` antes de la primera migración.

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/admin/auth/login` | Login administrador |
| GET | `/api/admin/companies` | Listar compañías |
| POST | `/api/admin/companies` | Crear compañía |
| PUT | `/api/admin/companies/:id/modules` | Asignar módulos |
| POST | `/api/auth/login` | Login usuario compañía |
| GET | `/api/dashboard` | Dashboard compañía |
