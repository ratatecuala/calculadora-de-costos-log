/** Piezas de interfaz compartidas por las pantallas de la herramienta de medición. */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Almacen } from './almacen';
import type { Aviso } from './calculos';
import type { VehiculoMedicion } from './modelo';
import type { DatosLocales } from './repositorio';

export interface Contexto {
  a: Almacen;
  d: DatosLocales;
  veh: VehiculoMedicion | null;
  recargar: () => Promise<void>;
  elegirVehiculo: (id: string) => void;
  irA: (tab: Tab) => void;
  /** Abre el alta guiada (nuevo vehículo o editar uno, sin perder lo que no pregunta). */
  abrirAlta: (previo: VehiculoMedicion | null) => void;
  /** Mensaje breve en la página (nunca `alert`). */
  avisar: (texto: string) => void;
}
export type Tab = 'inicio' | 'viaje' | 'combustible' | 'historial' | 'vehiculo' | 'ayuda';

export const Ctx = createContext<Contexto | null>(null);
export function useCtx(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error('Contexto de medición no disponible');
  return c;
}

/** Acepta coma o punto decimal. `null` si está vacío o no es un número. */
export function parseNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const nf = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
export const fmt = (n: number | null | undefined, sufijo = ''): string => (n === null || n === undefined ? '—' : `${nf.format(n)}${sufijo}`);
export const fmtClp = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : `$${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(n))}`);
export const aTexto = (n: number | null | undefined): string => (n === null || n === undefined ? '' : String(n).replace('.', ','));

export function fechaHoraLegible(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

export function Avisos({ avisos }: { avisos: Aviso[] }) {
  if (!avisos.length) return null;
  return (
    <ul className="m-avisos" role="status">
      {avisos.map((a) => (
        <li key={a.codigo} className={a.nivel === 'aviso' ? 'm-aviso' : 'm-info'}>
          {a.texto}
        </li>
      ))}
    </ul>
  );
}

/** Campo numérico con coma decimal (teclado decimal en el teléfono). */
export function CampoNumero(props: { etiqueta: string; valor: string; onCambio: (v: string) => void; ayuda?: ReactNode; id: string; sufijo?: string }) {
  return (
    <label className="m-campo" htmlFor={props.id}>
      <span>{props.etiqueta}</span>
      <span className="m-campo-fila">
        <input id={props.id} inputMode="decimal" autoComplete="off" value={props.valor} onChange={(e) => props.onCambio(e.target.value)} />
        {props.sufijo ? <span className="m-sufijo">{props.sufijo}</span> : null}
      </span>
      {props.ayuda ? <small>{props.ayuda}</small> : null}
    </label>
  );
}

/** Confirmación propia en la página (nunca `confirm()`). */
export function Confirmar(props: { texto: ReactNode; si: string; onSi: () => void; onNo: () => void; peligro?: boolean }) {
  return (
    <div className={`m-confirmar${props.peligro ? ' m-peligro' : ''}`} role="alertdialog" aria-label="Confirmación">
      <p>{props.texto}</p>
      <div className="m-fila">
        <button type="button" className={props.peligro ? 'm-btn m-btn-peligro' : 'm-btn m-btn-primario'} onClick={props.onSi}>
          {props.si}
        </button>
        <button type="button" className="m-btn" onClick={props.onNo}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Descarga un archivo generado en el dispositivo (sin red). */
export function descargar(nombre: string, contenido: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Re-render periódico (cronómetro del tramo en curso). */
export function useReloj(ms = 1000): Date {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

export interface LecturaGuardada {
  valor: number;
  foto: Blob | null;
  conservar: boolean;
}

/**
 * Lectura del TRIP u odómetro: escribir el número y, si se quiere, fotografiarlo para leerlo con calma.
 * La foto NO se conserva salvo que el usuario marque la casilla (D-3). Sin OCR.
 */
export function CampoLectura(props: {
  id: string;
  etiqueta: string;
  actual: number | null;
  ayuda?: string;
  avisosDe: (valor: number) => Aviso[];
  onGuardar: (l: LecturaGuardada) => Promise<void>;
}) {
  const [texto, setTexto] = useState(aTexto(props.actual));
  const [foto, setFoto] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [conservar, setConservar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setTexto(aTexto(props.actual)), [props.actual]);
  useEffect(() => {
    if (!foto) return;
    const u = URL.createObjectURL(foto);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [foto]);
  const valor = parseNumero(texto);
  const avisos = valor === null ? [] : props.avisosDe(valor);
  const guardar = async () => {
    if (valor === null) return;
    setGuardando(true);
    try {
      await props.onGuardar({ valor, foto, conservar });
      setFoto(null);
      setUrl(null);
      setConservar(false);
      if (input.current) input.current.value = '';
    } finally {
      setGuardando(false);
    }
  };
  return (
    <div className="m-lectura" data-lectura={props.id}>
      <CampoNumero id={`lec-${props.id}`} etiqueta={props.etiqueta} valor={texto} onCambio={setTexto} sufijo="km" ayuda={props.ayuda} />
      <div className="m-fila">
        <label className="m-btn m-btn-sec m-foto">
          Fotografiar
          <input ref={input} type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} data-foto={props.id} />
        </label>
        <button type="button" className="m-btn m-btn-primario" disabled={valor === null || guardando} onClick={guardar}>
          Guardar lectura
        </button>
      </div>
      {url ? (
        <div className="m-foto-vista">
          <img src={url} alt="Foto para leer el número (no se guarda salvo que lo elijas)" />
          <label className="m-check">
            <input type="checkbox" checked={conservar} onChange={(e) => setConservar(e.target.checked)} data-conservar={props.id} />
            Conservar la foto solo en este dispositivo (se guarda sin ubicación ni datos del equipo)
          </label>
        </div>
      ) : null}
      <Avisos avisos={avisos} />
      {props.actual !== null ? <p className="m-guardado">Guardado: {fmt(props.actual, ' km')}</p> : null}
    </div>
  );
}
