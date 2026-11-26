/**
 * A-90, Frente A — herramienta de medición: presupuesto (motor vigente, sin fórmulas propias), sello
 * inmutable, almacenamiento en memoria, respaldo con fusión, fotos (D-3), exportación CSV/paquete (D-5)
 * y comparación PROVISIONAL. Sin red ni navegador; datos ficticios.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildCostItems } from '../src/engine/inputs';
import { computeMeasures } from '../src/engine/measures';
import { displayAmount } from '../src/engine/rounding';
import { AlmacenMemoria } from '../src/medicion/almacen';
import { compararViaje, CRITERIOS_12, PENDIENTE_CODEX, presentacionProvisional } from '../src/medicion/contrato-provisional';
import { BOM, cargasCsv, celda, COLUMNAS_VIAJES, comparacionCsv, csv, paqueteMedicion, viajesCsv } from '../src/medicion/exportar';
import cotizacion from '../src/medicion/fixtures/cotizacion-v3-ficticia.json';
import type { DatosPresupuesto, PresupuestoSellado, Viaje } from '../src/medicion/modelo';
import {
  construirPlan,
  declarado,
  entradaDesdePlan,
  entradaDesdeVehiculo,
  entradaVacia,
  leerCotizacion,
  recalculado,
  resultadoMotor,
} from '../src/medicion/presupuesto';
import {
  CONSERVAR_FOTO_POR_DEFECTO,
  exportarRespaldo,
  fusionarRespaldo,
  guardarPresupuesto,
  leerRespaldo,
  registrarLectura,
  SelloInmutableError,
  siguienteCodigo,
} from '../src/medicion/repositorio';
import { anular, huella, sellar, verificarSello } from '../src/medicion/sello';
import { procedencia } from '../src/shared/procedencia';
import { snapshotV3Schema } from '../src/shared/snapshot';
import { carga, T0, vehiculo, viaje } from './medicion-fixtures';

const lec = (valor: number) => ({ valor, clase: 'medido' as const, fotoId: null, confirmadaEl: T0 });

function entradaBase() {
  const e = entradaDesdeVehiculo(vehiculo());
  e.km = declarado(18);
  e.marchaMin = declarado(35);
  e.cargaMin = declarado(10);
  e.descargaMin = declarado(10);
  e.tag = declarado(1800);
  e.otros = declarado(0);
  e.ayudantes = declarado(0);
  return e;
}

async function presupuestoSellado(fecha = '2026-11-20T10:00:00.000Z', id = 'viaje-001'): Promise<PresupuestoSellado> {
  const { plan, procedencia: proc } = construirPlan(entradaBase(), 'personal', 0.1);
  const datos: DatosPresupuesto = {
    version: 2,
    id,
    uso: 'personal',
    vehiculo: 'veh-001',
    tipoVehiculo: 'auto',
    fecha,
    versionMotor: { etiqueta: 'motor-1.0.1', sha256: 'a'.repeat(64) },
    plan,
    resultado: resultadoMotor(plan, 'personal'),
    procedencia: proc,
    origen: { tipo: 'nuevo' },
  };
  return sellar(datos, 'v-1', T0);
}

describe('presupuesto con el motor vigente (sin fórmulas propias)', () => {
  it('el formulario vacío no inventa valores: todo DATO FALTANTE', () => {
    const { plan } = construirPlan(entradaVacia(), 'personal', null);
    expect(Object.values(plan).every((v) => v === null)).toBe(true);
    expect(resultadoMotor(plan, 'personal')).toBeNull();
  });

  it('el resultado coincide con llamar al motor directamente', () => {
    const { plan } = construirPlan(entradaBase(), 'personal', 0.1);
    const r = resultadoMotor(plan, 'personal')!;
    const items = buildCostItems(18, 35, { fuelPricePerL: 1290, kmPerL: 12.4, wearPerKm: null, fixedPerHour: null, ownerPerHour: null, helpers: 0, helperFee: null, loadMinutes: 20, tolls: 1800, otherCosts: 0 });
    const m = computeMeasures({ items, margin: 0, surcharges: 0 });
    expect(r.costoClp).toBe(displayAmount(m.cost));
    expect(r.faltan).toEqual(m.missing);
    expect(r.partidas.combustible).toBe(items[0]!.amount);
    expect(r.sugeridoClp).toBeNull(); // uso personal: sin precio sugerido (como #55)
  });

  it('un dato faltante deja su partida faltante, nunca 0 (descarga desconocida → fijos y remuneración faltantes)', () => {
    const e = entradaBase();
    e.descargaMin = entradaVacia().descargaMin;
    e.trabajoHora = declarado(6000);
    const r = resultadoMotor(construirPlan(e, 'personal', null).plan, 'personal')!;
    expect(r.partidas.remuneracion).toBeNull();
    expect(r.partidas.gastosFijos).toBeNull();
    e.otros = entradaVacia().otros;
    expect(resultadoMotor(construirPlan(e, 'personal', null).plan, 'personal')!.partidas.otros).toBeNull();
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
    const e = entradaBase();
    e.kmL = { valor: 9, procedencia: procedencia('simulado', 'ejemplo') };
    const p = construirPlan(e, 'personal', null);
    expect(p.plan.kmL).toBeNull();
    expect(p.avisos.join(' ')).toMatch(/ejemplo/);
    const s = construirPlan(entradaBase(), 'simulacion', 0.1).plan;
    expect(Object.values(s).filter(Array.isArray).every((d) => (d as unknown[])[1] === 'SIMULADO')).toBe(true);
  });

  it('recalculado con lo observado usa la misma fórmula con otra entrada', () => {
    const { plan } = construirPlan(entradaBase(), 'personal', null);
    expect(recalculado(plan, 20, 40, 'personal')!.partidas.combustible).toBe(buildCostItems(20, 40, { ...{ fuelPricePerL: 1290, kmPerL: 12.4 }, wearPerKm: null, fixedPerHour: null, ownerPerHour: null, helpers: 0, helperFee: null, loadMinutes: 20, tolls: 1800, otherCosts: 0 })[0]!.amount);
    expect(recalculado(plan, null, 40, 'personal')).toBeNull();
  });
});

describe('cotización guardada → presupuesto', () => {
  it('el fixture es una v3 válida y explícitamente ficticia', () => {
    expect(cotizacion.ficticia).toBe(true);
    expect(snapshotV3Schema.safeParse(cotizacion.snapshot).success).toBe(true);
  });

  it('v3: trae parámetros y procedencia; el costo del motor coincide con el de la cotización', () => {
    const c = leerCotizacion(cotizacion);
    expect(c).toMatchObject({ schemaVersion: 3, folio: 'FICT-0001', ficticia: true });
    expect(c.entrada.kmL.valor).toBe(12.4);
    expect(c.entrada.kmL.procedencia.clase).toBe('declarado');
    expect(c.entrada.fijoHora.valor).toBeNull();
    expect(c.entrada.margenPct.valor).toBe(20);
    const { plan } = construirPlan(c.entrada, 'personal', null);
    expect(resultadoMotor(plan, 'personal')!.costoClp).toBe(cotizacion.snapshot.costEstimate);
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

describe('sello inmutable', () => {
  it('huella = sha256(JSON.stringify(datos)) igual en Node y en crypto.subtle (forma de #55)', async () => {
    const p = await presupuestoSellado();
    expect(p.sha256).toBe(createHash('sha256').update(JSON.stringify(p.datos)).digest('hex'));
    expect(await verificarSello(p)).toBe(true);
    expect(Object.isFrozen(p.datos) && Object.isFrozen(p.datos.plan)).toBe(true);
  });

  it('datos alterados ⇒ huella distinta; no se pueden guardar ni editar con el mismo id', async () => {
    const a = new AlmacenMemoria();
    const p = await presupuestoSellado();
    await guardarPresupuesto(a, p);
    const alterado = structuredClone(p);
    alterado.datos.plan.km = [99, 'DECLARADO'];
    expect(await verificarSello(alterado)).toBe(false);
    await expect(guardarPresupuesto(a, alterado)).rejects.toBeInstanceOf(SelloInmutableError);
    const resellado = { ...alterado, sha256: await huella(alterado.datos) };
    await expect(guardarPresupuesto(a, resellado)).rejects.toThrow(/no se edita/);
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

  it('corregir = sellar otro con el mismo código y anular el anterior', async () => {
    const p = await presupuestoSellado();
    const e = entradaDesdePlan(p.datos.plan, p.datos.procedencia);
    expect(e.km.valor).toBe(18);
    expect(e.precioLitro.procedencia.clase).toBe('comprobado');
    expect(siguienteCodigo({ viajes: [viaje({ codigo: 'viaje-007' })], presupuestos: [p] })).toBe('viaje-008');
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
    const salida = viajesCsv(d) + JSON.stringify(await paqueteMedicion(d));
    expect(salida).not.toContain(v.lecturas.final.odometro!.fotoId!);
    expect(salida).not.toMatch(/data:image|fotoId/);
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

  it('viajes.csv, cargas.csv y comparacion.csv con datos ficticios', async () => {
    const p = await presupuestoSellado();
    const v = viaje({ presupuestoId: p.id, lecturas: { inicial: { trip: lec(0), odometro: lec(1120) }, final: { trip: lec(20.3), odometro: lec(1141) } } });
    const cs = [carga('2026-11-01T10:00:00.000-03:00', 40, 1000, true), carga('2026-11-25T10:00:00.000-03:00', 31.82, 1300, true)];
    const d = { vehiculos: [vehiculo()], presupuestos: [p], viajes: [v], cargas: cs };
    const vc = viajesCsv(d).replace(BOM, '').split('\r\n');
    expect(vc[0]!.split(';')).toEqual(COLUMNAS_VIAJES);
    const fila = vc[1]!.split(';');
    expect(fila[COLUMNAS_VIAJES.indexOf('km')]).toBe('20,3');
    expect(fila[COLUMNAS_VIAJES.indexOf('km_fuente')]).toBe('trip');
    expect(fila[COLUMNAS_VIAJES.indexOf('intervalo_id')]).toBe('I-01');
    expect(fila[COLUMNAS_VIAJES.indexOf('sello_sha256_12')]).toBe(p.sha256.slice(0, 12));
    expect(cargasCsv(d)).toContain(';31,82;1290;41048;');
    const cmp = comparacionCsv(d);
    expect(cmp).toContain('viaje-001;km;km;previo al viaje;18;;20,3;MEDIDO;-2,3;');
    expect(cmp).toContain(PENDIENTE_CODEX);
  });
});

describe('paquete-medicion.json con la forma de #55', () => {
  // Claves de `datos/pruebas-campo/plantilla-economica.json` en origin/codex/fase-0b-instrumento-campo (61e5214).
  const PLAN = ['baseClp', 'ajusteHasta', 'muestraPrevista', 'resolucionKm', 'incertidumbreKm', 'km', 'marchaMin', 'esperaMin', 'cargaMin', 'descargaMin', 'kmL', 'precioLitro', 'fuentePrecio', 'desgasteKm', 'fijoHora', 'trabajoHora', 'ayudantes', 'pagoAyudante', 'tag', 'otros', 'margenPct', 'recargos', 'cotizado'];
  const OBS = ['baseClp', 'fin', 'odometroInicial', 'odometroFinal', 'incertidumbreKm', 'inicio', 'km', 'marchaMin', 'esperaMin', 'cargaMin', 'descargaMin', 'resolucionKm', 'tipoCarga', 'recorrido', 'nivelCarga', 'aire', 'pesoKg', 'ayudantes', 'minutosAyudantes', 'equipo', 'precioLitro', 'fuentePrecio', 'cobrado', 'comprobantes', 'cobertura', 'intervalo', 'mantencion', 'fijos'];

  it('ficha y original {datos, sha256}; claves exactas de la plantilla; huella del paquete', async () => {
    const p = await presupuestoSellado();
    const v = viaje({ presupuestoId: p.id, comprobantes: [{ ref: 'doc-001-01', partida: 'peajes', clp: 1800 }], cobertura: { peajes: 'completa', ayudantes: null, otros: null } });
    const abierto = viaje({ id: 'via-2', codigo: 'viaje-002', estado: 'en curso', fin: null });
    const paq = await paqueteMedicion({ vehiculos: [vehiculo()], presupuestos: [p], viajes: [v, abierto], cargas: [] });
    expect(paq.formato).toBe(1);
    expect(paq.viajes).toHaveLength(1); // solo viajes cerrados
    const [x] = paq.viajes;
    expect(Object.keys(x!.ficha)).toEqual(['uso', 'vehiculo', 'tipoVehiculo', 'plan', 'observacion']);
    expect(Object.keys(x!.ficha.plan).sort()).toEqual([...PLAN].sort());
    expect(Object.keys(x!.ficha.observacion).sort()).toEqual([...OBS].sort());
    expect(x!.ficha.observacion.km).toEqual([20.3, 'MEDIDO']);
    expect(x!.ficha.observacion.marchaMin).toEqual([40, 'MEDIDO']);
    expect(x!.ficha.observacion.esperaMin).toBeNull(); // sin botones de estado: espera desconocida, no 0
    expect(x!.original?.sha256).toBe(p.sha256);
    expect(paq.sha256).toBe(await huella(paq.viajes));
  });

  it('un presupuesto anulado no viaja como original', async () => {
    const p = anular(await presupuestoSellado(), 'x', T0);
    const paq = await paqueteMedicion({ vehiculos: [vehiculo()], presupuestos: [p], viajes: [viaje({ presupuestoId: p.id })], cargas: [] });
    expect(paq.viajes[0]!.original).toBeNull();
  });
});

describe('respaldo exportable e importable con fusión por id (D-2)', () => {
  it('fusiona sin duplicar, conserva la edición más reciente y es idempotente', async () => {
    const tel = new AlmacenMemoria();
    const pc = new AlmacenMemoria();
    const p = await presupuestoSellado();
    await tel.guardar('vehiculos', vehiculo());
    await guardarPresupuesto(tel, p);
    await tel.guardar('viajes', viaje({ presupuestoId: p.id }));
    await tel.guardar('cargas', carga('2026-11-01T10:00:00.000-03:00', 20, 1000, false));
    await pc.guardar('viajes', viaje({ id: 'via-pc', codigo: 'viaje-050' }));
    const r1 = await fusionarRespaldo(pc, leerRespaldo(JSON.stringify(await exportarRespaldo(tel, T0))));
    expect(r1).toMatchObject({ agregados: 4, conflictos: [] });
    const r2 = await fusionarRespaldo(pc, leerRespaldo(JSON.stringify(await exportarRespaldo(tel, T0))));
    expect(r2.agregados).toBe(0);
    expect(await pc.listar('viajes')).toHaveLength(2);
    // Edición más nueva en el teléfono → gana; edición más vieja → no pisa.
    await tel.guardar('viajes', viaje({ presupuestoId: p.id, recorrido: 'urbano', editadoEl: '2026-11-21T09:00:00.000-03:00' }));
    const r3 = await fusionarRespaldo(pc, await exportarRespaldo(tel, T0));
    expect(r3.actualizados).toBe(1);
    expect((await pc.obtener<Viaje>('viajes', 'via-1'))?.recorrido).toBe('urbano');
    await tel.guardar('viajes', viaje({ presupuestoId: p.id, recorrido: 'autopista', editadoEl: '2026-11-19T09:00:00.000-03:00' }));
    await fusionarRespaldo(pc, await exportarRespaldo(tel, T0));
    expect((await pc.obtener<Viaje>('viajes', 'via-1'))?.recorrido).toBe('urbano');
  });

  it('un sello alterado no se importa; «anulado» prevalece', async () => {
    const tel = new AlmacenMemoria();
    const pc = new AlmacenMemoria();
    const p = await presupuestoSellado();
    await guardarPresupuesto(pc, p);
    await guardarPresupuesto(tel, anular(p, 'corregido', T0));
    const r = await exportarRespaldo(tel, T0);
    const malo = structuredClone(r.presupuestos[0]!);
    malo.id = 'otro';
    malo.datos.plan.km = [1, 'DECLARADO'];
    r.presupuestos.push(malo);
    const res = await fusionarRespaldo(pc, r);
    expect(res.conflictos.join(' ')).toMatch(/huella/);
    expect((await pc.obtener<PresupuestoSellado>('presupuestos', p.id))?.estado).toBe('anulado');
    expect(await pc.obtener('presupuestos', 'otro')).toBeNull();
  });

  it('por defecto el respaldo no incluye fotos; rechaza archivos ajenos (control negativo)', async () => {
    const a = new AlmacenMemoria();
    await registrarLectura(a, viaje(), 'inicial', 'trip', 0, { ahora: T0, foto: new Blob(['x']), conservar: true, recodificar: async (b) => b });
    expect((await exportarRespaldo(a, T0)).fotos).toEqual([]);
    expect((await exportarRespaldo(a, T0, true)).fotos).toHaveLength(1);
    expect(() => leerRespaldo('no es json')).toThrow(/JSON/);
    expect(() => leerRespaldo(JSON.stringify({ formato: 'otro', version: 1 }))).toThrow(/no es un respaldo/);
    expect(() => leerRespaldo(JSON.stringify({ formato: 'medicion-respaldo', version: 1, vehiculos: [{}], presupuestos: [], viajes: [], cargas: [] }))).toThrow(/dañado/);
  });

  it('borrar todo deja el almacén vacío', async () => {
    const a = new AlmacenMemoria();
    await a.guardar('vehiculos', vehiculo());
    await a.borrarTodo();
    expect(await a.listar('vehiculos')).toEqual([]);
  });
});

describe('comparación PROVISIONAL (presentación; el contrato definitivo es de Codex)', () => {
  it('sin presupuesto: lo dice y no compara previstos', () => {
    const c = compararViaje({ viaje: viaje(), vehiculo: vehiculo(), sello: null, anulado: false, intervalo: null, uso: 'personal' });
    expect(c.estadoPresupuesto).toBe('sin presupuesto previo');
    expect(c.tarjetas.find((t) => t.partida === 'km')?.diferencia?.sentido).toBe('sin comparación');
  });

  it('error firmado de km (docs/27 §1): negativo = subestimación; combustible pendiente de Codex; nunca «aprobado»', async () => {
    const p = await presupuestoSellado('2026-11-20T10:00:00.000Z');
    const c = compararViaje({ viaje: viaje({ inicio: '2026-11-20T08:00:00.000-03:00' }), vehiculo: vehiculo(), sello: p.datos, anulado: false, intervalo: null, uso: 'personal' });
    expect(c.estadoPresupuesto).toBe('previo al viaje');
    const km = c.tarjetas.find((t) => t.partida === 'km')!;
    expect(km.diferencia).toMatchObject({ previsto: 18, referencia: 20.3, sentido: 'subestimación' });
    expect(km.diferencia!.porcentaje).toBeCloseTo(((18 - 20.3) / 20.3) * 100, 10);
    const comb = c.tarjetas.find((t) => t.partida === 'combustible')!;
    expect(comb.estado).toBe(PENDIENTE_CODEX);
    expect(comb.referencia).toBeNull();
    expect(c.combustible).toBe('parcial'); // sin odómetro no hay vínculo con un intervalo
    expect(c.criterios).toBe(CRITERIOS_12);
    expect(JSON.stringify(c).replace(/por aprobar/g, '')).not.toMatch(/aprobad/i);
  });

  it('sello posterior al inicio: cronología sin verificar y sin previstos', async () => {
    const p = await presupuestoSellado('2026-11-20T12:00:00.000Z');
    const c = compararViaje({ viaje: viaje(), vehiculo: vehiculo(), sello: p.datos, anulado: false, intervalo: null, uso: 'personal' });
    expect(c.estadoPresupuesto).toBe('cronología sin verificar');
    expect(c.tarjetas.find((t) => t.partida === 'km')?.diferencia?.previsto).toBeNull();
  });

  it('peajes: solo hay referencia con cobertura completa y al menos una línea', async () => {
    const p = await presupuestoSellado();
    const base = { vehiculo: vehiculo(), sello: p.datos, anulado: false, intervalo: null, uso: 'personal' as const };
    const sin = compararViaje({ ...base, viaje: viaje({ cobertura: { peajes: 'completa', ayudantes: null, otros: null } }) });
    expect(sin.tarjetas.find((t) => t.partida === 'peajes')?.referencia).toBeNull();
    const con = compararViaje({ ...base, viaje: viaje({ comprobantes: [{ ref: 'doc-001-01', partida: 'peajes', clp: 1800 }], cobertura: { peajes: 'completa', ayudantes: null, otros: null } }) });
    expect(con.tarjetas.find((t) => t.partida === 'peajes')?.referencia).toBe(1800);
    expect(con.cobertura).toMatchObject({ presentes: 1, total: 6 });
  });

  it('rendimiento, informe y resumenClases no se reimplementan: «pendiente»', () => {
    for (const r of [presentacionProvisional.rendimiento({}), presentacionProvisional.informe({}, null), presentacionProvisional.resumenClases([])]) {
      expect(r).toEqual({ pendiente: PENDIENTE_CODEX });
    }
  });
});
