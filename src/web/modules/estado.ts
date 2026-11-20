/**
 * Estado de completitud y resúmenes de una línea para las filas plegables (fase 1, A-66).
 * Funciones puras: distinguen datos OBLIGATORIOS, OPCIONALES que faltan y errores. Un dato
 * opcional que falta nunca es un error y nunca se completa con 0 (A-18).
 */
import { formatClp } from '../../engine/rounding';
import { floorLabel } from '../../shared/cargo';
import { equipmentAmount, helperCostLines, type Helper } from '../../shared/resources';
import type { DraftItem } from './inventoryDraft';
import type { DraftEquipment, DraftStop } from './resourcesDraft';

export type Nivel = 'error' | 'faltan' | 'completo';

export interface Estado {
  nivel: Nivel;
  /** Texto corto para la etiqueta de la fila. */
  etiqueta: string;
  /** Detalle legible: qué revisar o qué falta. */
  detalle: string;
}

const nf = (v: number, d = 3) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: d }).format(v);
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

/** Errores de validación que pertenecen a una clave (`clave.campo`). */
export function erroresDe(errors: Record<string, string>, key: string): string[] {
  return Object.entries(errors)
    .filter(([k]) => k.startsWith(`${key}.`))
    .map(([, m]) => m);
}

/**
 * Objeto del inventario. Obligatorios: descripción y cantidad (con error si faltan). Opcionales:
 * peso y volumen (o medidas), que solo mejoran la estimación de viajes. «Frágil» y «manejo
 * especial» siempre tienen valor («no marcado», «sin manejo especial declarado»; T-8).
 */
export function estadoObjeto(item: DraftItem, errors: Record<string, string>): Estado {
  const errs = erroresDe(errors, item.key);
  if (errs.length > 0) {
    return { nivel: 'error', etiqueta: 'Revisar', detalle: errs.length === 1 ? errs[0]! : `${errs.length} campos por corregir` };
  }
  const faltan: string[] = [];
  if (item.unitWeightKg === null) faltan.push('peso');
  if (item.volumeM3 === null) faltan.push('medidas o volumen');
  if (faltan.length) return { nivel: 'faltan', etiqueta: 'Faltan datos opcionales', detalle: `Falta ${lista(faltan)} (opcional; mejora la estimación de viajes)` };
  return { nivel: 'completo', etiqueta: 'Completo', detalle: 'Peso y volumen informados' };
}

/**
 * Resumen de una línea cerrada, bajo su título «cantidad × nombre»: «12 kg c/u · 0,08 m³ c/u».
 * Sin peso ni volumen: «Sin peso ni medidas».
 */
export function resumenObjeto(item: DraftItem): string {
  const partes: string[] = [];
  if (item.unitWeightKg !== null) partes.push(`${nf(item.unitWeightKg, 1)} kg c/u`);
  if (item.volumeM3 !== null) partes.push(`${nf(item.volumeM3)} m³ c/u`);
  if (item.fragile) partes.push('frágil (marcado)');
  if (item.handling !== 'normal') partes.push('manejo especial');
  return partes.length ? partes.join(' · ') : 'Sin peso ni medidas';
}

/** Accesos de una parada (datos que puede informar el cliente; todos opcionales). */
export function resumenAcceso(stop: DraftStop): { texto: string; estado: Estado } {
  const partes: string[] = [];
  if (stop.floor !== null) partes.push(floorLabel(stop.floor));
  if (stop.elevator === 'si') partes.push('con ascensor');
  if (stop.elevator === 'no') partes.push('sin ascensor');
  if (stop.elevator === 'noCabe') partes.push('ascensor no apto');
  if (stop.stairs !== null) partes.push(stop.stairs ? 'con escaleras' : 'sin escaleras');
  if (stop.carryMeters !== null) partes.push(`acarreo ${nf(stop.carryMeters, 0)} m`);
  if (stop.access.trim()) partes.push('con nota de acceso');
  const faltan = [
    stop.floor === null ? 'piso' : null,
    stop.elevator === null ? 'ascensor' : null,
    stop.stairs === null ? 'escaleras' : null,
    stop.carryMeters === null ? 'acarreo' : null,
  ].filter((x): x is string => x !== null);
  const estado: Estado =
    faltan.length === 0
      ? { nivel: 'completo', etiqueta: 'Completo', detalle: 'Accesos informados' }
      : { nivel: 'faltan', etiqueta: partes.length ? 'Faltan datos opcionales' : 'Sin datos (opcional)', detalle: `Falta ${lista(faltan)} (opcional)` };
  return { texto: partes.length ? partes.join(' · ') : 'Sin datos de acceso', estado };
}

/** Minutos de carga y descarga declarados por el transportista en A y B. */
export function resumenTiempos(stops: readonly DraftStop[]): { texto: string; estado: Estado } {
  const nombre = (r: DraftStop['role']) => (r === 'A' ? 'Origen' : 'Destino');
  const partes = stops.map((s) => `${nombre(s.role)}: ${s.loadMinutes === null ? 'sin dato' : `${nf(s.loadMinutes, 0)} min`}`);
  const faltan = stops.filter((s) => s.loadMinutes === null).map((s) => nombre(s.role).toLowerCase());
  return {
    texto: partes.join(' · '),
    estado:
      faltan.length === 0
        ? { nivel: 'completo', etiqueta: 'Completo', detalle: 'Tiempos declarados' }
        : { nivel: 'faltan', etiqueta: 'Faltan minutos', detalle: `Falta el tiempo en ${lista(faltan)}: el costo sería parcial cuando se integre` },
  };
}

/**
 * Fila de un ayudante: modalidad y monto, o lo que falta para calcularlo. El monto solo se muestra
 * si es VÁLIDO (`helperCostLines`); con un dato fuera de rango se lee «monto no calculable»
 * (auditoría fase 1, P1-2).
 */
export function resumenAyudante(h: Helper, errors: Record<string, string>): { texto: string; estado: Estado } {
  const errs = erroresDe(errors, h.id);
  const linea = helperCostLines({ helpers: [h] })[0]!;
  const invalido = linea.status === 'invalido' || errs.length > 0;
  const revisar = (): Estado => ({ nivel: 'error', etiqueta: 'Revisar', detalle: errs[0] ?? 'Hay un dato fuera de rango: el monto no se calcula' });
  if (h.mode === 'servicio') {
    const monto = linea.status === 'ok' ? formatClp(linea.amount!) : invalido ? 'monto no calculable' : 'monto sin dato';
    const texto = `Por servicio · ${monto}`;
    if (invalido) return { texto, estado: revisar() };
    return {
      texto,
      estado: linea.status === 'faltante' ? { nivel: 'faltan', etiqueta: 'Falta monto', detalle: 'Sin monto: queda como faltante, no como $0' } : { nivel: 'completo', etiqueta: 'Completo', detalle: '' },
    };
  }
  const faltan = [h.ratePerHour === null ? 'tarifa' : null, h.hours === null ? 'horas' : null, h.paidSegments.length === 0 ? 'tramos' : null].filter(
    (x): x is string => x !== null,
  );
  const base = `Por hora · ${h.hours === null ? '? h' : `${nf(h.hours, 2)} h`} × ${h.ratePerHour === null ? '$?' : formatClp(h.ratePerHour)}`;
  if (invalido) return { texto: `${base} · monto no calculable`, estado: revisar() };
  const texto = linea.status === 'ok' ? `${base} = ${formatClp(linea.amount!)}` : base;
  return {
    texto,
    estado: faltan.length ? { nivel: 'faltan', etiqueta: 'Falta monto', detalle: `Falta ${lista(faltan)}: el monto queda faltante` } : { nivel: 'completo', etiqueta: 'Completo', detalle: '' },
  };
}

/** Fila de un elemento de equipamiento: el monto solo se muestra si es válido. */
export function resumenEquipo(e: DraftEquipment, errors: Record<string, string>): { texto: string; estado: Estado } {
  const errs = erroresDe(errors, e.key);
  // Un elemento con cualquier dato inválido (nombre vacío, monto con decimales o fuera de rango) no suma.
  const m = equipmentAmount({ label: e.label, amount: e.amount });
  const nombre = e.label.trim() || 'Sin nombre';
  const monto = e.amount === null ? 'monto sin dato' : m.status === 'ok' && !errs.length ? formatClp(m.amount!) : 'no suma (revisar)';
  const texto = `${nombre} · ${monto}`;
  if (m.status === 'invalido' && !errs.length) return { texto, estado: { nivel: 'error', etiqueta: 'Revisar', detalle: 'Hay un dato inválido: el monto no se suma' } };
  if (errs.length) return { texto, estado: { nivel: 'error', etiqueta: 'Revisar', detalle: errs[0]! } };
  return { texto, estado: e.amount === null ? { nivel: 'faltan', etiqueta: 'Falta monto', detalle: 'Sin monto: queda como faltante, no como $0' } : { nivel: 'completo', etiqueta: 'Completo', detalle: '' } };
}

/**
 * Filas abiertas tras agregar una línea nueva: se abre la nueva y se cierran las demás que no
 * tienen errores (sus datos se conservan). Las que tienen errores siguen abiertas para corregirlas.
 */
export function abrirAlAgregar(abiertas: ReadonlySet<string>, nueva: string, tieneErrores: (key: string) => boolean): Set<string> {
  const next = new Set([...abiertas].filter(tieneErrores));
  next.add(nueva);
  return next;
}

export function alternar(abiertas: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(abiertas);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * Total informativo: solo suma montos válidos. Con faltantes o inválidos se rotula «al menos» y se
 * dice cuántos no suman (auditoría fase 1, P1-2).
 */
export function totalInformativo(count: number, known: number, missing: number, invalid: number): string {
  if (count === 0) return 'ninguno';
  const sinMonto = missing + invalid;
  const notas = [missing ? `falta el monto de ${missing}` : null, invalid ? `${invalid} con datos inválidos, no suma${invalid === 1 ? '' : 'n'}` : null].filter(Boolean);
  if (sinMonto === count) return `sin monto calculable (${notas.join('; ')})`;
  return `${sinMonto ? 'al menos ' : ''}${formatClp(known)}${notas.length ? ` (${notas.join('; ')})` : ''}`;
}
