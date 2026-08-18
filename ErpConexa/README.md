# ErpConexa

Frontend del ERP multi-compañía construido con Quasar y Vue 3.

## Requisitos

- Node.js >= 18 (recomendado >= 22.22 para Quasar CLI v3)
- Server.Conexa corriendo en puerto 3500

## Inicio rápido

```bash
npm install --ignore-scripts
npx quasar prepare
npm run dev
```

La app corre en `http://localhost:9500`.

## Rutas

| Ruta | Descripción |
|------|-------------|
| `/login` | Login de usuarios de compañía |
| `/dashboard` | Dashboard de la compañía |
| `/admin/login` | Login del administrador del sistema |
| `/admin/dashboard` | Panel administrativo |
| `/admin/companies` | Gestión de compañías |
| `/admin/companies/create` | Crear nueva compañía |

## Variables de entorno

```
VITE_API_URL=http://localhost:3500
```
