/**
 * A-90, Frente A — herramienta de medición integrada con el contrato PUBLICADO de Codex (#55, 89c9139):
 * presupuesto con `crearPresupuesto` (sin motor propio), sello con `envolverOriginal`, paquete con
 * `crearPaquete`/`verificarPaquete`, comparación con `compararFicha`; respaldo todo o nada; clasificación
 * honesta (tiempos no desglosados, independencia, base tributaria) y formato anterior conservado.
 * Sin red ni navegador; datos ficticios.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildCostItems } from '../src/engine/inputs';
import { computeMeasures } from '../src/engine/measures';
import { displayAmount } from '../src/engine/rounding';
import { AlmacenMemoria, COLECCIONES, type Almacen } from '../src/medicion/almacen';
import {
  aliasPresentacion,
  CRITERIOS_12,
  FORMATO_ANTERIOR,
  fichaDeViaje,
  fichaPrevia,
  informeViaje,
  paqueteMedicion,
  previsualizar,
  verificarSelloLocal,
} from '../src/medicion/campo';
import { BOM, cargasCsv, celda, COLUMNAS_COMPARACION, COLUMNAS_VIAJES, comparacionCsv, csv, viajesCsv } from '../src/medicion/exportar';
import cotizacion from '../src/medicion/fixtures/cotizacion-v3-ficticia.json';
import type { PresupuestoAnterior, PresupuestoLocal, PresupuestoSellado, Tramo, Viaje } from '../src/medicion/modelo';
import { construirPlan, declarado, entradaDesdePlan, entradaDesdeVehiculo, entradaVacia, leerCotizacion, type OpcionesPlan } from '../src/medicion/presupuesto';
import {
  CONSERVAR_FOTO_POR_DEFECTO,
  exportarRespaldo,
  fusionarRespaldo,
  guardarPresupuesto,
  leerRespaldo,
  registrarLectura,
  RespaldoInvalidoError,
  SelloInmutableError,
  siguienteCodigo,
  type Respaldo,
} from '../src/medicion/repositorio';
import { anular, sellar } from '../src/medicion/sello';
import { crearPresupuesto, envolverOriginal, huellaCanonica, verificarPaquete, VERSION_MOTOR } from '../src/shared/campo/index.js';
import { procedencia } from '../src/shared/procedencia';
import { snapshotV3Schema } from '../src/shared/snapshot';
import { carga, T0, vehiculo, viaje } from './medicion-fixtures';

const lec = (valor: number) => ({ valor, clase: 'medido' as const, fotoId: null, confirmadaEl: T0 });

function entradaBase(opciones: Partial<OpcionesPlan> = {}) {
  const e = entradaDesdeVehiculo(vehiculo());
  e.km = declarado(18);
  e.marchaMin = declarado(35);
  e.cargaMin = declarado(10);
  e.descargaMin = declarado(10);
  e.tag = declarado(1800);
  e.otros = declarado(0);
  e.ayudantes = declarado(0);
  e.opciones = { ...e.opciones, ...opciones };
  return e;
}

async function presupuestoSellado(fecha = '2026-11-20T10:00:00.000Z', codigo = 'viaje-001', opciones: Partial<OpcionesPlan> = {}): Promise<PresupuestoSellado> {
  const { plan, procedencia: proc } = construirPlan(entradaBase(opciones), 'personal', 0.1);
  return sellar({ ficha: fichaPrevia('personal', 'veh-001', 'auto', plan), codigo, fecha, vehiculoId: 'v-1', meta: { procedencia: proc, origen: { tipo: 'nuevo' } }, ahora: T0 });
}

/** Registro del FORMATO ANTERIOR (d856dcd): `datos.version: 2` con procedencia y origen dentro de lo sellado. */
function presupuestoAnterior(): PresupuestoAnterior {
  const datos = {
    version: 2 as const,
    id: 'viaje-001',
    uso: 'personal' as const,
    vehiculo: 'veh-001',
    tipoVehiculo: 'auto' as const,
    fecha: '2026-11-20T10:00:00.000Z',
    versionMotor: null,
    plan: { baseClp: null, ajusteHasta: null, km: [18, 'DECLARADO'], marchaMin: [35, 'DECLARADO'] },
    resultado: { costoClp: 5000, tipo: 'cotaInferior' },
    procedencia: { km: procedencia('declarado', 'usuario') },
    origen: { tipo: 'nuevo' },
  };
  return {
    id: 'pres-anterior',
    formato: 1,
    vehiculoId: 'v-1',
    datos,
    sha256: createHash('sha256').update(JSON.stringify(datos)).digest('hex'),
    estado: 'sellado',
    anuladoEl: null,
    motivoAnulacion: null,
    reemplazaA: null,
    creadoEl: T0,
    editadoEl: T0,
  };
}

const tramosConEstados = (): Tramo[] => [
  { tipo: 'marcha', inicio: T0, fin: '2026-11-20T08:20:00.000-03:00' },
  { tipo: 'carga', inicio: '2026-11-20T08:20:00.000-03:00', fin: '2026-11-20T08:30:00.000-03:00' },
  { tipo: 'espera', inicio: '2026-11-20T08:30:00.000-03:00', fin: '2026-11-20T08:35:00.000-03:00' },
  { tipo: 'marcha', inicio: '2026-11-20T08:35:00.000-03:00', fin: '2026-11-20T08:40:00.000-03:00' },
];

async function volcado(a: Almacen): Promise<string> {
  const out: Record<string, unknown> = {};
  for (const c of COLECCIONES) out[c] = await a.listar(c);
  return JSON.stringify(out);
}

describe('presupuesto con el contrato de #55 (sin motor propio)', () => {
  it('el formulario vacío no inventa valores: todo DATO FALTANTE y el contrato no sella', () => {
    const { plan } = construirPlan(entradaVacia(), 'personal', null);
    expect(plan.modalidad).toBe('simplificada');
    expect(Object.entries(plan).filter(([k]) => k !== 'modalidad').every(([, v]) => v === null)).toBe(true);
    expect(previsualizar(fichaPrevia('personal', 'veh-001', 'auto', plan), 'viaje-001', '2026-11-20T10:00:00.000Z').error).toMatch(/dato previsto/);
  });

  it('el resultado sellado es el de `crearPresupuesto` y coincide con llamar al motor directamente', async () => {
    const { plan } = construirPlan(entradaBase(), 'personal', 0.1);
    const ficha = fichaPrevia('personal', 'veh-001', 'auto', plan);
    const p = await presupuestoSellado();
    expect(p.datos).toEqual(crearPresupuesto(ficha, 'viaje-001', '2026-11-20T10:00:00.000Z', VERSION_MOTOR));
    const items = buildCostItems(18, 35, { fuelPricePerL: 1290, kmPerL: 12.4, wearPerKm: null, fixedPerHour: null, ownerPerHour: null, helpers: 0, helperFee: null, loadMinutes: 20, tolls: 1800, otherCosts: 0 });
    const incluidas = items.filter((i) => i.id !== 'gastosFijos');
    expect(p.datos.resultado.costoClp).toBe(displayAmount(computeMeasures({ items: incluidas, margin: 0, surcharges: 0 }).cost));
    expect(p.datos.resultado.partidas.combustible).toBe(items[0]!.amount);
    expect(p.datos.resultado.sugeridoClp).toBeNull(); // uso personal: sin precio sugerido
    expect(p.datos.versionMotor).toEqual(VERSION_MOTOR);
  });

  it('la simplificada NO suma gastos fijos; la detallada sí (lo decide el contrato)', () => {
    const e = entradaBase();
    e.fijoHora = declarado(6000);
    const ver = (modalidad: 'simplificada' | 'detallada') => {
      const { plan, avisos } = construirPlan({ ...e, opciones: { ...e.opciones, modalidad } }, 'personal', null);
      return { r: previsualizar(fichaPrevia('personal', 'veh-001', 'auto', plan), 'viaje-001', '2026-11-20T10:00:00.000Z').datos!.resultado, avisos };
    };
    const s = ver('simplificada');
    const d = ver('detallada');
    expect(s.r.partidas.gastosFijos).toBeNull();
    expect(s.avisos.join(' ')).toMatch(/simplificada/);
    expect(d.r.partidas.gastosFijos).toBeGreaterThan(0);
    expect(d.r.costoClp! - s.r.costoClp!).toBe(Math.round(d.r.partidas.gastosFijos!));
  });

  it('un dato faltante deja su partida faltante, nunca 0', () => {
    const e = entradaBase();
    e.descargaMin = entradaVacia().descargaMin;
    e.trabajoHora = declarado(6000);
    const { plan } = construirPlan(e, 'personal', null);
    const r = previsualizar(fichaPrevia('personal', 'veh-001', 'auto', plan), 'viaje-001', '2026-11-20T10:00:00.000Z').datos!.resultado;
    expect(r.partidas.remuneracion).toBeNull();
    expect(r.tipo).toBe('cotaInferior');
  });

  it('la clase del precio sigue a su fuente; sin fuente queda faltante', () => {
    const e = entradaBase();
    expect(construirPlan(e, 'personal', null).plan.precioLitro).toEqual([1290, 'COMPROBADO']);
    e.fuentePrecio = 'surtidor';
    expect(construirPlan(e, 'personal', null).plan.precioLitro).toEqual([1290, 'MEDIDO']);
    e.fuentePrecio = null;
    const r = construirPlan(e, 'personal', null);
    expect(r.plan.precioLitro).toBeNull();
    expect(r.avisos.join(' ')).toMatch(/precio/);
  });

  it('un valor SIMULADO no entra en una medición personal; en una simulación todo queda SIMULADO', () => {
    const e = entradaBase({ incertidumbreKm: 0.5 });
    e.kmL = { valor: 9, procedencia: procedencia('simulado', 'ejemplo') };
    const p = construirPlan(e, 'personal', null);
    expect(p.plan.kmL).toBeNull();
    expect(p.avisos.join(' ')).toMatch(/ejemplo/);
    const s = construirPlan(entradaBase({ incertidumbreKm: 0.5 }), 'simulacion', 0.1).plan;
    expect(Object.values(s).filter(Array.isArray).every((d) => (d as unknown[])[1] === 'SIMULADO')).toBe(true);
  });

  it('captura base tributaria, ajuste y precisión que pide el contrato, sin inventarlos', () => {
    const vacio = construirPlan(entradaBase(), 'personal', null);
    expect(vacio.plan).toMatchObject({ baseClp: null, ajusteHasta: null, muestraPrevista: null, incertidumbreKm: null, resolucionKm: null });
    expect(vacio.avisos.join(' ')).toMatch(/base tributaria/);
    const p = construirPlan(entradaBase({ baseClp: 'con_iva', ajusteHasta: { fecha: '2026-11-01', odometro: 900 }, muestraPrevista: 'validacion', incertidumbreKm: 0.2 }), 'personal', 0.1).plan;
    expect(p).toMatchObject({ baseClp: 'con_iva', ajusteHasta: { fecha: '2026-11-01', odometro: 900 }, muestraPrevista: 'validacion', incertidumbreKm: [0.2, 'DECLARADO'], resolucionKm: [0.1, 'DECLARADO'] });
    // Un corte posterior al sello lo rechaza el contrato.
    const tarde = construirPlan(entradaBase({ ajusteHasta: { fecha: '2026-11-25', odometro: 900 } }), 'personal', null).plan;
    expect(previsualizar(fichaPrevia('personal', 'veh-001', 'auto', tarde), 'viaje-001', '2026-11-20T10:00:00.000Z').error).toMatch(/calibración/);
  });
});

describe('cotización guardada → presupuesto', () => {
  it('el fixture es una v3 válida y explícitamente ficticia', () => {
    expect(cotizacion.ficticia).toBe(true);
    expect(snapshotV3Schema.safeParse(cotizacion.snapshot).success).toBe(true);
  });

  it('v3: parámetros y procedencia; modalidad detallada como el cotizador; el costo del contrato coincide', () => {
    const c = leerCotizacion(cotizacion);
    expect(c).toMatchObject({ schemaVersion: 3, folio: 'FICT-0001', ficticia: true });
    expect(c.entrada.opciones.modalidad).toBe('detallada');
    expect(c.entrada.kmL.procedencia.clase).toBe('declarado');
    expect(c.entrada.margenPct.valor).toBe(20);
    const { plan } = construirPlan(c.entrada, 'personal', null);
    expect(previsualizar(fichaPrevia('personal', 'veh-001', 'auto', plan), 'viaje-001', '2026-11-20T10:00:00.000Z').datos!.resultado.costoClp).toBe(cotizacion.snapshot.costEstimate);
  });

  it('v1/v2: sin parámetros, quedan faltantes (nunca recalculados)', () => {
    const v1 = { routeSource: 'simulado', km: 10, minutes: 20, costEstimate: 1, costType: 'estimado', suggestedPrice: 1000, margin: 0.1, missing: [], engineVersion: 'motor-1.0.0' };
    const c = leerCotizacion(v1);
    expect(c.schemaVersion).toBe(1);
    expect(c.entrada.kmL.valor).toBeNull();
    expect(c.entrada.km.procedencia.clase).toBe('simulado');
    expect(c.avisos.join(' ')).toMatch(/faltantes/);
  });

  it('rechaza versiones desconocidas y archivos que no son cotizaciones (control negativo)', () => {
    expect(() => leerCotizacion({ schemaVersion: 9, engineVersion: 'x' })).toThrow(/desconocida/);
    expect(() => leerCotizacion({ hola: 1 })).toThrow();
    expect(() => leerCotizacion([1, 2])).toThrow();
  });
});

describe('sello con el contrato de #55', () => {
  it('huella de `envolverOriginal` (canónica v3); metadata propia FUERA del original; datos congelados', async () => {
    const p = await presupuestoSellado();
    expect(p.datos.version).toBe(3);
    expect(p.sha256).toBe((await envolverOriginal(p.datos)).sha256);
    expect(p.sha256).toBe(await huellaCanonica(p.datos));
    expect(Object.keys(p.datos).sort()).toEqual(['fecha', 'id', 'plan', 'resultado', 'tipoVehiculo', 'uso', 'vehiculo', 'version', 'versionMotor']);
    expect(p.meta.procedencia.km?.clase).toBe('declarado');
    expect(await verificarSelloLocal(p)).toEqual({ ok: true, motivo: null });
    expect(Object.isFrozen(p.datos) && Object.isFrozen(p.datos.plan)).toBe(true);
  });

  it('datos alterados ⇒ no verifica; ni con la huella recalculada se puede editar con el mismo id', async () => {
    const a = new AlmacenMemoria();
    const p = await presupuestoSellado();
    await guardarPresupuesto(a, p);
    const alterado = structuredClone(p);
    alterado.datos.plan.km = [99, 'DECLARADO'];
    expect((await verificarSelloLocal(alterado)).ok).toBe(false);
    await expect(guardarPresupuesto(a, alterado)).rejects.toBeInstanceOf(SelloInmutableError);
    const resellado = { ...alterado, sha256: (await envolverOriginal(alterado.datos)).sha256 };
    await expect(guardarPresupuesto(a, resellado)).rejects.toThrow(/no se edita/);
  });

  it('un original con campos extra (p. ej., procedencia dentro) no verifica: el validador es estricto', async () => {
    const p = await presupuestoSellado();
    const datos = { ...structuredClone(p.datos), procedencia: {} } as unknown as PresupuestoSellado['datos'];
    const conExtra = { ...structuredClone(p), datos, sha256: (await envolverOriginal(datos)).sha256 };
    expect((await verificarSelloLocal(conExtra)).ok).toBe(false);
  });

  it('anular conserva datos y huella; un anulado no se reactiva', async () => {
    const a = new AlmacenMemoria();
    const p = await presupuestoSellado();
    await guardarPresupuesto(a, p);
    const an = anular(p, 'corregido', T0);
    await guardarPresupuesto(a, an);
    expect(an.sha256).toBe(p.sha256);
    expect(an.datos).toEqual(p.datos);
    await expect(guardarPresupuesto(a, p)).rejects.toThrow(/reactiva/);
  });

  it('corregir = sellar otro con el mismo código (desde el plan y la metadata) y anular el anterior', async () => {
    const p = await presupuestoSellado(undefined, undefined, { baseClp: 'neto' });
    const e = entradaDesdePlan(p.datos.plan, p.meta.procedencia);
    expect(e.km.valor).toBe(18);
    expect(e.precioLitro.procedencia.clase).toBe('comprobado');
    expect(e.opciones).toMatchObject({ modalidad: 'simplificada', baseClp: 'neto' });
    expect(siguienteCodigo({ viajes: [viaje({ codigo: 'viaje-007' })], presupuestos: [p] })).toBe('viaje-008');
  });

  it('un sello del FORMATO ANTERIOR se conserva tal cual: verifica con su huella original y no se vuelve a sellar', async () => {
    const a = new AlmacenMemoria();
    const viejo = presupuestoAnterior();
    const antes = JSON.stringify(viejo);
    expect(await verificarSelloLocal(viejo)).toEqual({ ok: true, motivo: null });
    await guardarPresupuesto(a, viejo);
    expect(JSON.stringify(await a.obtener('presupuestos', viejo.id))).toBe(antes);
    const alterado = structuredClone(viejo);
    alterado.datos.id = 'viaje-002';
    expect((await verificarSelloLocal(alterado)).ok).toBe(false);
    // Comparación y paquete: «formato anterior, no comparable», sin original.
    const d = { vehiculos: [vehiculo()], presupuestos: [viejo], viajes: [viaje({ presupuestoId: viejo.id })], cargas: [] };
    const r = await informeViaje(d, d.viajes[0]!);
    expect(r.notas.join(' ')).toContain(FORMATO_ANTERIOR);
    expect(r.informe?.estadoPresupuesto).toBe('sin presupuesto previo');
    const { paquete } = await paqueteMedicion(d);
    expect(paquete.viajes[0]!.original).toBeNull();
    const fila = viajesCsv(d).replace(BOM, '').split('\r\n')[1]!.split(';');
    expect(fila[COLUMNAS_VIAJES.indexOf('presupuesto_formato')]).toBe(FORMATO_ANTERIOR);
    expect(fila[COLUMNAS_VIAJES.indexOf('sello_sha256_12')]).toBe(viejo.sha256.slice(0, 12));
    expect(JSON.stringify(viejo)).toBe(antes);
  });
});

describe('fotos (D-3): no se conservan por defecto', () => {
  it('sin elegir conservar: la lectura no guarda la foto ni la re-codifica', async () => {
    expect(CONSERVAR_FOTO_POR_DEFECTO).toBe(false);
    const a = new AlmacenMemoria();
    const recodificar = vi.fn(async (b: Blob) => b);
    const v = await registrarLectura(a, viaje(), 'inicial', 'trip', 0, { ahora: T0, foto: new Blob(['jpeg-falso'], { type: 'image/jpeg' }), recodificar });
    expect(v.lecturas.inicial.trip?.fotoId).toBeNull();
    expect(recodificar).not.toHaveBeenCalled();
    expect(await a.listar('fotos')).toEqual([]);
  });

  it('si el usuario la conserva, pasa por la re-codificación y queda solo en el almacén local', async () => {
    const a = new AlmacenMemoria();
    const limpia = new Blob(['limpia'], { type: 'image/jpeg' });
    const v = await registrarLectura(a, viaje(), 'final', 'odometro', 48219, { ahora: T0, foto: new Blob(['Exif-GPS']), conservar: true, recodificar: async () => limpia });
    expect(v.lecturas.final.odometro?.fotoId).toBeTruthy();
    expect(await a.listar('fotos')).toHaveLength(1);
    await expect(registrarLectura(a, viaje(), 'final', 'trip', 1, { ahora: T0, foto: new Blob(['x']), conservar: true })).rejects.toThrow(/EXIF/);
    // Ni el CSV ni el paquete llevan fotos ni su identificador.
    const d = { vehiculos: [vehiculo()], presupuestos: [], viajes: [v], cargas: [] };
    const salida = viajesCsv(d) + JSON.stringify((await paqueteMedicion(d)).paquete);
    expect(salida).not.toContain(v.lecturas.final.odometro!.fotoId!);
    expect(salida).not.toMatch(/data:image|fotoId/);
  });
});

describe('clasificación honesta', () => {
  it('tiempos NO desglosados: el total no se convierte en marcha medida; queda DATO FALTANTE', async () => {
    const d = { vehiculos: [vehiculo()], presupuestos: [], viajes: [viaje()], cargas: [] };
    const { ficha, notas } = fichaDeViaje(d, d.viajes[0]!);
    expect(ficha.observacion).toMatchObject({ marchaMin: null, esperaMin: null, cargaMin: null, descargaMin: null });
    expect(notas.join(' ')).toMatch(/sin desglosar/);
    const fila = viajesCsv(d).replace(BOM, '').split('\r\n')[1]!.split(';');
    expect(fila[COLUMNAS_VIAJES.indexOf('total_min')]).toBe('40');
    expect(fila[COLUMNAS_VIAJES.indexOf('marcha_min')]).toBe('');
    expect(fila[COLUMNAS_VIAJES.indexOf('tiempos_desglosados')]).toBe('no');
    const r = await informeViaje(d, d.viajes[0]!);
    expect(r.informe!.recorrido.marchaMin).toMatchObject({ referencia: null, evidencia: 'DATO FALTANTE' });
  });

  it('con botones de estado los minutos son MEDIDO; con horas escritas después, DECLARADO', () => {
    const d = { vehiculos: [vehiculo()], presupuestos: [], viajes: [viaje({ tramos: tramosConEstados() })], cargas: [] };
    expect(fichaDeViaje(d, d.viajes[0]!).ficha.observacion).toMatchObject({ marchaMin: [25, 'MEDIDO'], cargaMin: [10, 'MEDIDO'], esperaMin: [5, 'MEDIDO'], descargaMin: [0, 'MEDIDO'] });
    const editado = viaje({ tramos: tramosConEstados(), horaEditada: true });
    expect(fichaDeViaje({ ...d, viajes: [editado] }, editado).ficha.observacion.marchaMin).toEqual([25, 'DECLARADO']);
  });

  it('medido ≠ declarado: lecturas declaradas y TRIP reiniciado dan km DECLARADO', () => {
    const v = viaje({ lecturas: { inicial: { trip: lec(0), odometro: null }, final: { trip: { ...lec(20.3), clase: 'declarado' }, odometro: null } } });
    const d = { vehiculos: [vehiculo()], presupuestos: [], viajes: [v], cargas: [] };
    expect(fichaDeViaje(d, v).ficha.observacion.km).toEqual([20.3, 'DECLARADO']);
    const r = viaje({ tripReiniciadoKm: 21 });
    expect(fichaDeViaje({ ...d, viajes: [r] }, r).ficha.observacion.km).toEqual([21, 'DECLARADO']);
    expect(fichaDeViaje({ ...d, viajes: [viaje()] }, viaje()).ficha.observacion.km).toEqual([20.3, 'MEDIDO']);
  });

  it('intervalos: litros solo con boleta o surtidor; «lo recuerdo» queda faltante y no hay km/L', () => {
    const v = viaje({ lecturas: { inicial: { trip: lec(0), odometro: lec(1120) }, final: { trip: lec(20.3), odometro: lec(1141) } } });
    const cs = [carga('2026-11-01T10:00:00.000-03:00', 40, 1000, true), carga('2026-11-25T10:00:00.000-03:00', 31.82, 1300, true, { fuentePrecio: 'declaracion' })];
    const i = fichaDeViaje({ vehiculos: [vehiculo()], presupuestos: [], viajes: [v], cargas: cs }, v).ficha.observacion.intervalo!;
    expect(i.recargas[0]!.litros).toEqual([40, 'COMPROBADO']);
    expect(i.recargas[1]!.litros).toBeNull();
    expect(i.zona).toBe('America/Santiago');
  });

  it('la independencia NO es automática: una referencia no nula no basta (la decide el contrato)', async () => {
    const p = await presupuestoSellado(undefined, undefined, { baseClp: 'neto' });
    // Plan sin TAG: el presupuesto no tiene partida de peajes; el comprobante sí existe.
    const sinTag = structuredClone(p.datos.plan);
    sinTag.tag = null;
    const q = await sellar({ ficha: fichaPrevia('personal', 'veh-001', 'auto', sinTag), codigo: 'viaje-001', fecha: '2026-11-20T10:00:00.000Z', vehiculoId: 'v-1', meta: p.meta, ahora: T0 });
    const v = viaje({ presupuestoId: q.id, baseClp: 'neto', comprobantes: [{ ref: 'doc-001-01', partida: 'peajes', clp: 1800 }], cobertura: { peajes: 'completa', ayudantes: null, otros: null } });
    const d = { vehiculos: [vehiculo()], presupuestos: [q], viajes: [v], cargas: [] };
    const filas = (await comparacionCsv(d)).replace(BOM, '').split('\r\n').map((f) => f.split(';'));
    const col = (k: string) => COLUMNAS_COMPARACION.indexOf(k);
    const peajes = filas.find((f) => f[col('partida')] === 'peajes')!;
    expect(peajes[col('referencia')]).toBe('1800');
    expect(peajes[col('comparable_independiente')]).toBe('no');
    const km = filas.find((f) => f[col('partida')] === 'km')!;
    expect(km[col('comparable_independiente')]).toBe('');
  });

  it('base tributaria: sin base no hay diferencia en pesos; con la misma base, sí', async () => {
    const sinBase = await presupuestoSellado();
    const comp = { comprobantes: [{ ref: 'doc-001-01', partida: 'peajes' as const, clp: 1800 }], cobertura: { peajes: 'completa' as const, ayudantes: null, otros: null } };
    const v1 = viaje({ presupuestoId: sinBase.id, ...comp });
    const r1 = (await informeViaje({ vehiculos: [vehiculo()], presupuestos: [sinBase], viajes: [v1], cargas: [] }, v1)).informe!;
    expect(r1.comparacionClp.peajes.original.diferencia).toBeNull();
    expect(r1.conciliacionIndependiente.motivos.join(' ')).toMatch(/base tributaria/);
    const conBase = await presupuestoSellado(undefined, undefined, { baseClp: 'neto' });
    const v2 = viaje({ presupuestoId: conBase.id, baseClp: 'neto', ...comp });
    const r2 = (await informeViaje({ vehiculos: [vehiculo()], presupuestos: [conBase], viajes: [v2], cargas: [] }, v2)).informe!;
    expect(r2.comparacionClp.peajes.original).toMatchObject({ previsto: 1800, referencia: 1800, diferencia: 0, sentido: 'igual' });
  });
});

describe('exportación CSV para Excel (D-5)', () => {
  it('BOM, separador ;, coma decimal, sin separador de miles, escapado y protección de fórmulas', () => {
    expect(celda(12.5)).toBe('12,5');
    expect(celda(48213)).toBe('48213');
    expect(celda(null)).toBe('');
    expect(celda('a;b')).toBe('"a;b"');
    expect(celda('di "x"')).toBe('"di ""x"""');
    expect(celda('l1\nl2')).toBe('"l1\nl2"');
    expect(celda('=1+1')).toBe("'=1+1");
    expect(celda('-2')).toBe("'-2");
    expect(celda(true)).toBe('sí');
    const t = csv(['a', 'b'], [[1.5, 'x']]);
    expect(t.startsWith(BOM)).toBe(true);
    expect(t).toBe(`${BOM}a;b\r\n1,5;x\r\n`);
  });

  it('viajes.csv, cargas.csv y comparacion.csv (informe del contrato) con datos ficticios', async () => {
    const p = await presupuestoSellado();
    const v = viaje({ presupuestoId: p.id, tramos: tramosConEstados(), lecturas: { inicial: { trip: lec(0), odometro: lec(1120) }, final: { trip: lec(20.3), odometro: lec(1141) } } });
    const cs = [carga('2026-11-01T10:00:00.000-03:00', 40, 1000, true), carga('2026-11-25T10:00:00.000-03:00', 31.82, 1300, true)];
    const d = { vehiculos: [vehiculo()], presupuestos: [p], viajes: [v], cargas: cs };
    const vc = viajesCsv(d).replace(BOM, '').split('\r\n');
    expect(vc[0]!.split(';')).toEqual(COLUMNAS_VIAJES);
    const fila = vc[1]!.split(';');
    expect(fila[COLUMNAS_VIAJES.indexOf('km')]).toBe('20,3');
    expect(fila[COLUMNAS_VIAJES.indexOf('km_fuente')]).toBe('trip');
    expect(fila[COLUMNAS_VIAJES.indexOf('marcha_min')]).toBe('25');
    expect(fila[COLUMNAS_VIAJES.indexOf('intervalo_id')]).toBe('I-01');
    expect(fila[COLUMNAS_VIAJES.indexOf('modalidad')]).toBe('simplificada');
    expect(fila[COLUMNAS_VIAJES.indexOf('sello_sha256_12')]).toBe(p.sha256.slice(0, 12));
    expect(cargasCsv(d)).toContain(';31,82;1290;41048;');
    const cmp = await comparacionCsv(d);
    expect(cmp.replace(BOM, '').split('\r\n')[0]!.split(';')).toEqual(COLUMNAS_COMPARACION);
    expect(cmp).toContain('viaje-001;km;km;previo al viaje o simulación;18;;20,3;MEDIDO;-2,3;');
    expect(cmp).toContain('viaje-001;gastosFijos;CLP;');
    expect(cmp).toMatch(/;excluida;/); // simplificada: fijos fuera de alcance
  });
});

describe('paquete-medicion.json con el contrato de #55', () => {
  it('crearPaquete: pasa verificarPaquete; huella del sobre completo; solo viajes cerrados; original intacto', async () => {
    const p = await presupuestoSellado();
    const v = viaje({ presupuestoId: p.id, comprobantes: [{ ref: 'doc-001-01', partida: 'peajes', clp: 1800 }], cobertura: { peajes: 'completa', ayudantes: null, otros: null } });
    const abierto = viaje({ id: 'via-2', codigo: 'viaje-002', estado: 'en curso', fin: null });
    const { paquete, excluidos } = await paqueteMedicion({ vehiculos: [vehiculo()], presupuestos: [p], viajes: [v, abierto], cargas: [] });
    await expect(verificarPaquete(JSON.parse(JSON.stringify(paquete)))).resolves.toBeUndefined();
    expect(excluidos).toEqual([]);
    expect(paquete.formato).toBe(1);
    expect(paquete.viajes).toHaveLength(1);
    expect(paquete.sha256).toBe(await huellaCanonica({ formato: 1, viajes: paquete.viajes }));
    const [x] = paquete.viajes;
    expect(x!.original).toEqual({ datos: p.datos, sha256: p.sha256 });
    expect(x!.ficha.plan.modalidad).toBe('simplificada');
    expect(x!.ficha.observacion.km).toEqual([20.3, 'MEDIDO']);
    // Paquete alterado: verificarPaquete lo rechaza (control negativo).
    const malo = JSON.parse(JSON.stringify(paquete));
    malo.viajes[0].ficha.observacion.km = [99, 'MEDIDO'];
    await expect(verificarPaquete(malo)).rejects.toThrow(/huella/);
  });

  it('un presupuesto anulado no viaja como original', async () => {
    const p = anular(await presupuestoSellado(), 'x', T0);
    const { paquete } = await paqueteMedicion({ vehiculos: [vehiculo()], presupuestos: [p], viajes: [viaje({ presupuestoId: p.id })], cargas: [] });
    expect(paquete.viajes[0]!.original).toBeNull();
  });

  it('colisión de alias viaje-NNN entre dispositivos: alias de presentación, excluidos del paquete y sellos intactos', async () => {
    const a = await presupuestoSellado(undefined, 'viaje-001');
    const b = await presupuestoSellado('2026-11-21T10:00:00.000Z', 'viaje-001');
    const huellas = [a.sha256, b.sha256, JSON.stringify(a.datos), JSON.stringify(b.datos)];
    const va = viaje({ id: 'aaaaaa-1', presupuestoId: a.id });
    const vb = viaje({ id: 'bbbbbb-2', presupuestoId: b.id, inicio: '2026-11-21T08:00:00.000-03:00', fin: '2026-11-21T08:40:00.000-03:00', tramos: [{ tipo: 'marcha', inicio: '2026-11-21T08:00:00.000-03:00', fin: '2026-11-21T08:40:00.000-03:00' }] });
    const otro = viaje({ id: 'cccccc-3', codigo: 'viaje-003', inicio: '2026-11-22T08:00:00.000-03:00', fin: '2026-11-22T08:40:00.000-03:00', tramos: [{ tipo: 'marcha', inicio: '2026-11-22T08:00:00.000-03:00', fin: '2026-11-22T08:40:00.000-03:00' }] });
    const d = { vehiculos: [vehiculo()], presupuestos: [a, b], viajes: [va, vb, otro], cargas: [] };
    const alias = aliasPresentacion(d.viajes.map((v) => ({ id: v.id, alias: v.codigo })));
    expect(alias.get('aaaaaa-1')).not.toBe(alias.get('bbbbbb-2'));
    expect(alias.get('cccccc-3')).toBe('viaje-003');
    const { paquete, excluidos } = await paqueteMedicion(d);
    expect(paquete.viajes.map((v) => v.id)).toEqual(['viaje-003']);
    expect(excluidos.map((x) => x.codigo)).toEqual(['viaje-001', 'viaje-001']);
    expect([a.sha256, b.sha256, JSON.stringify(a.datos), JSON.stringify(b.datos)]).toEqual(huellas);
    expect((await verificarSelloLocal(a)).ok && (await verificarSelloLocal(b)).ok).toBe(true);
  });
});

describe('respaldo TODO O NADA (D-2)', () => {
  async function telefono() {
    const tel = new AlmacenMemoria();
    const p = await presupuestoSellado();
    await tel.guardar('vehiculos', vehiculo());
    await guardarPresupuesto(tel, p);
    await tel.guardar('viajes', viaje({ presupuestoId: p.id }));
    await tel.guardar('cargas', carga('2026-11-01T10:00:00.000-03:00', 20, 1000, false));
    return { tel, p };
  }

  it('fusiona sin duplicar y es idempotente', async () => {
    const { tel } = await telefono();
    const pc = new AlmacenMemoria();
    await pc.guardar('vehiculos', vehiculo());
    await pc.guardar('viajes', viaje({ id: 'via-pc', codigo: 'viaje-050', inicio: '2026-11-22T08:00:00.000-03:00' }));
    const r1 = await fusionarRespaldo(pc, leerRespaldo(JSON.stringify(await exportarRespaldo(tel, T0))));
    expect(r1).toMatchObject({ escrito: true, agregados: 3, iguales: 1, conflictos: [] });
    const r2 = await fusionarRespaldo(pc, leerRespaldo(JSON.stringify(await exportarRespaldo(tel, T0))));
    expect(r2).toMatchObject({ escrito: true, agregados: 0 });
    expect(await pc.listar('viajes')).toHaveLength(2);
  });

  it('conflicto (mismo id, distinto contenido): se informa y NO se escribe nada sin decisión explícita', async () => {
    const { tel, p } = await telefono();
    const pc = new AlmacenMemoria();
    await fusionarRespaldo(pc, await exportarRespaldo(tel, T0));
    await tel.guardar('viajes', viaje({ presupuestoId: p.id, recorrido: 'urbano', editadoEl: '2026-11-21T09:00:00.000-03:00' }));
    await tel.guardar('cargas', carga('2026-11-02T10:00:00.000-03:00', 15, 1100, false));
    const antes = await volcado(pc);
    const r = await fusionarRespaldo(pc, await exportarRespaldo(tel, T0));
    expect(r.escrito).toBe(false);
    expect(r.conflictos).toHaveLength(1);
    expect(r.conflictos[0]).toMatch(/viaje-001/);
    expect(await volcado(pc)).toBe(antes); // ni siquiera la carga nueva
    const ok = await fusionarRespaldo(pc, await exportarRespaldo(tel, T0), { reemplazarMasRecientes: true });
    expect(ok).toMatchObject({ escrito: true, actualizados: 1, agregados: 1 });
    expect((await pc.obtener<Viaje>('viajes', 'via-1'))?.recorrido).toBe('urbano');
  });

  it('sello alterado: error, nada escrito (tampoco los registros válidos del mismo respaldo)', async () => {
    const { tel } = await telefono();
    const pc = new AlmacenMemoria();
    const r = await exportarRespaldo(tel, T0);
    const malo = structuredClone(r.presupuestos[0]!) as PresupuestoSellado;
    malo.datos.plan.km = [1, 'DECLARADO'];
    r.presupuestos = [malo];
    const antes = await volcado(pc);
    await expect(fusionarRespaldo(pc, r)).rejects.toBeInstanceOf(RespaldoInvalidoError);
    await expect(fusionarRespaldo(pc, r)).rejects.toThrow(/sello no verifica/);
    expect(await volcado(pc)).toBe(antes);
  });

  it('referencia rota (viaje sin vehículo, viaje sin su presupuesto): error y nada escrito', async () => {
    const { tel } = await telefono();
    const pc = new AlmacenMemoria();
    const r = await exportarRespaldo(tel, T0);
    const sinVeh: Respaldo = { ...r, vehiculos: [] };
    await expect(fusionarRespaldo(pc, sinVeh)).rejects.toThrow(/vehículo no existe/);
    const sinPres: Respaldo = { ...r, presupuestos: [] };
    await expect(fusionarRespaldo(pc, sinPres)).rejects.toThrow(/presupuesto no existe/);
    expect(await volcado(pc)).toBe(await volcado(new AlmacenMemoria()));
  });

  it('dos sellos distintos con el mismo id: error (un sello nunca se sobrescribe), nada escrito', async () => {
    const { tel, p } = await telefono();
    const pc = new AlmacenMemoria();
    await fusionarRespaldo(pc, await exportarRespaldo(tel, T0));
    const otro = await presupuestoSellado('2026-11-20T09:00:00.000Z');
    const r = await exportarRespaldo(tel, T0);
    r.presupuestos = [{ ...otro, id: p.id }];
    const antes = await volcado(pc);
    await expect(fusionarRespaldo(pc, r)).rejects.toThrow(/nunca se sobrescribe/);
    expect(await volcado(pc)).toBe(antes);
  });

  it('esquema estricto: clave desconocida, tipo inválido o id repetido rechazan el archivo completo', async () => {
    const { tel } = await telefono();
    const r = await exportarRespaldo(tel, T0);
    const extra = structuredClone(r) as unknown as { viajes: Record<string, unknown>[] };
    extra.viajes[0]!.patente = 'AB1234';
    expect(() => leerRespaldo(JSON.stringify(extra))).toThrow(RespaldoInvalidoError);
    const tipo = structuredClone(r) as unknown as { cargas: Record<string, unknown>[] };
    tipo.cargas[0]!.litros = 'veinte';
    expect(() => leerRespaldo(JSON.stringify(tipo))).toThrow(/litros/);
    const pc = new AlmacenMemoria();
    await expect(fusionarRespaldo(pc, { ...r, cargas: [r.cargas[0]!, r.cargas[0]!] })).rejects.toThrow(/id repetido/);
    expect(await pc.listar('cargas')).toEqual([]);
  });

  it('«anulado» prevalece (único cambio admitido en un sello) y el formato anterior se importa tal cual', async () => {
    const { tel, p } = await telefono();
    const pc = new AlmacenMemoria();
    await fusionarRespaldo(pc, await exportarRespaldo(tel, T0));
    await guardarPresupuesto(tel, anular(p, 'corregido', T0));
    const viejo = presupuestoAnterior();
    await guardarPresupuesto(tel, viejo);
    const r = await fusionarRespaldo(pc, leerRespaldo(JSON.stringify(await exportarRespaldo(tel, T0))));
    expect(r).toMatchObject({ escrito: true, actualizados: 1, agregados: 1 });
    expect((await pc.obtener<PresupuestoLocal>('presupuestos', p.id))?.estado).toBe('anulado');
    expect(JSON.stringify(await pc.obtener('presupuestos', viejo.id))).toBe(JSON.stringify(viejo));
  });

  it('la escritura es atómica: un lote con un error no deja nada', async () => {
    const a = new AlmacenMemoria();
    await expect(a.guardarLote([{ coleccion: 'vehiculos', registro: vehiculo() }, { coleccion: 'nada' as never, registro: { id: 'x' } }])).rejects.toThrow();
    expect(await a.listar('vehiculos')).toEqual([]);
  });

  it('por defecto el respaldo no incluye fotos; rechaza archivos ajenos (control negativo)', async () => {
    const a = new AlmacenMemoria();
    await registrarLectura(a, viaje(), 'inicial', 'trip', 0, { ahora: T0, foto: new Blob(['x']), conservar: true, recodificar: async (b) => b });
    expect((await exportarRespaldo(a, T0)).fotos).toEqual([]);
    expect((await exportarRespaldo(a, T0, true)).fotos).toHaveLength(1);
    expect(() => leerRespaldo('no es json')).toThrow(/JSON/);
    expect(() => leerRespaldo(JSON.stringify({ formato: 'otro', version: 1 }))).toThrow(/no es un respaldo/);
    expect(() => leerRespaldo(JSON.stringify({ formato: 'medicion-respaldo', version: 1, exportadoEl: T0, vehiculos: [{}], presupuestos: [], viajes: [], cargas: [], ajustes: null }))).toThrow(/vehiculos\.0/);
  });

  it('borrar todo deja el almacén vacío', async () => {
    const a = new AlmacenMemoria();
    await a.guardar('vehiculos', vehiculo());
    await a.borrarTodo();
    expect(await a.listar('vehiculos')).toEqual([]);
  });
});

describe('comparación con `compararFicha` del contrato', () => {
  it('sin presupuesto: lo dice y no compara previstos', async () => {
    const d = { vehiculos: [vehiculo()], presupuestos: [], viajes: [viaje()], cargas: [] };
    const r = (await informeViaje(d, d.viajes[0]!)).informe!;
    expect(r.estadoPresupuesto).toBe('sin presupuesto previo');
    expect(r.recorrido.km!.sentido).toBe('sin comparación');
  });

  it('previo al viaje: km con signo (negativo = subestimación); combustible sin asignación; nunca «aprobado»', async () => {
    const p = await presupuestoSellado('2026-11-20T10:00:00.000Z');
    const d = { vehiculos: [vehiculo()], presupuestos: [p], viajes: [viaje({ presupuestoId: p.id })], cargas: [] };
    const res = await informeViaje(d, d.viajes[0]!);
    expect(res.sello).toEqual({ ok: true, motivo: null });
    const r = res.informe!;
    expect(r.estadoPresupuesto).toBe('previo al viaje o simulación');
    expect(r.recorrido.km).toMatchObject({ previsto: 18, referencia: 20.3, sentido: 'subestimación' });
    expect(r.referencias.intervalo.utilizable).toBe(false);
    expect(r.conciliacionIndependiente.modalidad).toBe('simplificada');
    expect(r.conciliacionIndependiente.partidas.gastosFijos.estado).toBe('excluida');
    expect(r.conciliacionIndependiente.aprobacion).toMatch(/pendiente/);
    expect(CRITERIOS_12).toMatch(/por aprobar en #12/);
  });

  it('sello posterior al inicio: cronología sin verificar y sin previstos', async () => {
    const p = await presupuestoSellado('2026-11-20T12:00:00.000Z');
    const d = { vehiculos: [vehiculo()], presupuestos: [p], viajes: [viaje({ presupuestoId: p.id })], cargas: [] };
    const r = (await informeViaje(d, d.viajes[0]!)).informe!;
    expect(r.estadoPresupuesto).toBe('cronología sin verificar');
    expect(r.recorrido.km!.previsto).toBeNull();
  });

  it('sello alterado en el dispositivo: se informa y se compara sin presupuesto', async () => {
    const p = structuredClone(await presupuestoSellado());
    p.datos.plan.km = [5, 'DECLARADO'];
    const d = { vehiculos: [vehiculo()], presupuestos: [p], viajes: [viaje({ presupuestoId: p.id })], cargas: [] };
    const r = await informeViaje(d, d.viajes[0]!);
    expect(r.sello?.ok).toBe(false);
    expect(r.notas.join(' ')).toMatch(/no se verificó/);
    expect(r.informe!.estadoPresupuesto).toBe('sin presupuesto previo');
  });
});
