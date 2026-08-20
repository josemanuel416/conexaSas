# Prompt para IA en servidor de producción — Landing ConexaSoft

Copia y pega el bloque siguiente en la IA del servidor de producción (Cursor Agent, Copilot o similar).
Ajusta `RUTA_REPO` si el monorepo está en otra ubicación.

---

## PROMPT (copiar desde aquí)

```
Contexto:
- Repositorio monorepo DevConexa (ConexaSoft / ErpConexa).
- Este entorno es PRODUCCIÓN. Aplicar los mismos cambios que ya están en el entorno de pruebas.
- Objetivo: actualizar la landing pública de ConexaSoft con copy honesto + visión de IA sobre ERP sólido.
- NO inventar funcionalidades de IA ya implementadas; la IA es el RUMBO, el ERP es lo que existe HOY.
- NO eliminar referencias a gestión inteligente; reformularlas como: "ERP sólido hoy → IA sobre datos reales mañana".

Archivos a modificar:

1) Scripts/database/038_site_landing_copy.sql (CREAR)
   - Migración SQL que actualiza site_content (hero, misión, visión, 9 beneficios) y descripciones de subscription_plans.
   - Copiar el contenido exacto del archivo 038_site_landing_copy.sql del entorno de pruebas.

2) Sever.Conexa/src/db/migrate.js
   - Agregar después de 037_public_site_support.sql:
     await runSqlFile('038_site_landing_copy.sql');

3) ErpConexa/src/config/brand-assets.js
   - Cambiar BRAND_TAGLINE a:
     'ERP sólido hoy. Gestión inteligente sobre datos reales.'

4) ErpConexa/src/pages/public/LandingPage.vue
   - Badge hero: "ERP modular para PYMES en Colombia"
   - Sección trust después del hero (ConexaSoft usa su propio ERP)
   - Lead "¿Por qué ConexaSoft?" con texto ERP + IA como rumbo
   - Nueva sección "Cómo funciona" (3 pasos: Opere, Facture, Controle y crezca)
   - Nueva sección "Gestión inteligente sobre datos reales" (IA como rumbo, ERP como base)
   - Lead de contacto actualizado
   - Estilos CSS para landing-trust, landing-step, landing-section--ai
   - Copiar implementación completa del LandingPage.vue del entorno de pruebas (incluye colores corporativos azul #1976D2 / #0D47A1)

5) ErpConexa/src/layouts/PublicLayout.vue
   - Header y footer con gradiente/fondo azul corporativo (#0D47A1, #1976D2)
   - Acentos en links: #90CAF9

6) ErpConexa/src/components/auth/LoginPageShell.vue
   - Mismo gradiente azul que la landing

Después de aplicar cambios en código:
- Ejecutar migración: cd Sever.Conexa; npm run db:migrate
- Reiniciar API (puerto 3500) y frontend ErpConexa (puerto 9500)
- Verificar en https://[dominio-produccion]/ que se ve:
  · Hero con nuevo título/subtítulo (desde BD)
  · Misión y visión actualizadas
  · 9 tarjetas de beneficios (incluye "Base para gestión inteligente")
  · Sección Cómo funciona + bloque azul de IA
  · Footer con nuevo tagline

Copy exacto para site_content (por si la migración falla, actualizar vía Admin → Sitio):

hero_title:
Operar y facturar, en un solo sistema

hero_subtitle:
ErpConexa conecta ventas, caja, agenda, inventario y contabilidad con facturación electrónica DIAN. Un ERP sólido hoy, preparado para la gestión inteligente del mañana.

mission:
Facilitar la operación comercial de las PYMES colombianas con un ERP modular, confiable y completo — ventas, caja, agenda, inventario, contabilidad y facturación DIAN en un solo flujo — construyendo la base de datos real sobre la cual la gestión inteligente pueda aportar valor.

vision:
Ser la plataforma empresarial colombiana donde las PYMES operen con orden, cumplan con la DIAN y, sobre esa base sólida, accedan a capacidades inteligentes que transformen sus datos en mejores decisiones — sin promesas vacías ni sistemas desconectados.

benefits (9 tarjetas JSON):
[
  {"icon":"receipt_long","title":"Facturación DIAN integrada","description":"Emisión, envío, seguimiento, notas crédito, PDF y correo — conectado al flujo comercial, no como un sistema aparte."},
  {"icon":"sync_alt","title":"De la operación a la factura","description":"Facture desde ventas, caja, agenda o inventario con los mismos clientes y servicios, sin volver a digitar."},
  {"icon":"point_of_sale","title":"Caja con control","description":"Apertura y cierre de sesión, arqueo, formas de pago y recibos que pueden convertirse en factura electrónica."},
  {"icon":"event","title":"Agenda y servicios","description":"Profesionales, horarios, citas y facturación de servicios cumplidos en el mismo sistema."},
  {"icon":"inventory_2","title":"Inventario trazable","description":"Bodegas, artículos, lotes, movimientos y existencias con reportes exportables."},
  {"icon":"account_balance","title":"Contabilidad y reportes","description":"Plan de cuentas, movimientos, cierre de mes y balances para el control financiero."},
  {"icon":"psychology","title":"Base para gestión inteligente","description":"Datos unificados de operación, ventas e inventario — la base real sobre la que la inteligencia artificial podrá ayudar a decidir mejor."},
  {"icon":"business","title":"Multi-compañía seguro","description":"Cada empresa con datos aislados, módulos contratados, permisos granulares e identidad visual propia."},
  {"icon":"support_agent","title":"Soporte dedicado","description":"Canal formal de soporte, requerimientos y reporte de errores dentro del sistema."}
]

Restricciones:
- NO prometer IA ya operativa (chatbots, predicciones, automatización inteligente activa).
- NO decir "inventario en tiempo real" como dashboard live.
- NO prometer WhatsApp integrado al ERP.
- Mantener ConexaSoft = empresa, ErpConexa = producto.
- Crear commit descriptivo solo si el usuario lo pide.

Verificación final:
1. GET /api/public/site → hero, mission, vision, benefits actualizados
2. Landing / → secciones visuales nuevas
3. Footer → tagline "ERP sólido hoy. Gestión inteligente sobre datos reales."
```

---

## Alternativa rápida (solo BD, sin redeploy frontend)

Si en producción aún NO está el `LandingPage.vue` nuevo, puedes aplicar solo la migración SQL y el tagline vía admin:

1. Ejecutar `038_site_landing_copy.sql` en PostgreSQL.
2. Admin → Sitio web → pegar misión, visión, hero y beneficios del prompt.
3. Desplegar frontend cuando esté listo el `LandingPage.vue` con las secciones nuevas.

---

## Archivos tocados en pruebas (referencia)

| Archivo | Cambio |
|---------|--------|
| `Scripts/database/038_site_landing_copy.sql` | Nuevo — UPDATE site_content y planes |
| `Sever.Conexa/src/db/migrate.js` | Registra migración 038 |
| `ErpConexa/src/config/brand-assets.js` | Nuevo tagline |
| `ErpConexa/src/pages/public/LandingPage.vue` | Trust, Cómo funciona, bloque IA, copy |
