/**
 * Cliente de Supabase para el navegador. Usa SOLO la clave publicable (limitada por RLS);
 * nunca una clave secreta. Si no hay configuración, la app funciona sin cuentas (modo local).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface CloudConfig {
  url: string;
  publishableKey: string;
  /** Solo staging: inicio con correo y contraseña para usuarios de prueba (sin Google). */
  testPasswordLogin: boolean;
}

export function readCloudConfig(env: Record<string, string | boolean | undefined>): CloudConfig | null {
  const url = typeof env['VITE_SUPABASE_URL'] === 'string' ? env['VITE_SUPABASE_URL'] : '';
  const publishableKey = typeof env['VITE_SUPABASE_PUBLISHABLE_KEY'] === 'string' ? env['VITE_SUPABASE_PUBLISHABLE_KEY'] : '';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || publishableKey.length < 20) return null;
  // Defensa: una clave secreta jamás debe llegar al navegador.
  if (publishableKey.startsWith('sb_secret_')) throw new Error('Configuración insegura: clave secreta en el navegador');
  return { url, publishableKey, testPasswordLogin: env['VITE_TEST_PASSWORD_LOGIN'] === 'true' };
}

let client: SupabaseClient | null = null;

export const cloudConfig: CloudConfig | null = readCloudConfig(import.meta.env as Record<string, string | boolean | undefined>);

/**
 * Cliente FIJADO a la sesión de una cuenta (quinta auditoría, P1): todas sus solicitudes usan
 * ese token aunque en el cliente compartido se cierre sesión o entre otra cuenta. Se usa para
 * operaciones largas, como copiar el historial local, que deben quedar a nombre de quien las inició.
 */
export function createBoundClient(accessToken: string, config: CloudConfig | null = cloudConfig, fetchImpl?: typeof fetch): SupabaseClient | null {
  if (!config) return null;
  return createClient(config.url, config.publishableKey, {
    accessToken: async () => accessToken,
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });
}

export function getSupabase(): SupabaseClient | null {
  if (!cloudConfig) return null;
  client ??= createClient(cloudConfig.url, cloudConfig.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'cotizador.sesion' },
  });
  return client;
}
