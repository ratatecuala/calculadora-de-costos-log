/**
 * A-92 — alta guiada del vehículo: lo desconocido queda desconocido (nunca 0 ni un valor de catálogo), la
 * resolución se deduce del tablero, L/100 km se convierte solo con unidad explícita, el consumo instantáneo
 * no es rendimiento, y un vehículo del formato anterior se abre y se guarda sin perder ni reinterpretar nada.
 * Datos ficticios; sin red ni navegador.
 */
import { describe, expect, it } from 'vitest';
import { borradorDesdeVehiculo, borradorVacio, faltaParaGuardar, kmLDeclarado, nombreVehiculo, resolucionDe, vehiculoDesdeAlta, type BorradorAlta } from '../src/medicion/alta';
import { AlmacenMemoria } from '../src/medicion/almacen';
import { exportarRespaldo, fusionarRespaldo, leerRespaldo } from '../src/medicion/repositorio';
import { T0, vehiculo } from './medicion-fixtures';

const b = (x: Partial<BorradorAlta>): BorradorAlta => ({ ...borradorVacio(), tipo: 'furgon', ...x });
const AHORA = '2026-11-26T09:00:00.000-03:00';

describe('alta guiada: nada se inventa', () => {
  it('solo el tipo es obligatorio; con «no lo sé» en todo, las resoluciones y el rendimiento quedan desconocidos', () => {
    expect(faltaParaGuardar(borradorVacio())).toMatch(/tipo/);
    const v = vehiculoDesdeAlta(b({ combustible: 'no_se', trip: 'no_se', odometro: 'no_se', consumo: 'no_se' }), null, [], AHORA);
    expect(v).toMatchObject({ tipoVehiculo: 'furgon', alias: 'veh-001', combustible: null, resolucionTripKm: null, resolucionOdometroKm: null, capacidadEstanqueL: null });
    expect(v.porDefecto.kmL).toMatchObject({ valor: null, procedencia: { clase: 'faltante' } });
    expect(v.porDefecto.precioLitro.valor).toBeNull();
    expect(v.perfil).toEqual({ marca: null, modelo: null, anio: null, motor: null, trip: 'no_se', odometro: 'no_se', consumo: { forma: 'no_se', valor: null, unidad: null, lectura: null } });
    expect(JSON.stringify(v)).not.toMatch(/patente|turbo/i);
  });

  it('resolución deducida del tablero: decimal → 0,1 km; enteros → 1 km; «no tiene» y «no lo sé» → desconocida (y se distinguen)', () => {
    expect([resolucionDe('decimal'), resolucionDe('entero'), resolucionDe('no_tiene'), resolucionDe('no_se'), resolucionDe(null)]).toEqual([0.1, 1, null, null, null]);
    const v = vehiculoDesdeAlta(b({ trip: 'no_tiene', odometro: 'entero' }), null, [], AHORA);
    expect(v.resolucionTripKm).toBeNull();
    expect(v.resolucionOdometroKm).toBe(1);
    expect(v.perfil?.trip).toBe('no_tiene');
  });

  it('rendimiento: km/L declarado; L/100 km convertido explícitamente; sin unidad no hay rendimiento', () => {
    expect(kmLDeclarado(b({ consumo: 'rendimiento', consumoValor: '10', consumoUnidad: null }))).toBeNull();
    const km = vehiculoDesdeAlta(b({ consumo: 'rendimiento', consumoValor: '10,5', consumoUnidad: 'km/L' }), null, [], AHORA);
    expect(km.porDefecto.kmL).toMatchObject({ valor: 10.5, procedencia: { clase: 'declarado', fuente: { tipo: 'vehiculo' } } });
    const l100 = vehiculoDesdeAlta(b({ consumo: 'tablero', consumoLectura: 'promedio', consumoValor: '8', consumoUnidad: 'L/100km' }), null, [], AHORA);
    expect(l100.porDefecto.kmL.valor).toBe(12.5);
    expect(l100.porDefecto.kmL.procedencia.fuente.detalle).toMatch(/L\/100 km convertido/);
    expect(l100.perfil?.consumo).toEqual({ forma: 'tablero', valor: 8, unidad: 'L/100km', lectura: 'promedio' });
  });

  it('el consumo INSTANTÁNEO del tablero nunca es rendimiento (queda como referencia); «sin indicador» ≠ «no lo sé»', () => {
    const v = vehiculoDesdeAlta(b({ consumo: 'tablero', consumoLectura: 'instantaneo', consumoValor: '9', consumoUnidad: 'km/L' }), null, [], AHORA);
    expect(v.porDefecto.kmL.valor).toBeNull();
    expect(v.perfil?.consumo).toMatchObject({ lectura: 'instantaneo', valor: 9 });
    const sin = vehiculoDesdeAlta(b({ consumo: 'sin_indicador' }), null, [], AHORA);
    expect(sin.perfil?.consumo).toEqual({ forma: 'sin_indicador', valor: null, unidad: null, lectura: null });
    expect(sin.porDefecto.kmL.valor).toBeNull();
    // Valores inválidos o cero: nunca se guardan como rendimiento.
    expect(kmLDeclarado(b({ consumo: 'rendimiento', consumoValor: '0', consumoUnidad: 'km/L' }))).toBeNull();
    expect(kmLDeclarado(b({ consumo: 'rendimiento', consumoValor: 'abc', consumoUnidad: 'km/L' }))).toBeNull();
  });

  it('marca, modelo, año y motor son metadatos locales opcionales; el año fuera de rango no se guarda', () => {
    const v = vehiculoDesdeAlta(b({ marca: ' Marca ficticia ', modelo: 'Modelo X', anio: '1800', motor: '1.6' }), null, [], AHORA);
    expect(v.perfil).toMatchObject({ marca: 'Marca ficticia', modelo: 'Modelo X', anio: null, motor: '1.6' });
    expect(nombreVehiculo(v)).toBe('Marca ficticia Modelo X');
    expect(nombreVehiculo(vehiculoDesdeAlta(b({}), null, [], AHORA))).toBe('Furgón');
  });
});

describe('vehículo del formato anterior (sin perfil)', () => {
  it('se abre con un borrador deducido en memoria y, guardado sin cambios, conserva todo lo que el alta no pregunta', () => {
    const viejo = vehiculo({ capacidadEstanqueL: 50, resolucionLitros: 0.01 });
    const br = borradorDesdeVehiculo(viejo);
    expect(br).toMatchObject({ tipo: 'auto', combustible: 'gasolina', trip: 'decimal', odometro: 'entero', consumo: null, marca: '' });
    const v = vehiculoDesdeAlta(br, viejo, [viejo], AHORA);
    expect(v.id).toBe(viejo.id);
    expect(v.alias).toBe(viejo.alias);
    expect(v.creadoEl).toBe(T0);
    expect(v.porDefecto).toEqual(viejo.porDefecto); // el rendimiento 12,4 conserva su procedencia (no se reinterpreta)
    expect(v).toMatchObject({ resolucionTripKm: 0.1, resolucionOdometroKm: 1, resolucionLitros: 0.01, capacidadEstanqueL: 50 });
  });

  it('una resolución no reconocida queda sin responder y se conserva al guardar', () => {
    const viejo = vehiculo({ resolucionTripKm: 0.5, resolucionOdometroKm: null });
    const br = borradorDesdeVehiculo(viejo);
    expect(br.trip).toBeNull();
    expect(br.odometro).toBeNull();
    expect(vehiculoDesdeAlta(br, viejo, [viejo], AHORA).resolucionTripKm).toBe(0.5);
  });
});

describe('respaldo con el perfil del alta', () => {
  it('exporta e importa el perfil; el formato anterior sigue importándose; claves ajenas en el perfil se rechazan', async () => {
    const a = new AlmacenMemoria();
    const v = vehiculoDesdeAlta(b({ marca: 'Marca ficticia', trip: 'decimal', consumo: 'no_se' }), null, [], AHORA);
    await a.guardar('vehiculos', v);
    await a.guardar('vehiculos', vehiculo({ id: 'v-2', alias: 'veh-002' }));
    const r = await exportarRespaldo(a, AHORA);
    const texto = JSON.stringify(r);
    const b2 = new AlmacenMemoria();
    expect((await fusionarRespaldo(b2, leerRespaldo(texto))).agregados).toBe(2);
    expect(await b2.listar('vehiculos')).toEqual(expect.arrayContaining([v]));
    const malo = JSON.parse(texto);
    malo.vehiculos[0].perfil.patente = 'XX-0000';
    expect(() => leerRespaldo(JSON.stringify(malo))).toThrow(/Respaldo inválido/);
  });
});
