import { readFileSync, writeFileSync } from 'node:fs';
try {
  const [entrada, salida, ...extra] = process.argv.slice(2);
  if (entrada === 'fase0') {
    if (extra.length !== (salida === 'resumen' ? 0 : 1)) throw new Error('Usa iniciar|sellar|comparar viaje-001, o resumen sin c�digo.');
    const { ejecutar } = await import('./archivo.js');
    console.log(ejecutar(salida, extra[0]));
  } else {
    if (!entrada || extra.length) throw new Error('Uso: npm run campo -- entrada.csv [salida.csv]');
    const { evaluarRegistro } = await import('./evaluar');
    const resultado = evaluarRegistro(readFileSync(entrada, 'utf8'));
    if (salida) writeFileSync(salida, resultado, { flag: 'wx' });
    else process.stdout.write(resultado);
  }
} catch (error) {
  console.error(error instanceof Error && !('path' in error) ? error.message : 'No se pudo abrir o guardar el registro local.');
  process.exitCode = 1;
}
