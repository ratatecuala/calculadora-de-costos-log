import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VERSION_MOTOR, compararFicha, crearPresupuesto, medirIntervalo, resumenClases, revisarReferencias, validarFicha,
} from '../../src/shared/campo/index.js';
import type { Corte, Dato, Ficha, Intervalo, Observacion } from '../../src/shared/campo/index.js';

const plantilla = new URL('../../datos/pruebas-campo/plantilla-economica.json', import.meta.url);
const sim = (valor: number): Dato => [valor, 'SIMULADO'];
const corte: Corte = { fecha: '2026-11-08', odometro: 1120 };

// Libro auxiliar del ensayo. El contrato #55 guarda litros por recarga y precio por viaje.
const compras = [
  { dia: '2026-11-10', lleno: true,  km: 1120, litros: 35, precio: 1100 },
  { dia: '2026-11-10', lleno: false, km: 1160, litros: 4,  precio: 1200 },
  { dia: '2026-11-11', lleno: false, km: 1260, litros: 8,  precio: 1400 },
  { dia: '2026-11-11', lleno: true,  km: 1360, litros: 12, precio: 1500 },
];

function intervalo(): Intervalo {
  return {
    vehiculo: 'veh-711', registroCompleto: true, recorrido: 'mixto', carga: 'parcial', aire: false,
    muestra: 'validacion', zona: 'America/Santiago',
    resolucionKm: sim(1), incertidumbreKm: sim(1), resolucionLitros: sim(0.01), incertidumbreLitros: sim(0.25),
    recargas: compras.map(r => ({ fecha: r.dia, lleno: r.lleno, odometro: sim(r.km), litros: sim(r.litros) })),
  };
}

interface Tramo {
  id: string; dia: string; hora: string; hastaHora: string; clase: Observacion['recorrido'];
  desde: number; hasta: number; resolucion: number; incertidumbre: number; precio: number;
}

const tramos = {
  ciudad: { id: 'viaje-711', dia: '2026-11-10', hora: '08:00', hastaHora: '09:00', clase: 'urbano', desde: 1120, hasta: 1140, resolucion: 1, incertidumbre: 1, precio: 1100 },
  ida: { id: 'viaje-712', dia: '2026-11-10', hora: '10:00', hastaHora: '12:00', clase: 'mixto', desde: 1140, hasta: 1220, resolucion: 1, incertidumbre: 0.5, precio: 1200 },
  autopista: { id: 'viaje-713', dia: '2026-11-11', hora: '08:00', hastaHora: '10:00', clase: 'autopista', desde: 1220, hasta: 1320, resolucion: 0.1, incertidumbre: 0.1, precio: 1400 },
  regreso: { id: 'viaje-714', dia: '2026-11-11', hora: '11:00', hastaHora: '12:00', clase: 'mixto', desde: 1320, hasta: 1360, resolucion: 0.1, incertidumbre: 0.05, precio: 1500 },
} satisfies Record<string, Tramo>;

function preparar(t: Tramo) {
  const ficha: Ficha = JSON.parse(readFileSync(plantilla, 'utf8'));
  Object.assign(ficha, { uso: 'simulacion', vehiculo: 'veh-711', tipoVehiculo: 'furgon' });
  Object.assign(ficha.plan, {
    baseClp: 'neto', muestraPrevista: 'validacion', ajusteHasta: corte, kmL: sim(8),
    km: sim(t.hasta - t.desde), precioLitro: sim(1150), fuentePrecio: 'supuesto',
  });
  const sello = crearPresupuesto(ficha, t.id, '2026-11-09T15:00:00.000Z', VERSION_MOTOR);
  Object.assign(ficha.observacion, {
    inicio: t.dia + 'T' + t.hora + ':00-03:00', fin: t.dia + 'T' + t.hastaHora + ':00-03:00',
    intervalo: intervalo(), km: sim(t.hasta - t.desde), odometroInicial: sim(t.desde), odometroFinal: sim(t.hasta),
    resolucionKm: sim(t.resolucion), incertidumbreKm: sim(t.incertidumbre), baseClp: 'neto',
    recorrido: t.clase, nivelCarga: 'parcial', aire: false, precioLitro: sim(t.precio), fuentePrecio: 'supuesto',
  });
  validarFicha(ficha);
  return { ficha, sello };
}

function antecedente(): Ficha {
  const { ficha } = preparar(tramos.ida);
  ficha.plan.muestraPrevista = 'calibracion';
  ficha.plan.ajusteHasta = 'sin_ajuste';
  const i: Intervalo = {
    ...intervalo(), muestra: 'calibracion',
    recargas: [
      { fecha: '2026-11-07', lleno: true, odometro: sim(1000), litros: sim(30) },
      { fecha: corte.fecha, lleno: true, odometro: sim(1120), litros: sim(15) },
    ],
  };
  Object.assign(ficha.observacion, {
    inicio: '2026-11-07T13:00:00-03:00', fin: '2026-11-08T14:00:00-03:00',
    odometroInicial: sim(1000), odometroFinal: sim(1120), km: sim(120), intervalo: i,
  });
  validarFicha(ficha);
  return ficha;
}

function evaluar(t: Tramo, modificar?: (o: Observacion, i: Intervalo) => void) {
  const { ficha, sello } = preparar(t);
  modificar?.(ficha.observacion, ficha.observacion.intervalo!);
  const ajuste = revisarReferencias(ficha, [antecedente()]);
  return compararFicha(ficha, sello, ajuste, VERSION_MOTOR);
}

export function registrarDosDias(it: (nombre: string, ejecutar: () => void) => unknown) {
  it('dos días y cuatro viajes comparten 240 km y 24 L con dos cargas parciales', () => {
    const fichas = Object.values(tramos).map(t => preparar(t).ficha);
    const medicion = medirIntervalo(fichas[0]!.observacion.intervalo);
    assert.ok(medicion);
    assert.deepEqual([medicion.desde, medicion.hasta, medicion.km, medicion.litros, medicion.kmL],
      ['2026-11-10', '2026-11-11', 240, 24, 10]);
    assert.equal(fichas.reduce((km, f) => km + f.observacion.km![0], 0), 240);
    assert.equal(compras.slice(1).reduce((clp, r) => clp + r.precio * r.litros, 0), 34000);
    const resumen = resumenClases([antecedente(), ...fichas]);
    assert.deepEqual(resumen.grupos.map(g => [g.muestra, g.n, g.mediaKmL, g.evidencia, g.desviacionMuestralKmL, g.estado]), [
      ['calibracion', 1, 8, 'SIMULADO', null, 'insuficiente'],
      ['validacion', 1, 10, 'SIMULADO', null, 'insuficiente'],
    ]);
    assert.equal(resumen.repetidos, 3);
  });

  it('el precio de cada viaje valora sus litros estimados y nunca la compra completa', () => {
    for (const [t, litros, clp] of [[tramos.ida, 8, 9600], [tramos.regreso, 4, 6000]] as const) {
      const r = evaluar(t);
      assert.equal(r.referencias.litrosAsignadosEstimados, litros);
      assert.equal(r.comparacionClp.combustible.original.referencia, clp);
      assert.equal(r.comparacionClp.combustible.evidencia, 'SIMULADO');
      assert.equal(r.presupuestoOriginal?.litrosEstimados, (t.hasta - t.desde) / 8);
      assert.equal(r.presupuestoOriginal?.evidencia, 'SIMULADO');
      assert.equal(r.gastosDelViaje.subtotalClp, null);
      assert.equal(r.conciliacionIndependiente.totalComparable, null);
    }
    for (const t of [tramos.ciudad, tramos.autopista]) {
      const r = evaluar(t);
      assert.equal(r.referencias.rendimientoMedidoIntervaloKmL, 10);
      assert.ok(r.referencias.intervalo.motivos.includes('vehículo o clase incompatible'));
      assert.equal(r.referencias.litrosAsignadosEstimados, null);
    }
  });

  it('propaga incertidumbres declaradas y conserva la resolución distinta de cada viaje', () => {
    for (const [t, min, max] of [
      [tramos.ida, 79.5 * 23.75 / 241, 80.5 * 24.25 / 239],
      [tramos.regreso, 39.95 * 23.75 / 241, 40.05 * 24.25 / 239],
    ] as const) {
      const r = evaluar(t);
      assert.deepEqual(r.observacion.resolucionKm, sim(t.resolucion));
      assert.deepEqual(r.referencias.incertidumbreCombustible.litros, { inferior: min, superior: max });
      assert.deepEqual(r.referencias.incertidumbreCombustible.combustibleClp,
        { inferior: min * t.precio, superior: max * t.precio });
    }
    const sinIncertidumbre = evaluar(tramos.ida, o => { o.incertidumbreKm = null; });
    assert.equal(sinIncertidumbre.referencias.litrosAsignadosEstimados, 8);
    assert.equal(sinIncertidumbre.referencias.incertidumbreCombustible.litros, null);
    assert.deepEqual(sinIncertidumbre.referencias.incertidumbreCombustible.faltan, ['kmViaje']);
  });

  it('mantiene abierto el rango sin límite superior y rechaza antecedentes contradictorios', () => {
    const abierto = evaluar(tramos.ida, (_o, i) => { i.incertidumbreKm = sim(240); });
    assert.equal(abierto.referencias.incertidumbreCombustible.litros?.superior, null);
    assert.equal(abierto.referencias.incertidumbreCombustible.combustibleClp?.superior, null);
    const sinLitros = evaluar(tramos.ida, (_o, i) => { i.incertidumbreLitros = null; });
    assert.deepEqual(sinLitros.referencias.incertidumbreCombustible.faltan, ['litrosIntervalo']);
    assert.equal(sinLitros.referencias.incertidumbreCombustible.litros, null);
    const original = preparar(tramos.ida).ficha;
    const contradiccion = preparar(tramos.regreso).ficha;
    contradiccion.observacion.intervalo!.recargas[1]!.litros = sim(5);
    assert.throws(() => resumenClases([original, contradiccion]), /contradictorios/);
  });

  it('rechaza reutilizar la calibración y fechas ajenas al intervalo', () => {
    const { ficha, sello } = preparar(tramos.ida);
    assert.deepEqual(revisarReferencias(ficha, [antecedente()]), corte);
    const calibracion = evaluar(tramos.ida, (_o, i) => { i.muestra = 'calibracion'; });
    assert.ok(calibracion.referencias.intervalo.motivos.includes('intervalo sin reserva previa para validación posterior'));
    assert.equal(calibracion.referencias.litrosAsignadosEstimados, null);
    const solapado = compararFicha(ficha, sello, { fecha: '2026-11-10', odometro: 1160 }, VERSION_MOTOR);
    assert.ok(solapado.referencias.intervalo.motivos.includes('intervalo no posterior al ajuste'));
    assert.equal(solapado.referencias.litrosAsignadosEstimados, null);
    const tardio = evaluar(tramos.regreso, o => { o.fin = '2026-11-12T01:00:00-03:00'; });
    assert.equal(tardio.referencias.intervalo.utilizable, false);
    assert.equal(tardio.referencias.litrosAsignadosEstimados, null);
  });

  it('mantiene faltantes el cierre, los litros parciales, el odómetro y el precio desconocidos', () => {
    for (const cambiar of [
      (i: Intervalo) => { i.recargas.pop(); },
      (i: Intervalo) => { i.recargas[1]!.litros = null; },
      (i: Intervalo) => { i.registroCompleto = false; },
    ]) {
      const r = evaluar(tramos.ida, (_o, i) => cambiar(i));
      assert.equal(r.referencias.intervalo.medicion, null);
      assert.equal(r.referencias.litrosAsignadosEstimados, null);
    }
    const sinOdometro = evaluar(tramos.ida, o => { o.odometroFinal = null; });
    assert.equal(sinOdometro.referencias.litrosAsignadosEstimados, null);
    const sinPrecio = evaluar(tramos.ida, o => { o.precioLitro = null; o.fuentePrecio = null; });
    assert.equal(sinPrecio.referencias.litrosAsignadosEstimados, 8);
    assert.equal(sinPrecio.comparacionClp.combustible.original.referencia, null);
    assert.equal(sinPrecio.referencias.incertidumbreCombustible.combustibleClp, null);
    assert.ok(sinPrecio.completitud.observacion.faltan.includes('precioLitro'));
  });
}
