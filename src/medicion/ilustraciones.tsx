/**
 * Íconos e ilustraciones LOCALES (SVG en línea, sin archivos ni recursos remotos; la CSP los bloquearía igual).
 * Las cifras de los tableros son EJEMPLOS ilustrativos, nunca mediciones.
 */
import type { ReactNode } from 'react';
import type { TipoVehiculo } from './modelo';

function Svg({ children, vista = '0 0 48 48', clase = 'm-icono' }: { children: ReactNode; vista?: string; clase?: string }) {
  return (
    <svg className={clase} viewBox={vista} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const Ruedas = ({ x1, x2, y = 34 }: { x1: number; x2: number; y?: number }) => (
  <>
    <circle cx={x1} cy={y} r="4.5" />
    <circle cx={x2} cy={y} r="4.5" />
  </>
);

export function IconoVehiculo({ tipo }: { tipo: TipoVehiculo }) {
  switch (tipo) {
    case 'camioneta':
      return (
        <Svg>
          <path d="M4 33V25l5-8h13v8h16l6 3v5h-4.5M8.5 33H4M18.5 33h11" />
          <path d="M11 19l-3 6h14" />
          <Ruedas x1={13.5} x2={34.5} />
        </Svg>
      );
    case 'furgon':
      return (
        <Svg>
          <path d="M4 33V14h28l7 7 5 3v9h-4.5M8.5 33H4M18.5 33h11" />
          <path d="M32 14v10h12" />
          <Ruedas x1={13.5} x2={34.5} />
        </Svg>
      );
    case 'camion_liviano':
      return (
        <Svg>
          <path d="M3 33V11h26v22M29 18h8l7 7v8h-4M8 33H3M17 33h14" />
          <path d="M33 18v7h11" />
          <Ruedas x1={12.5} x2={35.5} />
        </Svg>
      );
    case 'otro':
      return (
        <Svg>
          <circle cx="24" cy="24" r="16" />
          <path d="M19 20a5 5 0 1 1 6.5 4.8c-1 .3-1.5 1.1-1.5 2.2v1M24 33v.5" />
        </Svg>
      );
    default:
      return (
        <Svg>
          <path d="M4 33v-7l4-2 6-8h17l7 8 6 2v7h-4.5M8.5 33H4M18.5 33h11" />
          <path d="M15 17l-4 7h27l-5-7" />
          <Ruedas x1={13.5} x2={34.5} />
        </Svg>
      );
  }
}

export const IconoInicio = () => (
  <Svg vista="0 0 24 24">
    <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Svg>
);
export const IconoSurtidor = () => (
  <Svg vista="0 0 24 24">
    <path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M7 8h5" />
    <path d="M15 10h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3" />
  </Svg>
);
export const IconoLista = () => (
  <Svg vista="0 0 24 24">
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" />
    <circle cx="4.5" cy="12" r="1" />
    <circle cx="4.5" cy="18" r="1" />
  </Svg>
);
export const IconoAuto = () => (
  <Svg vista="0 0 24 24">
    <path d="M3 16v-4l2-1 3-5h8l3 5 2 1v4h-2M7 16H3M10 16h4" />
    <circle cx="8.5" cy="16.5" r="2" />
    <circle cx="16" cy="16.5" r="2" />
  </Svg>
);
export const IconoIniciar = () => (
  <Svg vista="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5v7l5.5-3.5z" />
  </Svg>
);
export const IconoAyuda = () => (
  <Svg vista="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1v.5M12 16.5v.2" />
  </Svg>
);
export const IconoAtras = () => (
  <Svg vista="0 0 24 24">
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);

/** Pantalla de tablero de EJEMPLO: TRIP (con decimal, se reinicia) y kilometraje total (no se reinicia). */
export function TableroEjemplo({ resaltar }: { resaltar?: 'trip' | 'odometro' }) {
  const marco = (activo: boolean) => (activo ? 'var(--m-blue)' : 'var(--m-border-fuerte)');
  return (
    <figure className="m-ilustracion" data-ilustracion="tablero">
      <svg viewBox="0 0 320 150" role="img" aria-label="Ejemplo de tablero: arriba el TRIP con decimal, abajo el kilometraje total">
        <rect x="4" y="4" width="312" height="142" rx="18" fill="var(--m-tablero)" />
        <circle cx="70" cy="75" r="50" fill="none" stroke="var(--m-tablero-linea)" strokeWidth="4" />
        <path d="M70 75 L100 48" stroke="var(--m-tablero-aguja)" strokeWidth="4" strokeLinecap="round" />
        <text x="70" y="112" textAnchor="middle" fontSize="11" fill="var(--m-tablero-texto)">km/h</text>
        <rect x="136" y="16" width="170" height="54" rx="8" fill="var(--m-tablero-pantalla)" stroke={marco(resaltar === 'trip')} strokeWidth="3" />
        <text x="146" y="31" fontSize="11" fill="var(--m-tablero-texto)">TRIP A (parcial)</text>
        <text x="296" y="60" textAnchor="end" fontSize="19" fontFamily="ui-monospace, monospace" fill="var(--m-tablero-digito)">123,4 km</text>
        <rect x="136" y="80" width="170" height="54" rx="8" fill="var(--m-tablero-pantalla)" stroke={marco(resaltar === 'odometro')} strokeWidth="3" />
        <text x="146" y="95" fontSize="11" fill="var(--m-tablero-texto)">ODO (kilometraje total)</text>
        <text x="296" y="124" textAnchor="end" fontSize="19" fontFamily="ui-monospace, monospace" fill="var(--m-tablero-digito)">45 210 km</text>
      </svg>
      <figcaption>Ejemplo ilustrativo, no es tu vehículo. Los números cambian según el modelo.</figcaption>
    </figure>
  );
}

/** Dos formas de mostrar un contador: con decimal o solo enteros (ejemplo). */
export function Contadores() {
  return (
    <svg className="m-contadores" viewBox="0 0 300 64" role="img" aria-label="Ejemplos: 123,4 con decimal y 123 solo enteros">
      <rect x="4" y="8" width="136" height="48" rx="8" fill="var(--m-tablero-pantalla)" />
      <text x="72" y="41" textAnchor="middle" fontSize="22" fontFamily="ui-monospace, monospace" fill="var(--m-tablero-digito)">123,4</text>
      <rect x="160" y="8" width="136" height="48" rx="8" fill="var(--m-tablero-pantalla)" />
      <text x="228" y="41" textAnchor="middle" fontSize="22" fontFamily="ui-monospace, monospace" fill="var(--m-tablero-digito)">123</text>
    </svg>
  );
}

/**
 * Boleta FICTICIA de ejemplo para saber qué anotar. Aritmética coherente: 20,000 L × $1.000 = $20.000.
 * Valores redondos inventados: no corresponden a ningún precio ni vehículo real.
 */
export function BoletaEjemplo() {
  return (
    <figure className="m-ilustracion" data-ilustracion="boleta">
      <svg viewBox="0 0 260 200" role="img" aria-label="Boleta de ejemplo ficticia: 20,000 litros a 1.000 pesos el litro, total 20.000 pesos">
        <rect x="30" y="6" width="200" height="188" rx="6" fill="var(--m-surface)" stroke="var(--m-border-fuerte)" strokeWidth="2" />
        <text x="130" y="30" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--m-text)">BOLETA DE EJEMPLO</text>
        <text x="130" y="46" textAnchor="middle" fontSize="10" fill="var(--m-text-2)">(ficticia)</text>
        <line x1="44" y1="56" x2="216" y2="56" stroke="var(--m-border)" strokeDasharray="4 3" />
        <text x="44" y="78" fontSize="12" fill="var(--m-text-2)">Litros</text>
        <text x="216" y="78" textAnchor="end" fontSize="13" fontFamily="ui-monospace, monospace" fill="var(--m-text)">20,000</text>
        <text x="44" y="102" fontSize="12" fill="var(--m-text-2)">Precio por litro</text>
        <text x="216" y="102" textAnchor="end" fontSize="13" fontFamily="ui-monospace, monospace" fill="var(--m-text)">$1.000</text>
        <line x1="44" y1="116" x2="216" y2="116" stroke="var(--m-border)" />
        <text x="44" y="140" fontSize="13" fontWeight="700" fill="var(--m-text)">TOTAL</text>
        <text x="216" y="140" textAnchor="end" fontSize="15" fontWeight="700" fontFamily="ui-monospace, monospace" fill="var(--m-blue)">$20.000</text>
        <text x="130" y="172" textAnchor="middle" fontSize="10" fill="var(--m-text-2)">20,000 L × $1.000 = $20.000</text>
      </svg>
      <figcaption>Ejemplo inventado: anota los litros, el precio por litro y el total de tu boleta.</figcaption>
    </figure>
  );
}
