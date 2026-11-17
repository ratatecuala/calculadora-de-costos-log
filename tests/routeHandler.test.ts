import { describe, expect, it } from 'vitest';
import { BudgetLedger, CounterUnavailableError, MemoryCounterStorage } from '../src/server/budget/ledger';
import { handleRouteRequest } from '../src/server/routeHandler';
import { END_OF_MONTH, FailingStorage, HangingStorage, ROUTE, clientId, deps, globalUsed, ledger, policy } from './helpers';

describe('Prueba 3 — una falla del contador bloquea nuevas solicitudes', () => {
  it('contador que lanza error: modo manual y el proveedor NO se llama', async () => {
    const { deps: d, provider } = deps(new BudgetLedger(new FailingStorage(), { policy: policy() }));
    const res = await handleRouteRequest(ROUTE, { clientId: clientId(), ip: '1.1.1.1' }, d);
    expect(res.httpStatus).toBe(503);
    expect(res.json).toMatchObject({ status: 'manual', reason: 'contador_no_disponible' });
    expect(provider.calls).toBe(0);
  });

  it('contador que no responde: vence el plazo, modo manual y el proveedor NO se llama', async () => {
    const { deps: d, provider } = deps(new BudgetLedger(new HangingStorage(), { policy: policy(), timeoutMs: 50 }));
    const res = await handleRouteRequest(ROUTE, { clientId: clientId(), ip: '1.1.1.1' }, d);
    expect(res.json).toMatchObject({ status: 'manual', reason: 'contador_no_disponible' });
    expect(provider.calls).toBe(0);
  });

  it('el libro entrega CounterUnavailableError y las reservas siguientes también fallan (cierre)', async () => {
    const l = new BudgetLedger(new HangingStorage(), { policy: policy(), timeoutMs: 30 });
    await expect(l.reserve({ kind: 'ruta', userKey: 'u', originKey: 'o', now: END_OF_MONTH })).rejects.toBeInstanceOf(CounterUnavailableError);
    await expect(l.reserve({ kind: 'ruta', userKey: 'u2', originKey: 'o', now: END_OF_MONTH })).rejects.toBeInstanceOf(CounterUnavailableError);
  });
});

describe('Prueba 4 — los reintentos también consumen presupuesto', () => {
  it('un error reintentable produce 2 llamadas y 2 unidades consumidas', async () => {
    const { ledger: l, storage } = ledger();
    const { deps: d, provider } = deps(l, { failFirst: 1 });
    const res = await handleRouteRequest(ROUTE, { clientId: clientId(), ip: '2.2.2.2' }, d);
    expect(res.json.status).toBe('ok');
    expect(provider.calls).toBe(2);
    expect(globalUsed(storage as MemoryCounterStorage)).toBe(2);
  });

  it('sin presupuesto para el reintento, no se reintenta', async () => {
    const { ledger: l, storage } = ledger({ operationalMonthly: 1, emergencyMonthly: 1 });
    const { deps: d, provider } = deps(l, { failFirst: 1 });
    const res = await handleRouteRequest(ROUTE, { clientId: clientId(), ip: '3.3.3.3' }, d);
    expect(res.json).toMatchObject({ status: 'manual', reason: 'cupo_agotado' });
    expect(provider.calls).toBe(1);
    expect(globalUsed(storage as MemoryCounterStorage)).toBe(1);
  });

  it('a lo sumo un reintento, y nunca ante errores no reintentables', async () => {
    const { ledger: l, storage } = ledger();
    const { deps: d, provider } = deps(l, { failFirst: 5 });
    const res = await handleRouteRequest(ROUTE, { clientId: clientId(), ip: '4.4.4.4' }, d);
    expect(res.json).toMatchObject({ status: 'manual', reason: 'error_proveedor' });
    expect(provider.calls).toBe(2);
    expect(globalUsed(storage as MemoryCounterStorage)).toBe(2);

    const { ledger: l2, storage: s2 } = ledger();
    const { deps: d2, provider: p2 } = deps(l2, { failPermanently: true });
    await handleRouteRequest(ROUTE, { clientId: clientId(), ip: '4.4.4.5' }, d2);
    expect(p2.calls).toBe(1);
    expect(globalUsed(s2 as MemoryCounterStorage)).toBe(1);
  });
});

describe('Prueba 7 (servidor) — al agotarse el cupo se activa el modo manual', () => {
  it('cupo agotado: respuesta manual con mensaje sin hora de reinicio y sin llamar al proveedor', async () => {
    const { ledger: l } = ledger({ operationalMonthly: 1, emergencyMonthly: 1 });
    const { deps: d, provider } = deps(l);
    await handleRouteRequest(ROUTE, { clientId: clientId(), ip: '5.5.5.5' }, d);
    const res = await handleRouteRequest({ ...ROUTE, destination: 'Otra 1, Maipú' }, { clientId: clientId(), ip: '5.5.5.6' }, d);
    expect(res.httpStatus).toBe(429);
    expect(res.json.status).toBe('manual');
    if (res.json.status === 'manual') {
      expect(res.json.reason).toBe('cupo_agotado');
      expect(res.json.message).not.toMatch(/\d{1,2}:\d{2}/); // A-27: sin hora de reinicio
    }
    expect(provider.calls).toBe(1);
  });

  it('interruptor global apagado: modo manual sin tocar el contador ni el proveedor', async () => {
    const { ledger: l, storage } = ledger();
    const { deps: d, provider } = deps(l, {}, false);
    const res = await handleRouteRequest(ROUTE, { clientId: clientId(), ip: '6.6.6.6' }, d);
    expect(res.json).toMatchObject({ status: 'manual', reason: 'servicio_apagado' });
    expect(provider.calls).toBe(0);
    expect(globalUsed(storage as MemoryCounterStorage)).toBe(0);
  });
});

describe('Validación de entrada', () => {
  it('rechaza campos extra (p. ej., pedir tráfico) sin llamar al proveedor', async () => {
    const { ledger: l } = ledger();
    const { deps: d, provider } = deps(l);
    const res = await handleRouteRequest({ ...ROUTE, routingPreference: 'TRAFFIC_AWARE' }, { clientId: clientId(), ip: '7.7.7.7' }, d);
    expect(res.json).toMatchObject({ status: 'manual', reason: 'solicitud_invalida' });
    expect(provider.calls).toBe(0);
  });

  it('exige identificador de cliente y base cuando se pide salir o volver a ella', async () => {
    const { ledger: l } = ledger();
    const { deps: d, provider } = deps(l);
    expect((await handleRouteRequest(ROUTE, { clientId: null, ip: '7.7.7.8' }, d)).json).toMatchObject({ reason: 'solicitud_invalida' });
    expect((await handleRouteRequest({ ...ROUTE, startAtBase: true }, { clientId: clientId(), ip: '7.7.7.8' }, d)).json).toMatchObject({
      reason: 'solicitud_invalida',
    });
    expect(provider.calls).toBe(0);
  });

  it('las respuestas simuladas se identifican como tales y con retención de sesión', async () => {
    const { ledger: l } = ledger();
    const { deps: d } = deps(l);
    const res = await handleRouteRequest(
      { ...ROUTE, base: 'Base 1, Maipú', startAtBase: true, returnToBase: true },
      { clientId: clientId(), ip: '8.8.8.8' },
      d,
    );
    expect(res.json.status).toBe('ok');
    if (res.json.status === 'ok') {
      expect(res.json.route.source).toBe('simulado');
      expect(res.json.route.legs.map((x) => `${x.from}>${x.to}`)).toEqual(['base>A', 'A>B', 'B>base']);
      expect(res.json.route.retention).toEqual({ distance: 'sesion', duration: 'sesion' });
    }
  });
});
