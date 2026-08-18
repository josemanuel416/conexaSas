export function dianEnvironmentLabel(environment) {
  if (environment === 'produccion') return 'Producción';
  if (environment === 'habilitacion') return 'Habilitación';
  if (environment === 'pruebas') return 'Pruebas';
  return environment || '—';
}

export function dianEnvironmentHint(environment) {
  if (environment === 'habilitacion') {
    return 'Set de habilitación DIAN: envía facturas al gráfico de pruebas. Requiere prefijo SETP y el código del set configurado en el emisor.';
  }
  if (environment === 'pruebas') {
    return 'Ambiente de pruebas DIAN: facture con normalidad tras aprobar el set. No cuenta en el gráfico de habilitación.';
  }
  if (environment === 'produccion') {
    return 'Producción: facturación real ante la DIAN con validez fiscal.';
  }
  return '';
}
