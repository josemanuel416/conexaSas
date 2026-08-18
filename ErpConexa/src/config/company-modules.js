/** Accesos directos ventas / facturación / FE (menú lateral) */
export const SALES_BILLING_MENU = {
  section: 'Ventas y facturación',
  items: [
    { label: 'Clientes', icon: 'people', to: '/ventas/configuracion', query: { tab: 'clients' } },
    { label: 'Servicios', icon: 'list_alt', to: '/ventas/configuracion', query: { tab: 'services' } },
    { label: 'Cotización', icon: 'request_quote', to: '/ventas', query: { tab: 'cotizaciones' } },
    { label: 'Factura', icon: 'receipt', to: '/facturacion', query: { tab: 'invoices' } },
    {
      label: 'Factura electrónica',
      icon: 'cloud_upload',
      to: '/ventas/configuracion',
      query: { tab: 'resolutions' },
    },
  ],
}

/** Submenús por módulo contratado */
export const MODULE_MENUS = {
  ventas: {
    items: [
      { label: 'Prefacturas', icon: 'description', to: '/ventas', query: { tab: 'prefacturas' } },
    ],
  },
  facturacion: {
    items: [
      { label: 'Notas crédito', icon: 'undo', to: '/facturacion', query: { tab: 'credit-notes' } },
      { label: 'Seguimiento DIAN', icon: 'cloud_sync', to: '/facturacion', query: { tab: 'dian-tracking' } },
    ],
  },
  agenda_citas: {
    items: [
      { label: 'Agenda', icon: 'calendar_month', to: '/agenda', query: { tab: 'agenda' } },
      { label: 'Profesionales', icon: 'medical_services', to: '/agenda', query: { tab: 'professionals' } },
      { label: 'Servicios', icon: 'list_alt', to: '/agenda', query: { tab: 'services' } },
      { label: 'Clientes', icon: 'people', to: '/agenda', query: { tab: 'clients' } },
      { label: 'Modelos', icon: 'schedule', to: '/agenda', query: { tab: 'models' } },
      { label: 'Facturado', icon: 'receipt', to: '/agenda', query: { tab: 'billing' } },
    ],
  },
  caja: {
    items: [
      { label: 'Operación', icon: 'point_of_sale', to: '/caja', query: { tab: 'operacion' } },
      { label: 'Cajas', icon: 'store', to: '/caja', query: { tab: 'cajas' } },
      { label: 'Historial', icon: 'history', to: '/caja', query: { tab: 'historial' } },
    ],
  },
  inventario: {
    items: [
      { label: 'Movimientos', icon: 'swap_horiz', to: '/inventario', query: { tab: 'movimientos' } },
      { label: 'Existencias', icon: 'inventory', to: '/inventario', query: { tab: 'existencias' } },
      { label: 'Bodegas', icon: 'warehouse', to: '/inventario/configuracion', query: { tab: 'bodegas' } },
      { label: 'Artículos', icon: 'category', to: '/inventario/configuracion', query: { tab: 'articulos' } },
    ],
  },
  contabilidad: {
    items: [
      { label: 'Movimiento diario', icon: 'edit_note', to: '/contabilidad', query: { tab: 'movimientos' } },
      { label: 'Cierre de mes', icon: 'event_busy', to: '/contabilidad', query: { tab: 'cierre' } },
      { label: 'Balance de prueba', icon: 'table_chart', to: '/contabilidad/reportes', query: { tab: 'balance-prueba' } },
      { label: 'Libros auxiliares', icon: 'menu_book', to: '/contabilidad/reportes', query: { tab: 'libros-auxiliares' } },
      { label: 'Balance general', icon: 'account_balance', to: '/contabilidad/reportes', query: { tab: 'balance-general' } },
      { label: 'Plan de cuentas', icon: 'account_tree', to: '/contabilidad/configuracion', query: { tab: 'cuentas' } },
      { label: 'Comprobantes', icon: 'receipt_long', to: '/contabilidad/configuracion', query: { tab: 'comprobantes' } },
      { label: 'Centros de costo', icon: 'hub', to: '/contabilidad/configuracion', query: { tab: 'centros-costo' } },
      { label: 'Periodos', icon: 'calendar_month', to: '/contabilidad/configuracion', query: { tab: 'periodos' } },
      { label: 'Impuestos', icon: 'percent', to: '/contabilidad/configuracion', query: { tab: 'impuestos' } },
    ],
  },
}

/** Configuración avanzada inventario */
export const INVENTARIO_CONFIG_MENU = {
  items: [
    { label: 'Tipos de artículo', icon: 'label', to: '/inventario/configuracion', query: { tab: 'tipos' } },
    { label: 'Variables', icon: 'tune', to: '/inventario/configuracion', query: { tab: 'variables' } },
  ],
}

/** Configuración avanzada ventas (variables del sistema) */
export const VENTAS_CONFIG_MENU = {
  items: [
    { label: 'Variables del sistema', icon: 'tune', to: '/ventas/configuracion', query: { tab: 'variables' } },
  ],
}

export function getModuleMenu(code) {
  return MODULE_MENUS[code] || null
}

export function buildModuleRoute(item) {
  if (!item.query) return item.to
  const q = new URLSearchParams(item.query).toString()
  return `${item.to}?${q}`
}

export function hasVentasModules(modules = []) {
  return modules.some((m) => ['ventas', 'facturacion'].includes(m.code))
}

export function hasSalesBillingMenu(modules = []) {
  return hasVentasModules(modules)
}

export function hasInventarioModule(modules = []) {
  return modules.some((m) => m.code === 'inventario')
}

export function hasContabilidadModule(modules = []) {
  return modules.some((m) => m.code === 'contabilidad')
}

const SALES_BILLING_PATHS = ['/ventas', '/ventas/configuracion', '/facturacion']

/** Ítems del submenú de la ruta actual (barra de iconos con drawer cerrado) */
export function getSectionMenuForPath(path = '') {
  if (SALES_BILLING_PATHS.some((p) => path.startsWith(p))) {
    return SALES_BILLING_MENU.items
  }
  if (path.startsWith('/agenda')) return MODULE_MENUS.agenda_citas?.items || []
  if (path.startsWith('/caja')) return MODULE_MENUS.caja?.items || []
  if (path.startsWith('/inventario')) return MODULE_MENUS.inventario?.items || []
  if (path.startsWith('/contabilidad')) return MODULE_MENUS.contabilidad?.items || []
  if (path.startsWith('/users')) {
    return [{ label: 'Usuarios', icon: 'people', to: '/users' }]
  }
  return []
}

