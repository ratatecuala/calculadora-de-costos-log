import { describe, expect, it } from 'vitest';
import { MemoryCounterStorage } from '../src/server/budget/ledger';
import { handleRouteRequest } from '../src/server/routeHandler';
import { END_OF_MONTH, ROUTE, clientId, deps, globalUsed, ledger } from './helpers';

describe('Prueba 2 — solicitudes simultáneas no pueden saltarse el contador', () => {
  it('500 reservas simultáneas con almacenamiento lento: se autorizan exactamente 100', async () => {
    const storage = new MemoryCounterStorage(1);
    const { ledger: l } = ledger({ operationalMonthly: 100, emergencyMonthly: 120 }, storage, { timeoutMs: 60_000 });
    const results = await Promise.all(
      Array.from({ length: 500 }, (_, i) => l.reserve({ kind: 'ruta', userKey: `u${i}`, originKey: `o${i}`, now: END_OF_MONTH })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(100);
    expect(globalUsed(storage)).toBe(100);
  });

  it('control negativo: SIN serialización el mismo escenario supera el límite (demuestra que la prueba detecta el fallo)', async () => {
    const storage = new MemoryCounterStorage(1);
    const { ledger: l } = ledger({ operationalMonthly: 100, emergencyMonthly: 120 }, storage, {
      timeoutMs: 60_000,
      unsafeDisableSerialization: true,
    });
    const results = await Promise.all(
      Array.from({ length: 500 }, (_, i) => l.reserve({ kind: 'ruta', userKey: `u${i}`, originKey: `o${i}`, now: END_OF_MONTH })),
    );
    expect(results.filter((r) => r.ok).length).toBeGreaterThan(100);
  });

  it('200 solicitudes HTTP simultáneas de distintos clientes: el proveedor se llama a lo sumo el cupo', async () => {
    const storage = new MemoryCounterStorage(1);
    const { ledger: l } = ledger({ operationalMonthly: 25, emergencyMonthly: 30 }, storage, { timeoutMs: 60_000 });
    const { deps: d, provider } = deps(l);
    const responses = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        handleRouteRequest({ ...ROUTE, destination: `Destino ${i}, Maipú` }, { clientId: clientId(), ip: `10.0.0.${i % 250}` }, d),
      ),
    );
    expect(responses.filter((r) => r.json.status === 'ok')).toHaveLength(25);
    expect(provider.calls).toBe(25);
    expect(globalUsed(storage)).toBe(25);
  });

  it('doble clic: la misma solicitud simultánea del mismo cliente consume una sola reserva', async () => {
    const storage = new MemoryCounterStorage(1);
    const { ledger: l } = ledger({}, storage);
    const { deps: d, provider } = deps(l);
    const id = clientId();
    const [a, b, c] = await Promise.all([
      handleRouteRequest(ROUTE, { clientId: id, ip: '10.0.0.1' }, d),
      handleRouteRequest(ROUTE, { clientId: id, ip: '10.0.0.1' }, d),
      handleRouteRequest(ROUTE, { clientId: id, ip: '10.0.0.1' }, d),
    ]);
    expect([a, b, c].every((r) => r.json.status === 'ok')).toBe(true);
    expect(provider.calls).toBe(1);
    expect(globalUsed(storage)).toBe(1);
  });
});
