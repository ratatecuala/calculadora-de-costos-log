/**
 * Auditoría de ff8286e (P2, A-50): un texto escrito que no es un número válido debe avisarse en el
 * campo y no confundirse con «vacío = No lo sé». La escritura real se verificó con Playwright
 * (PC y teléfono); aquí se prueba la regla y su efecto en el valor que recibe el motor.
 */
import { describe, expect, it } from 'vitest';
import { INVALID_NUMBER_MESSAGE, invalidAmountText, parseAmount } from '../src/web/format';

describe('Texto inválido en un campo numérico', () => {
  it.each(['-5000', 'abc', '-', '12abc', '1e', '$-3'])('«%s» → aviso y no se usa (el motor recibe null)', (t) => {
    expect(invalidAmountText(t)).toBe(INVALID_NUMBER_MESSAGE);
    expect(parseAmount(t)).toBeNull();
  });

  it.each(['', '   '])('campo realmente vacío («%s») → sin aviso: significa «No lo sé»', (t) => {
    expect(invalidAmountText(t)).toBeNull();
    expect(parseAmount(t)).toBeNull();
  });

  it.each([
    ['5000', 5000],
    ['5.000', 5000],
    ['12,5', 12.5],
    ['0', 0],
    ['$3.500', 3500],
  ])('«%s» válido → sin aviso y valor %d (recuperación tras corregir)', (t, n) => {
    expect(invalidAmountText(t)).toBeNull();
    expect(parseAmount(t)).toBe(n);
  });
});
