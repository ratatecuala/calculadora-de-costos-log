/**
 * Entrada de la herramienta privada de medición (A-90; docs/29 y docs/31). Paquete separado de la app
 * comercial (`vite.medicion.config.ts`). Flag `VITE_FF_MEDICION` apagada por defecto.
 *
 * Una flag o una ruta oculta NO son control de acceso: si algún día se publica, debe ser en un entorno
 * aislado y protegido, con autorización del propietario (docs/31 §7).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './medicion.css';

const activa = import.meta.env.VITE_FF_MEDICION === '1';
const raiz = document.getElementById('raiz');

function Desactivada() {
  return (
    <main className="m-desactivada">
      <h1>Herramienta de medición desactivada</h1>
      <p>Esta herramienta privada está apagada por defecto (flag VITE_FF_MEDICION).</p>
    </main>
  );
}

if (raiz) {
  createRoot(raiz).render(<StrictMode>{activa ? <App /> : <Desactivada />}</StrictMode>);
}

// Sin conexión: el service worker solo existe en el build (en desarrollo, Vite sirve módulos sueltos).
if (activa && !import.meta.env.DEV && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
    /* Sin service worker la herramienta funciona igual con conexión; la pantalla Historial lo informa. */
  });
}
