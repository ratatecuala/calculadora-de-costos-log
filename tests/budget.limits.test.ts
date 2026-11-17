import { describe, expect, it } from 'vitest';
import { MemoryCounterStorage } from '../src/server/budget/ledger';
import { periodKeys } from '../src/server/budget/period';
import { DEFAULT_POLICY, operationalAllowance } from '../src/server/budget/policy';
import { END_OF_MONTH, START_OF_MONTH, globalUsed, ledger } from './helpers';

describe('Prueba 1 — nunca se autoriza una solicitud por encima del límite global', () => {
  it('la política por defecto es la decidida: 7.000 operativo, 8.000 emergencia, 3/día y 10/mes de comparaciones', () => {
    expect(DEFAULT_POLICY).toMatchObject({
      operationalMonthly: 7000,
      emergencyMonthly: 8000,
      comparisonsPerUserDaily: 3,
      comparisonsPerUserMonthly: 10,
    });
  });

  it('las rutas de usuarios se detienen en el objetivo operativo', async () => {
    const { ledger: l, storage } = ledger({ operationalMonthly: 10, emergencyMonthly: 12 });
    let ok = 0;
    for (let i = 0; i < 25; i++) {
      const r = await l.reserve({ kind: 'ruta', userKey: `u${i}`, originKey: `o${i}`, now: END_OF_MONTH });
      if (r.ok) ok += 1;
      else expect(r.reason).toBe('cupo_agotado');
    }
    expect(ok).toBe(10);
    expect(globalUsed(storage as MemoryCounterStorage)).toBe(10);
  });

  it('el corte de emergencia vale para todo, incluidos los reintentos', async () => {
    const { ledger: l, storage } = ledger({ operationalMonthly: 10, emergencyMonthly: 12 });
    for (let i = 0; i < 10; i++) await l.reserve({ kind: 'ruta', userKey: `u${i}`, originKey: 'o', now: END_OF_MONTH });
    let retries = 0;
    for (let i = 0; i < 10; i++) {
      const r = await l.reserve({ kind: 'reintento', userKey: 'u', originKey: 'o', now: END_OF_MONTH });
      if (r.ok) retries += 1;
    }
    expect(retries).toBe(2);
    expect(globalUsed(storage as MemoryCounterStorage)).toBe(12);
  });

  it('ritmo diario acumulativo: el día 1 de un mes de 30 días solo permite ⌊7.000 × 1 / 30⌋ = 233', async () => {
    const p = periodKeys(START_OF_MONTH);
    expect(p.dayOfMonth).toBe(1);
    expect(operationalAllowance(DEFAULT_POLICY, p.dayOfMonth, p.daysInMonth)).toBe(233);
    const { ledger: l } = ledger({ perOriginDaily: 10_000, perUserDaily: 10_000 });
    let ok = 0;
    for (let i = 0; i < 300; i++) {
      const r = await l.reserve({ kind: 'ruta', userKey: `u${i}`, originKey: 'o', now: START_OF_MONTH });
      if (r.ok) ok += 1;
    }
    expect(ok).toBe(233);
  });

  it('el ritmo nunca supera el objetivo ni la emergencia en meses de 31 días', () => {
    for (const days of [28, 29, 30, 31]) {
      for (let d = 1; d <= days; d++) {
        const a = operationalAllowance(DEFAULT_POLICY, d, days);
        expect(a).toBeLessThanOrEqual(7000);
      }
      expect(operationalAllowance(DEFAULT_POLICY, days, days)).toBe(7000);
    }
  });

  it('comparaciones: máximo 3 al día y 10 al mes por usuario', async () => {
    const { ledger: l } = ledger();
    let ok = 0;
    for (let i = 0; i < 5; i++) {
      const r = await l.reserve({ kind: 'comparacion', userKey: 'u1', originKey: 'o', now: END_OF_MONTH });
      if (r.ok) ok += 1;
      else expect(r.reason).toBe('limite_comparaciones');
    }
    expect(ok).toBe(3);

    // A lo largo del mes: 3 por día, pero 10 en total.
    const { ledger: l2 } = ledger();
    let monthOk = 0;
    for (let day = 1; day <= 6; day++) {
      const now = new Date(Date.UTC(2026, 10, day, 20));
      for (let i = 0; i < 3; i++) {
        const r = await l2.reserve({ kind: 'comparacion', userKey: 'u2', originKey: `o${day}`, now });
        if (r.ok) monthOk += 1;
      }
    }
    expect(monthOk).toBe(10);
    expect(await l2.quota('u2', new Date(Date.UTC(2026, 10, 7, 20)))).toEqual({ comparisonsLeftToday: 0, comparisonsLeftMonth: 0 });
  });

  it('límites provisionales por usuario y por origen de red', async () => {
    const { ledger: l } = ledger({ perUserDaily: 2, perOriginDaily: 3 });
    const a = [];
    for (let i = 0; i < 3; i++) a.push(await l.reserve({ kind: 'ruta', userKey: 'mismo', originKey: 'o1', now: END_OF_MONTH }));
    expect(a.map((r) => r.ok)).toEqual([true, true, false]);
    const b = [];
    for (let i = 0; i < 3; i++) b.push(await l.reserve({ kind: 'ruta', userKey: `otro${i}`, originKey: 'o2', now: END_OF_MONTH }));
    expect(b.every((r) => r.ok)).toBe(true);
    const c = await l.reserve({ kind: 'ruta', userKey: 'nuevo', originKey: 'o2', now: END_OF_MONTH });
    expect(c).toEqual({ ok: false, reason: 'limite_usuario' });
  });
});
