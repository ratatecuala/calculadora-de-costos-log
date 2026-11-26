/**
 * A-90, Frente A — herramienta de medición: tiempos, km, cargas y avisos (sin red, sin navegador).
 * Datos ficticios. Incluye controles negativos: umbrales vacíos que no avisan, lecturas incoherentes.
 */
import { describe, expect, it } from 'vitest';
import {
  aResolucion,
  avisosCarga,
  avisosLectura,
  avisosViaje,
  distanciaViaje,
  intervaloDelViaje,
  intervalosLleno,
  kmDesdeAnterior,
  ordenarCargas,
  totalCarga,
  ultimoOdometro,
} from '../src/medicion/calculos';
import { cambiarTramo, cerrarTramos, isoLocal, minutosPorTipo } from '../src/medicion/tiempo';
import type { Tramo } from '../src/medicion/modelo';
import { carga, T0, vehiculo, viaje } from './medicion-fixtures';

const lec = (valor: number) => ({ valor, clase: 'medido' as const, fotoId: null, confirmadaEl: T0 });

describe('minutos derivados de los tramos (botones de estado)', () => {
  it('suma por tipo y cierra el tramo abierto en el fin del viaje', () => {
    let t: Tramo[] = [{ tipo: 'marcha', inicio: '2026-11-20T08:00:00.000-03:00', fin: null }];
    t = cambiarTramo(t, 'espera', '2026-11-20T08:25:00.000-03:00');
    t = cambiarTramo(t, 'carga', '2026-11-20T08:35:00.000-03:00');
    t = cambiarTramo(t, 'marcha', '2026-11-20T08:50:00.000-03:00');
    expect(t.filter((x) => x.fin === null)).toHaveLength(1);
    const m = minutosPorTipo(t, '2026-11-20T09:10:00.000-03:00');
    expect(m).toEqual({ marcha: 45, espera: 10, carga: 15, descarga: 0, pausa: 0 });
    expect(cerrarTramos(t, '2026-11-20T09:10:00.000-03:00').every((x) => x.fin !== null)).toBe(true);
  });

  it('cruza la medianoche sin perder minutos', () => {
    const t = [{ tipo: 'marcha' as const, inicio: '2026-11-20T23:50:00.000-03:00', fin: '2026-11-21T00:20:00.000-03:00' }];
    expect(minutosPorTipo(t, null).marcha).toBe(30);
  });

  it('cruza el cambio de horario (desfase −03:00 → −04:00) sin sumar ni restar una hora', () => {
    const t = [{ tipo: 'marcha' as const, inicio: '2026-04-04T23:30:00.000-03:00', fin: '2026-04-04T23:10:00.000-04:00' }];
    expect(minutosPorTipo(t, null).marcha).toBe(40);
  });

  it('un tramo con fin anterior al inicio no suma (control negativo)', () => {
    const t = [{ tipo: 'espera' as const, inicio: '2026-11-20T10:00:00.000-03:00', fin: '2026-11-20T09:00:00.000-03:00' }];
    expect(minutosPorTipo(t, null).espera).toBe(0);
  });

  it('isoLocal conserva el desfase de la zona (no convierte a UTC)', () => {
    expect(isoLocal(new Date('2026-11-20T11:00:00.000Z'))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
  });
});

describe('distancia: TRIP y odómetro no son intercambiables', () => {
  it('resta con la resolución del TRIP sin errores de coma flotante', () => {
    expect(aResolucion(48213.7 - 48201.4, 0.1)).toBe(12.3);
    const v = viaje({ lecturas: { inicial: { trip: lec(0.2), odometro: null }, final: { trip: lec(12.5), odometro: null } } });
    expect(distanciaViaje(v, vehiculo())).toMatchObject({ km: 12.3, fuente: 'trip' });
  });

  it('sin TRIP usa la diferencia de odómetro', () => {
    const v = viaje({ lecturas: { inicial: { trip: null, odometro: lec(48201) }, final: { trip: null, odometro: lec(48219) } } });
    expect(distanciaViaje(v, vehiculo())).toMatchObject({ km: 18, fuente: 'odometro' });
  });

  it('TRIP reiniciado: usa los km declarados', () => {
    const v = viaje({ tripReiniciadoKm: 23.4, lecturas: { inicial: { trip: lec(980.5), odometro: null }, final: { trip: lec(3.9), odometro: null } } });
    expect(distanciaViaje(v, vehiculo())).toMatchObject({ km: 23.4, fuente: 'trip-reiniciado' });
  });

  it('TRIP final menor que el inicial sin odómetro: sin distancia y con motivo (no inventa)', () => {
    const v = viaje({ lecturas: { inicial: { trip: lec(50), odometro: null }, final: { trip: lec(10), odometro: null } } });
    const d = distanciaViaje(v, vehiculo());
    expect(d.km).toBeNull();
    expect(d.motivo).toMatch(/menor/);
    expect(avisosViaje(v, vehiculo(), null, { velocidadMediaKmH: null, desvioKmPct: null, viajeAbiertoHoras: null }).map((a) => a.codigo)).toContain('trip-menor');
  });

  it('TRIP incoherente con odómetro presente: cae al odómetro y lo dice', () => {
    const v = viaje({ lecturas: { inicial: { trip: lec(50), odometro: lec(1000) }, final: { trip: lec(10), odometro: lec(1021) } } });
    expect(distanciaViaje(v, vehiculo())).toMatchObject({ km: 21, fuente: 'odometro' });
  });

  it('odómetro que retrocede: sin distancia', () => {
    const v = viaje({ lecturas: { inicial: { trip: null, odometro: lec(1000) }, final: { trip: null, odometro: lec(990) } } });
    expect(distanciaViaje(v, vehiculo()).km).toBeNull();
  });

  it('avisos de lectura: final menor (opción de reinicio), odómetro bajo el último conocido y sugerencia de TRIP en cero', () => {
    const v = viaje({ lecturas: { inicial: { trip: lec(5), odometro: lec(1000) }, final: { trip: null, odometro: null } } });
    expect(avisosLectura('trip', 'final', 2, v, null).map((a) => a.codigo)).toEqual(['trip-menor']);
    expect(avisosLectura('odometro', 'inicial', 900, v, 950).map((a) => a.codigo)).toContain('odometro-retrocede');
    expect(avisosLectura('trip', 'inicial', 3, v, null).map((a) => a.nivel)).toEqual(['info']);
    expect(avisosLectura('trip', 'inicial', 0, v, null)).toEqual([]);
  });
});

describe('avisos con umbrales del propietario (D-6)', () => {
  const vacios = { velocidadMediaKmH: null, desvioKmPct: null, viajeAbiertoHoras: null };
  // 200 km en 10 minutos de marcha, abierto hace días y lejísimos del previsto: datos absurdos a propósito.
  const absurdo = viaje({
    estado: 'en curso',
    fin: null,
    inicio: '2026-01-01T08:00:00.000-03:00',
    tramos: [{ tipo: 'marcha', inicio: '2026-01-01T08:00:00.000-03:00', fin: '2026-01-01T08:10:00.000-03:00' }],
    lecturas: { inicial: { trip: lec(0), odometro: null }, final: { trip: lec(200), odometro: null } },
  });
  const ahora = new Date('2026-11-20T12:00:00.000-03:00');

  it('con umbrales vacíos NO se dispara ningún aviso configurable (control negativo)', () => {
    expect(avisosViaje(absurdo, vehiculo(), 18, vacios, ahora)).toEqual([]);
  });

  it('con umbrales fijados por el propietario sí avisan (control positivo), sin bloquear', () => {
    const c = avisosViaje(absurdo, vehiculo(), 18, { velocidadMediaKmH: 150, desvioKmPct: 50, viajeAbiertoHoras: 12 }, ahora).map((a) => a.codigo);
    expect(c).toEqual(['velocidad', 'desvio-km', 'viaje-abierto']);
  });
});

describe('cargas de combustible: parciales normales, lleno a lleno opcional', () => {
  it('total automático al peso', () => {
    expect(totalCarga(31.82, 1290)).toBe(41048);
    expect(totalCarga(10, null)).toBeNull();
  });

  it('solo parciales: ningún intervalo y ningún aviso (no se exige llenar)', () => {
    const cs = [carga('2026-11-01T10:00:00.000-03:00', 15, 1000, false), carga('2026-11-05T10:00:00.000-03:00', 20, 1150, false)];
    expect(intervalosLleno(cs, 'v-1')).toEqual([]);
    expect(avisosCarga(cs[1]!, [cs[0]!], vehiculo())).toEqual([]);
    expect([...kmDesdeAnterior(ordenarCargas(cs)).values()]).toEqual([null, 150]);
  });

  it('lleno a lleno con parciales intermedias; la parcial posterior no abre intervalo', () => {
    const cs = [
      carga('2026-11-01T10:00:00.000-03:00', 40, 1000, true),
      carga('2026-11-03T10:00:00.000-03:00', 10, 1100, false),
      carga('2026-11-05T10:00:00.000-03:00', 12, 1200, false),
      carga('2026-11-08T10:00:00.000-03:00', 22, 1300, true),
      carga('2026-11-09T10:00:00.000-03:00', 5, 1350, false),
    ];
    const iv = intervalosLleno(cs, 'v-1');
    expect(iv).toHaveLength(1);
    expect(iv[0]).toMatchObject({ codigo: 'I-01', km: 300 });
    expect(iv[0]!.parciales.map((c) => c.odometro)).toEqual([1100, 1200]);
    // El viaje se ubica en el intervalo SOLO por odómetro.
    const dentro = viaje({ lecturas: { inicial: { trip: lec(0), odometro: lec(1120) }, final: { trip: lec(30), odometro: lec(1150) } } });
    expect(intervaloDelViaje(dentro, iv)?.codigo).toBe('I-01');
    expect(intervaloDelViaje(viaje(), iv)).toBeNull();
  });

  it('una carga con fecha anterior se reordena y se avisa', () => {
    const a = carga('2026-11-10T10:00:00.000-03:00', 20, 2000, false);
    const b = carga('2026-11-02T10:00:00.000-03:00', 18, 1800, false);
    expect(ordenarCargas([a, b]).map((c) => c.id)).toEqual([b.id, a.id]);
    expect(avisosCarga(b, [a], vehiculo()).map((x) => x.codigo)).toContain('reordenada');
  });

  it('litros ≤ 0 avisan y no entran en intervalos; capacidad solo si está declarada; odómetro fuera de orden', () => {
    const cero = carga('2026-11-02T10:00:00.000-03:00', 0, 1500, true);
    expect(avisosCarga(cero, [], vehiculo()).map((x) => x.codigo)).toContain('litros');
    expect(intervalosLleno([carga('2026-11-01T10:00:00.000-03:00', 30, 1000, true), cero], 'v-1')).toEqual([]);
    const mucho = carga('2026-11-02T10:00:00.000-03:00', 80, null, false);
    expect(avisosCarga(mucho, [], vehiculo()).map((x) => x.codigo)).not.toContain('capacidad');
    expect(avisosCarga(mucho, [], vehiculo({ capacidadEstanqueL: 45 })).map((x) => x.codigo)).toContain('capacidad');
    const antes = carga('2026-11-01T10:00:00.000-03:00', 10, 2000, false);
    const retro = carga('2026-11-03T10:00:00.000-03:00', 10, 1900, false);
    expect(avisosCarga(retro, [antes], vehiculo()).map((x) => x.codigo)).toContain('odometro-orden');
  });

  it('último odómetro conocido entre cargas y viajes', () => {
    const v = viaje({ lecturas: { inicial: { trip: null, odometro: lec(5000) }, final: { trip: null, odometro: lec(5040) } } });
    expect(ultimoOdometro('v-1', [v], [carga('2026-11-01T10:00:00.000-03:00', 10, 4900, false)])).toBe(5040);
    expect(ultimoOdometro('v-1', [v], [], v.id)).toBeNull();
  });
});
