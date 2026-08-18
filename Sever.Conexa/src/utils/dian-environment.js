export const DIAN_ENVIRONMENTS = ['habilitacion', 'pruebas', 'produccion'];

export function dianEnvironmentLabel(environment) {
  if (environment === 'produccion') return 'Producción';
  if (environment === 'habilitacion') return 'Habilitación';
  if (environment === 'pruebas') return 'Pruebas';
  return environment || '—';
}

/** Set de pruebas DIAN (SendTestSetAsync) — solo habilitación. */
export function usesDianTestSet(environment) {
  return environment === 'habilitacion';
}

/** WSDL de ambiente de pruebas DIAN (vpfe-hab). */
export function usesDianHabEndpoint(environment) {
  return environment === 'habilitacion' || environment === 'pruebas';
}
