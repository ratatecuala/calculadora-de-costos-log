import { describe, expect, it, vi } from 'vitest';
import { readSnapshot } from '../src/shared/snapshot';
import contract from '../docs/casos-dorados-a89/historicos-y-cambio.json';

// Fallar ante un intento de recalcular, aunque el importe obtenido coincida con el guardado.
const calcular = vi.hoisted(() => vi.fn(() => { throw new Error('Recálculo de un histórico'); }));
vi.mock('../src/engine/measures', () => ({ computeMeasures: calcular }));

describe('A-89 · lectura actual de los originales revisados en #59', () => {
  it.each(contract.historicos)('$id conserva versión, importe, sugerido y contenido', ({ entrada, esperado }) => {
    const raw = structuredClone(entrada);
    const antes = JSON.stringify(raw);
    calcular.mockClear();
    const visto = readSnapshot(raw);
    expect(visto.ok).toBe(true);
    if (!visto.ok) throw new Error(visto.reason);
    expect(visto.sourceVersion).toBe(esperado.sourceVersion);
    expect(visto.view.costEstimate).toBe(esperado.costEstimate);
    expect(visto.view.suggestedPrice).toBe(esperado.suggestedPrice);
    expect(visto.view.engineVersion).toBe(entrada.engineVersion);
    expect(JSON.stringify(raw)).toBe(antes);
    expect(calcular).not.toHaveBeenCalled();
    // El lector actual carece del campo; el futuro contrato exige null explícito.
    expect(Reflect.get(visto.view, 'modalidad') ?? null).toBeNull();
  });
});
