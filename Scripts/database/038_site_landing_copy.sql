-- Copy actualizado landing ConexaSoft (misión, visión, beneficios, planes)

UPDATE site_content SET
  hero_title = 'Operar y facturar, en un solo sistema',
  hero_subtitle = 'ErpConexa conecta ventas, caja, agenda, inventario y contabilidad con facturación electrónica DIAN. Un ERP sólido hoy, preparado para la gestión inteligente del mañana.',
  mission = 'Facilitar la operación comercial de las PYMES colombianas con un ERP modular, confiable y completo — ventas, caja, agenda, inventario, contabilidad y facturación DIAN en un solo flujo — construyendo la base de datos real sobre la cual la gestión inteligente pueda aportar valor.',
  vision = 'Ser la plataforma empresarial colombiana donde las PYMES operen con orden, cumplan con la DIAN y, sobre esa base sólida, accedan a capacidades inteligentes que transformen sus datos en mejores decisiones — sin promesas vacías ni sistemas desconectados.',
  benefits = '[
    {"icon":"receipt_long","title":"Facturación DIAN integrada","description":"Emisión, envío, seguimiento, notas crédito, PDF y correo — conectado al flujo comercial, no como un sistema aparte."},
    {"icon":"sync_alt","title":"De la operación a la factura","description":"Facture desde ventas, caja, agenda o inventario con los mismos clientes y servicios, sin volver a digitar."},
    {"icon":"point_of_sale","title":"Caja con control","description":"Apertura y cierre de sesión, arqueo, formas de pago y recibos que pueden convertirse en factura electrónica."},
    {"icon":"event","title":"Agenda y servicios","description":"Profesionales, horarios, citas y facturación de servicios cumplidos en el mismo sistema."},
    {"icon":"inventory_2","title":"Inventario trazable","description":"Bodegas, artículos, lotes, movimientos y existencias con reportes exportables."},
    {"icon":"account_balance","title":"Contabilidad y reportes","description":"Plan de cuentas, movimientos, cierre de mes y balances para el control financiero."},
    {"icon":"psychology","title":"Base para gestión inteligente","description":"Datos unificados de operación, ventas e inventario — la base real sobre la que la inteligencia artificial podrá ayudar a decidir mejor."},
    {"icon":"business","title":"Multi-compañía seguro","description":"Cada empresa con datos aislados, módulos contratados, permisos granulares e identidad visual propia."},
    {"icon":"support_agent","title":"Soporte dedicado","description":"Canal formal de soporte, requerimientos y reporte de errores dentro del sistema."}
  ]'::jsonb,
  updated_at = NOW()
WHERE id = 1;

UPDATE subscription_plans SET
  description = 'Para empezar a vender y facturar con la DIAN.',
  features = '["Hasta 3 usuarios","Cotizaciones y prefacturas","Facturación electrónica DIAN","Soporte por ticket"]'::jsonb,
  updated_at = NOW()
WHERE slug = 'esencial';

UPDATE subscription_plans SET
  description = 'Operación completa: cobros, stock y citas.',
  features = '["Hasta 10 usuarios","Caja + inventario + agenda","Facturación desde la operación","Soporte prioritario"]'::jsonb,
  updated_at = NOW()
WHERE slug = 'profesional';

UPDATE subscription_plans SET
  description = 'Suite operativa y contable para crecer.',
  features = '["Usuarios ilimitados","Contabilidad y reportes","Todos los módulos activos","Implementación asistida"]'::jsonb,
  updated_at = NOW()
WHERE slug = 'empresarial';
