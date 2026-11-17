/**
 * Configuración del servidor. Las variables con clave NUNCA llevan el prefijo VITE_,
 * así que Vite no las incluye en el paquete del navegador.
 *
 * Seguridad por defecto:
 * - Proveedor `simulado` si no se pide otro.
 * - Google exige ROUTES_PROVIDER=google, GOOGLE_ROUTES_ENABLED=true, ROUTES_ENABLED=true
 *   y GOOGLE_ROUTES_API_KEY. Si falta algo, el servicio queda APAGADO (no cae a simulado).
 */
export interface ServerConfig {
  provider: 'simulado' | 'google';
  routesEnabled: boolean;
  googleApiKey: string | null;
  /** Sal para seudonimizar el origen de red en los contadores (no se guarda la IP). */
  originSalt: string;
}

export type EnvLike = Record<string, string | undefined>;

export function readServerConfig(env: EnvLike): ServerConfig {
  const wantsGoogle = env['ROUTES_PROVIDER'] === 'google';
  const originSalt = env['ORIGIN_HASH_SALT'] ?? 'desarrollo-local';
  if (!wantsGoogle) {
    return {
      provider: 'simulado',
      routesEnabled: env['ROUTES_ENABLED'] !== 'false',
      googleApiKey: null,
      originSalt,
    };
  }
  const key = env['GOOGLE_ROUTES_API_KEY'] ?? '';
  const enabled = env['ROUTES_ENABLED'] === 'true' && env['GOOGLE_ROUTES_ENABLED'] === 'true' && key.length > 0;
  return { provider: 'google', routesEnabled: enabled, googleApiKey: enabled ? key : null, originSalt };
}
