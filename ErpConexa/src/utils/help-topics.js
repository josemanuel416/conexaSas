const DEFAULT_TAB = {
  '/ventas': 'cotizaciones',
  '/ventas/configuracion': 'resolutions',
  '/facturacion': 'invoices',
  '/inventario': 'movimientos',
  '/inventario/configuracion': 'bodegas',
  '/caja': 'operacion',
  '/contabilidad': 'movimientos',
  '/contabilidad/reportes': 'balance-prueba',
  '/contabilidad/configuracion': 'cuentas',
  '/agenda': 'agenda',
}

const TOPICS = [
  { path: '/dashboard', id: 'mod-inicio' },
  { path: '/users', id: 'mod-usuarios' },
  { path: '/ventas', tab: 'cotizaciones', id: 'proc-cotizacion' },
  { path: '/ventas', tab: 'prefacturas', id: 'proc-prefactura' },
  { path: '/ventas/configuracion', tab: 'clients', id: 'mod-ventas' },
  { path: '/ventas/configuracion', tab: 'services', id: 'mod-ventas' },
  { path: '/ventas/configuracion', tab: 'resolutions', id: 'proc-factura' },
  { path: '/ventas/configuracion', tab: 'variables', id: 'mod-ventas' },
  { path: '/facturacion', tab: 'invoices', id: 'proc-factura' },
  { path: '/facturacion', tab: 'credit-notes', id: 'proc-nota-credito' },
  { path: '/facturacion', tab: 'dian-tracking', id: 'proc-seguimiento-dian' },
  { path: '/inventario', tab: 'movimientos', id: 'mod-inventario' },
  { path: '/inventario', tab: 'existencias', id: 'proc-existencias' },
  { path: '/inventario/configuracion', tab: 'bodegas', id: 'proc-catalogo-inventario' },
  { path: '/inventario/configuracion', tab: 'articulos', id: 'proc-catalogo-inventario' },
  { path: '/inventario/configuracion', tab: 'tipos', id: 'proc-catalogo-inventario' },
  { path: '/inventario/configuracion', tab: 'tipos-movimiento', id: 'mod-inventario' },
  { path: '/inventario/configuracion', tab: 'variables', id: 'proc-compra-cxp' },
  { path: '/caja', tab: 'operacion', id: 'proc-caja' },
  { path: '/caja', tab: 'cajas', id: 'mod-caja' },
  { path: '/caja', tab: 'historial', id: 'proc-caja' },
  { path: '/cuentas-pagar', id: 'proc-cxp-manual' },
  { path: '/cuentas-pagar/configuracion', id: 'mod-cxp' },
  { path: '/contabilidad', tab: 'movimientos', id: 'proc-asiento' },
  { path: '/contabilidad', tab: 'cierre', id: 'proc-asiento' },
  { path: '/contabilidad/reportes', id: 'mod-contabilidad' },
  { path: '/contabilidad/configuracion', id: 'mod-contabilidad' },
  { path: '/agenda', id: 'proc-cita' },
]

export function resolveHelpTopic(path, tab) {
  const current = String(tab || DEFAULT_TAB[path] || '')
  const exact = TOPICS.find((topic) => topic.path === path && (topic.tab == null || topic.tab === current))
  if (exact) return exact.id
  return TOPICS.find((topic) => topic.path === path && topic.tab == null)?.id || null
}
