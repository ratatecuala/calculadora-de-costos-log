import { readFileSync, writeFileSync } from 'node:fs';
import { evaluarRegistro } from './evaluar';

const [entrada, salida, ...extra] = process.argv.slice(2);
try {
  if (!entrada || extra.length) throw new Error('Uso: npm run campo -- entrada.csv [salida.csv]');
  const resultado = evaluarRegistro(readFileSync(entrada, 'utf8'));
  if (salida) writeFileSync(salida, resultado, { flag: 'wx' });
  else process.stdout.write(resultado);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo procesar el registro');
  process.exitCode = 1;
}
