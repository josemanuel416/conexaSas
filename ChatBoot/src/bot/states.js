export const STATES = {
  IDLE: 'idle',
  AWAITING_CLAVE: 'awaiting_clave',
  AWAITING_TERCERO: 'awaiting_tercero',
  AWAITING_SERVICIO: 'awaiting_servicio',
  AWAITING_CANTIDAD: 'awaiting_cantidad',
  AWAITING_DESCUENTO: 'awaiting_descuento',
  AWAITING_DESCUENTO_VALOR: 'awaiting_descuento_valor',
  AWAITING_CONFIRMACION: 'awaiting_confirmacion',
  PROCESSING: 'processing',
};

export const MESSAGES = {
  BIENVENIDA:
    '¡Hola! Soy el asistente de facturación.\n\nEscribe *factura* para crear una nueva factura o *ayuda* para ver los comandos.',
  AYUDA:
    'Comandos disponibles:\n• *factura* - Crear una factura\n• *cancelar* - Cancelar el proceso actual\n• *ayuda* - Ver esta ayuda',
  CLAVE: 'Ingresa tu *clave de seguridad*:',
  TERCERO: '¿Cuál es el *tercero* (cliente)?',
  SERVICIO: '¿Qué *servicio* vas a facturar?',
  CANTIDAD: '¿Cuál es la *cantidad*?',
  DESCUENTO: '¿Aplicar *descuento*? Responde *Sí* o *No*.',
  DESCUENTO_VALOR: '¿Cuánto descuento? Indica el valor (ej: 10 para 10%).',
  CANCELADO: 'Proceso cancelado. Escribe *factura* cuando quieras intentar de nuevo.',
  CONFIRMACION_INVALIDA: 'Responde *Sí* para confirmar o *No* para cancelar.',
  PROCESANDO: 'Procesando tu factura, espera un momento...',
  ERROR_CANTIDAD: 'La cantidad debe ser un número mayor a 0. Intenta de nuevo.',
  ERROR_DESCUENTO: 'El descuento debe ser un número válido. Intenta de nuevo.',
};

export function buildResumen(data) {
  const descuento = data.descuento?.aplica
    ? `${data.descuento.valor}${data.descuento.tipo === 'porcentaje' ? '%' : ''}`
    : 'Sin descuento';

  return (
    '*Resumen de la factura:*\n\n' +
    `• Tercero: ${data.tercero}\n` +
    `• Servicio: ${data.servicio}\n` +
    `• Cantidad: ${data.cantidad}\n` +
    `• Descuento: ${descuento}\n\n` +
    '¿Confirmar? Responde *Sí* o *No*.'
  );
}

export function parseSiNo(text) {
  const normalized = text.toLowerCase().trim();
  if (['si', 'sí', 's', 'yes', 'y'].includes(normalized)) return true;
  if (['no', 'n'].includes(normalized)) return false;
  return null;
}
