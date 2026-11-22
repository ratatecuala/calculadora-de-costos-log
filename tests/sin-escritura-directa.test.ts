/**
 * #52 (A-74): la app escribe trabajos y documentos SOLO mediante la función `create_job_with_quote`.
 * La migración 20261122120000 revoca a `authenticated` el INSERT en `jobs` y el INSERT/DELETE en
 * `client_quotes`; esta prueba estática (sin red) impide que el código del navegador vuelva a depender de
 * esa escritura directa, o que toque el contador o la asignación privada de números.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** Cada uso de `.from('<tabla>')` con el resto de su sentencia (hasta el siguiente `;`). */
function usos(codigo: string, tabla: string): string[] {
  const re = new RegExp(String.raw`\.from\(\s*['"\`]${tabla}['"\`]\s*\)`, 'g');
  const out: string[] = [];
  for (const m of codigo.matchAll(re)) {
    const fin = codigo.indexOf(';', m.index!);
    out.push(codigo.slice(m.index!, fin === -1 ? undefined : fin));
  }
  return out;
}

/** Infracciones de escritura directa en un texto de código. */
export function infracciones(codigo: string): string[] {
  const out: string[] = [];
  for (const s of usos(codigo, 'jobs')) if (/\.(insert|upsert)\s*\(/.test(s)) out.push(`INSERT/UPSERT directo en jobs: ${s.slice(0, 80)}`);
  for (const s of usos(codigo, 'client_quotes')) if (/\.(insert|upsert|delete|update)\s*\(/.test(s)) out.push(`escritura directa en client_quotes: ${s.slice(0, 80)}`);
  if (usos(codigo, 'quote_counters').length > 0) out.push('acceso a quote_counters');
  if (/rpc\(\s*['"`]allocate_quote_number/.test(codigo)) out.push('llamada a allocate_quote_number');
  return out;
}

const SRC = join(__dirname, '..', 'src');
const todos = archivos(SRC);

describe('#52 · el navegador no escribe directamente en jobs ni en client_quotes', () => {
  it('ningún archivo de src/ hace INSERT/UPSERT en jobs, escritura en client_quotes ni toca el contador', () => {
    const hallazgos = todos.flatMap((f) => infracciones(readFileSync(f, 'utf8')).map((i) => `${f}: ${i}`));
    expect(hallazgos).toEqual([]);
  });

  it('el guardado en la cuenta usa la función create_job_with_quote', () => {
    const conRpc = todos.filter((f) => /rpc\(\s*['"`]create_job_with_quote['"`]/.test(readFileSync(f, 'utf8')));
    expect(conRpc.length).toBeGreaterThan(0);
  });

  it('el detector encuentra cada forma prohibida (control de la propia prueba)', () => {
    expect(infracciones(`await supabase.from('jobs').insert({ number: 1 });`)).toHaveLength(1);
    expect(infracciones(`await supabase.from("jobs").upsert(row).select();`)).toHaveLength(1);
    expect(infracciones(`await c.from('client_quotes').delete().eq('job_id', id);`)).toHaveLength(1);
    expect(infracciones(`await c.from('client_quotes').insert(q);`)).toHaveLength(1);
    expect(infracciones(`await c.from('quote_counters').select('*');`)).toHaveLength(1);
    expect(infracciones(`await c.rpc('allocate_quote_number', { p_preferred: 1 });`)).toHaveLength(1);
    // Lo permitido no se marca: leer, cambiar estado/pago y borrar el trabajo completo (D-52-5).
    expect(infracciones(`await c.from('jobs').select('*'); await c.from('jobs').update(patch).eq('id', id); await c.from('jobs').delete().eq('id', id);`)).toEqual([]);
  });
});
