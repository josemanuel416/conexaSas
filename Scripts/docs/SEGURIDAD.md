# Seguridad — ConexaSoft / DevConexa

Documento orientado a evaluación técnica y comercial del ecosistema **ConexaSoft** (ERP, API, facturación electrónica DIAN e integraciones).

> **Alcance:** describe controles implementados en el producto y buenas prácticas de despliegue. No sustituye un informe de auditoría externa (pentest) si el cliente lo exige contractualmente.

---

## Resumen ejecutivo

ConexaSoft es una plataforma **SaaS multi-compañía** (multi-tenant) donde:

- La **autorización real ocurre en el servidor** (API REST), no en la URL del navegador.
- Cada compañía opera en un **tenant aislado** por `company_id`.
- Las operaciones sensibles exigen **JWT válido** y, según el caso, **permisos granulares** por módulo y acción.
- Las consultas a PostgreSQL usan **parámetros enlazados** (prepared statements), mitigando inyección SQL.
- Las contraseñas se almacenan con **hash bcrypt** (factor de costo 12).

El frontend (Quasar/Vue 3) controla la experiencia de usuario y la navegación; **no es la capa de seguridad definitiva**. Cualquier intento de manipular rutas, pestañas o parámetros en la URL es ignorado o bloqueado en la API.

---

## Arquitectura de seguridad en capas

```
┌─────────────────────────────────────────────────────────────┐
│  Navegador (ErpConexa)                                      │
│  · Guards de ruta (sesión presente)                         │
│  · CSP (Content-Security-Policy)                            │
│  · Token JWT en almacenamiento local del navegador          │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (producción) + Bearer JWT
┌──────────────────────────▼──────────────────────────────────┐
│  API (Sever.Conexa)                                         │
│  · Validación JWT en cada endpoint protegido                │
│  · Roles: super_admin | company_admin | user              │
│  · Permisos granulares (requirePermission)                  │
│  · Aislamiento por company_id del token                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ Consultas parametrizadas
┌──────────────────────────▼──────────────────────────────────┐
│  PostgreSQL                                                 │
│  · Datos de negocio filtrados por tenant                    │
│  · Migraciones versionadas (Scripts/database/)              │
└─────────────────────────────────────────────────────────────┘
```

Servicios complementarios (**ServerFEpos** para DIAN, **ChatBoot** para WhatsApp) se integran por API y mantienen sus propios controles (certificados, tokens Meta, etc.).

---

## Autenticación y sesión

### Modelo

| Aspecto | Implementación |
|---------|----------------|
| Mecanismo | JWT firmado (`JWT_SECRET`) |
| Expiración | Configurable (`JWT_EXPIRES_IN`, por defecto 8 horas) |
| Contraseñas | bcrypt con cost factor 12 |
| Login compañía | `POST /api/auth/login` |
| Login administrador plataforma | `POST /api/admin/auth/login` |
| Respuesta ante credenciales inválidas | Mensaje genérico (*"Credenciales inválidas"*) |

### Persistencia al cerrar el navegador

La sesión **permanece activa** al cerrar y reabrir el navegador mientras el JWT no haya expirado. El token se guarda en `localStorage` del navegador.

| Comportamiento | Detalle |
|----------------|---------|
| Cerrar pestaña o navegador | El token **no se elimina** automáticamente |
| Reabrir la aplicación | El usuario entra directo si el token sigue vigente |
| Token expirado o inválido | La API responde **401**; el cliente limpia la sesión y redirige a login |
| Cerrar sesión manual | Se eliminan token y datos de sesión del navegador |

> **Nota para evaluadores:** la persistencia de sesión es **intencional** (mejor experiencia de usuario). La duración es **configurable por política** del cliente (por ejemplo 1 h, 4 h u 8 h). Para entornos con equipos compartidos se puede evaluar `sessionStorage` o políticas más estrictas de expiración.

### Separación de contextos

- Token de **compañía** no puede acceder a rutas `/api/admin/*` → respuesta **403**.
- Token de **super_admin** no mezcla datos de tenants en operaciones de compañía sin contexto explícito.

---

## Autorización y permisos

### Roles

| Rol | Alcance |
|-----|---------|
| `super_admin` | Panel administrativo de la plataforma (compañías, módulos, planes, soporte global) |
| `company_admin` | Administración completa dentro de su compañía |
| `user` | Acceso según permisos asignados |

### Permisos granulares

Cada acción de negocio (consultar inventario, emitir factura, cerrar periodo contable, etc.) puede exigir uno o más códigos de permiso en la API (`requirePermission`).

El administrador de compañía dispone de permisos totales (`*`) dentro de su tenant.

Documentación detallada: [PERMISOS.md](./PERMISOS.md).

---

## Protección frente a inyección SQL

Todas las consultas a PostgreSQL utilizan el driver `node-pg` con **placeholders parametrizados** (`$1`, `$2`, …). Los valores provenientes del usuario (body, query string, parámetros de ruta) **nunca se concatenan** como texto SQL ejecutable.

Ejemplos de controles:

- Login: email y contraseña como parámetros enlazados.
- Filtros dinámicos: solo se concatena estructura SQL fija; los valores van en el array de parámetros.
- Identificadores de recursos (`:id`): siempre pasados como `$1`, no interpolados en la cadena.

**Resultado esperado en pruebas de inyección:** payloads como `' OR 1=1--` o `'; DROP TABLE users;--` se tratan como texto literal y **no ejecutan** sentencias adicionales.

---

## Aislamiento multi-tenant (multi-compañía)

Cada registro de negocio pertenece a una compañía (`company_id`). En operaciones de tenant:

1. El `company_id` se obtiene del **JWT autenticado**, no del cuerpo de la petición del cliente.
2. Las consultas incluyen filtro por `company_id = $n`.
3. Acceder a un recurso de otra compañía devuelve **404** o **403**, según el endpoint.

Esto impide que un usuario autenticado de la Compañía A consulte o modifique datos de la Compañía B aunque conozca un identificador (IDOR básico mitigado).

---

## Seguridad en el frontend

| Control | Descripción |
|---------|-------------|
| Modo hash en rutas | La navegación (`#/inventario?tab=movimientos`) es client-side; no expone lógica de autorización al servidor web estático |
| Parámetro `tab` | Solo controla la pestaña visible; valores fuera de lista blanca se ignoran |
| Guards de router | Redirigen a login si no hay sesión válida en el cliente |
| Content-Security-Policy | Restringe scripts, estilos y conexiones en `index.html` |
| Manejo de 401 | Ante token inválido, limpia sesión y redirige a login |

**Importante:** manipular la URL **no otorga acceso** a datos; la API valida token y permisos en cada operación.

---

## Facturación electrónica (DIAN)

El módulo de facturación (**ServerFEpos**) maneja:

- Certificados digitales (`.p12`) almacenados fuera del repositorio.
- Firma XML y comunicación con servicios DIAN.
- Variables sensibles en archivos `.env` no versionados.

Los certificados y secretos **no se incluyen en el control de versiones** (`.gitignore` reforzado).

---

## Configuración segura en producción

Checklist mínimo para despliegue:

| Ítem | Recomendación |
|------|----------------|
| Transporte | **HTTPS** obligatorio (TLS 1.2+) |
| `JWT_SECRET` | Valor largo, único por entorno, rotación planificada |
| Base de datos | Credenciales dedicadas, acceso restringido por red |
| CORS | Orígenes explícitos (`CORS_ORIGIN`), no wildcard en producción |
| Secretos | Variables de entorno o gestor de secretos; nunca en el repositorio |
| Backups | PostgreSQL con retención y prueba de restauración |
| Logs | Registro de accesos y errores de autenticación |

En **desarrollo local** se usa `http://localhost` por conveniencia; **no representa** la configuración de producción.

---

## Pruebas de seguridad realizables

El equipo puede demostrar en un entorno de staging:

| Prueba | Resultado esperado |
|--------|-------------------|
| Acceso a API sin token | HTTP **401** |
| Token alterado o inventado | HTTP **401** |
| SQL injection en login | HTTP **401**, sin bypass |
| SQL injection en filtros/búsquedas | Sin ejecución de SQL arbitrario |
| Token de compañía en rutas admin | HTTP **403** |
| Recurso de otra compañía por ID | HTTP **404** / **403** |
| Cerrar y reabrir navegador | Sesión activa hasta expiración JWT |
| Cerrar sesión | Token eliminado; API responde **401** |

Estas pruebas son **smoke tests funcionales**. Si el cliente requiere evidencia formal, se recomienda contratar un **pentest OWASP Top 10** sobre el entorno acordado.

---

## Alineación con OWASP Top 10 (referencia)

| Categoría | Postura actual |
|-----------|----------------|
| A01 — Broken Access Control | JWT + roles + permisos + `company_id` en servidor |
| A02 — Cryptographic Failures | bcrypt, JWT firmado; HTTPS en producción |
| A03 — Injection | Consultas SQL parametrizadas |
| A04 — Insecure Design | Separación admin / tenant / módulos |
| A05 — Security Misconfiguration | `.env` no versionado; CORS configurable |
| A07 — Identification & Auth Failures | Login con mensajes genéricos; expiración JWT |
| A08 — Software & Data Integrity | Migraciones versionadas; dependencias npm |

**Mejoras planificables** según requisitos del cliente:

- Rate limiting en endpoints de login (anti fuerza bruta).
- Headers de seguridad HTTP adicionales en la API (`helmet`).
- Revocación server-side de tokens (blacklist o refresh tokens).
- Auditoría externa documentada (pentest).

---

## Gestión de secretos y cumplimiento

- Archivos `.env`, certificados DIAN y claves privadas están excluidos del repositorio Git.
- Cada compañía opera sobre la misma instancia lógica con **aislamiento de datos**, no con bases separadas por defecto (modelo SaaS estándar).
- Logs de facturación DIAN y trazabilidad de envíos disponibles en el módulo de ventas.

Para requisitos regulatorios específicos (retención de logs, residencia de datos, DPA), coordinar con el equipo comercial y técnico.

---

## Transparencia

ConexaSoft prioriza la **honestidad técnica** en evaluaciones comerciales:

- El producto **no incluye** hoy certificación ISO 27001 / SOC 2 de fábrica.
- Las pruebas internas **no sustituyen** un informe de pentest firmado por terceros.
- La sesión persistente en navegador es **comportamiento configurable**, no un defecto.
- La seguridad efectiva depende también del **despliegue** (HTTPS, secretos, red, backups).

Estamos abiertos a acompañar al cliente en evaluaciones técnicas, demos en staging y, si aplica, en un pentest acordado contractualmente.

---

## Documentación relacionada

- [Arquitectura](./ARQUITECTURA.md)
- [Permisos](./PERMISOS.md)
- [README principal del monorepo](../../README.md)

---

*ConexaSoft — Ecosistema DevConexa · Documento de seguridad para evaluación comercial*
