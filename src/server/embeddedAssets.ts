/**
 * Archivos de la app incrustados en el Worker, con la misma interfaz que el binding ASSETS.
 * Se usa en staging porque el proxy del entorno de desarrollo impide la subida separada de
 * archivos estáticos (docs/13-staging.md). Respaldo SPA: rutas desconocidas → index.html.
 */
export interface EmbeddedFile {
  body: string;
  contentType: string;
}

export function embeddedAssetsBinding(files: Record<string, EmbeddedFile>): { fetch(request: Request): Promise<Response> } {
  return {
    async fetch(request: Request): Promise<Response> {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Método no permitido', { status: 405 });
      const path = new URL(request.url).pathname;
      const exact = files[path];
      // Archivos con hash en el nombre: inmutables. index.html: siempre revalidar.
      if (exact && path !== '/index.html') {
        return new Response(request.method === 'HEAD' ? null : exact.body, {
          headers: { 'Content-Type': exact.contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
        });
      }
      if (path.startsWith('/assets/')) return new Response('No encontrado', { status: 404 });
      const index = files['/index.html'];
      if (!index) return new Response('No encontrado', { status: 404 });
      return new Response(request.method === 'HEAD' ? null : index.body, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    },
  };
}
