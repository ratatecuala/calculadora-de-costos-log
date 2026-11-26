/**
 * Worker privado `medicion-privada` (A-91 Frente B; docs/31 §7).
 *
 * - Sirve SOLO el build de la herramienta de medición (`dist-medicion/`), incrustado en el propio script:
 *   no usa Static Assets de Cloudflare, que se servirían ANTES del Worker y sin pasar por la contraseña.
 * - Usuario y contraseña (Basic Auth) exigidos en TODAS las respuestas: `/`, cada archivo de `assets/`,
 *   `sw.js`, rutas inexistentes, métodos no permitidos y errores. Sin respaldo público.
 * - Falla cerrado: sin el secreto `MEDICION_BASIC_AUTH` no sirve nada (503), nunca abre el sitio.
 * - HTTPS obligatorio fuera de localhost (redirección 308 y HSTS).
 * - Sin Supabase, sin analítica, sin APIs externas, sin almacenamiento en el servidor: los datos viven
 *   solo en el navegador del teléfono. Revocar la contraseña NO borra las copias locales (docs/31 §5).
 * - Completamente separado del Worker de staging (`src/server/worker.ts`): no comparte código ni secretos.
 */

export interface ArchivoIncrustado {
  /** Contenido de texto (UTF-8). */
  body: string;
  contentType: string;
}

export interface EnvMedicion {
  /** «usuario:contraseña», solo como secreto del Worker en Cloudflare. Nunca en el repositorio. */
  MEDICION_BASIC_AUTH?: unknown;
}

const REALM = 'medicion-privada';

const CABECERAS_SEGURIDAD: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(self)',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function esLocal(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
}

/** Comparación en tiempo constante respecto del contenido. */
export function mismoSecreto(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i += 1) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function decodificarBasic(header: string): string {
  if (!/^Basic [A-Za-z0-9+/=]+$/.test(header)) return '';
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
}

function conSeguridad(res: Response, https: boolean): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CABECERAS_SEGURIDAD)) out.headers.set(k, v);
  if (https) out.headers.set('Strict-Transport-Security', 'max-age=31536000');
  // Nada se guarda en cachés intermedias ni del navegador: la copia sin conexión la maneja el service worker.
  out.headers.set('Cache-Control', 'private, no-store');
  return out;
}

function texto(status: number, cuerpo: string, extra: Record<string, string> = {}): Response {
  return new Response(cuerpo, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...extra } });
}

export function crearWorkerMedicion(archivos: Record<string, ArchivoIncrustado>) {
  return {
    async fetch(request: Request, env: EnvMedicion): Promise<Response> {
      const url = new URL(request.url);
      const https = url.protocol === 'https:';
      if (!https && !esLocal(url)) {
        url.protocol = 'https:';
        return conSeguridad(new Response(null, { status: 308, headers: { Location: url.toString() } }), false);
      }
      const esperado = typeof env.MEDICION_BASIC_AUTH === 'string' ? env.MEDICION_BASIC_AUTH : '';
      if (!esperado || !esperado.includes(':')) {
        return conSeguridad(texto(503, 'Herramienta privada no configurada.'), https);
      }
      const dado = decodificarBasic(request.headers.get('Authorization') ?? '');
      if (!mismoSecreto(dado, esperado)) {
        return conSeguridad(
          texto(401, 'Herramienta privada. Se requiere usuario y contraseña.', {
            'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
          }),
          https,
        );
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return conSeguridad(texto(405, 'Método no permitido.', { Allow: 'GET, HEAD' }), https);
      }
      const ruta = url.pathname === '/' ? '/index.html' : url.pathname;
      const archivo = archivos[ruta];
      if (!archivo) return conSeguridad(texto(404, 'No encontrado.'), https);
      const cabeceras: Record<string, string> = { 'Content-Type': archivo.contentType };
      // El service worker solo controla este origen; se permite su alcance raíz explícitamente.
      if (ruta === '/sw.js') cabeceras['Service-Worker-Allowed'] = '/';
      return conSeguridad(new Response(request.method === 'HEAD' ? null : archivo.body, { status: 200, headers: cabeceras }), https);
    },
  };
}
