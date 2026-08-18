# Permisos del sistema

## Tablas

| Tabla | Descripción |
|-------|-------------|
| `permissions` | Catálogo de permisos (se amplía según avanza el desarrollo) |
| `user_permissions` | Permisos asignados a cada usuario por compañía |

## Estructura de un permiso

| Campo | Ejemplo |
|-------|---------|
| `code` | `ventas.crear` |
| `name` | Crear ventas |
| `module_id` | FK al módulo (NULL = permiso de sistema) |

## Permisos iniciales

### Sistema
- `usuarios.ver`, `usuarios.crear`, `usuarios.editar`, `usuarios.permisos`

### Por módulo
- `{modulo}.acceso` — ingresar al módulo
- Operaciones específicas según módulo (crear, editar, emitir, etc.)

## Agregar nuevos permisos

Insertar en `permissions` vinculados al `module_id` correspondiente:

```sql
INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.anular', 'Anular ventas', 'Anular documentos de venta', id, 13
FROM modules WHERE code = 'ventas'
ON CONFLICT (code) DO NOTHING;
```

Los clientes asignan permisos desde **Usuarios y permisos** en el panel de la compañía.
