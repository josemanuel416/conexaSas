-- Permiso reportes contables
INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'contabilidad.reportes', 'Reportes contables', 'Balance de prueba, libros auxiliares y balance general', id, 39
FROM modules WHERE code = 'contabilidad' ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code = 'contabilidad.reportes'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
