import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function fuentes(directorio) {
  assert.ok(existsSync(join(directorio, 'index.html')), directorio);
  const mapas = readdirSync(directorio, { recursive: true }).filter(nombre => nombre.endsWith('.js.map'));
  assert.ok(mapas.length > 0, 'Faltan mapas del build ' + directorio);
  return mapas.flatMap(nombre => JSON.parse(readFileSync(join(directorio, nombre), 'utf8')).sources);
}

const comercial = fuentes('dist');
const medicion = fuentes('dist-medicion');
assert.ok(comercial.some(f => f.includes('/src/web/')), 'Falta la aplicación comercial');
assert.ok(medicion.some(f => f.includes('/src/medicion/')), 'Falta la aplicación de medición');
assert.ok(medicion.some(f => f.includes('/src/shared/campo/')), 'Falta el contrato compartido en el build privado');
for (const f of comercial) assert.doesNotMatch(f, /\/src\/(medicion|shared\/campo)\//);
for (const f of medicion) assert.doesNotMatch(f, /\/src\/(web|server)\/|\/node_modules\/@supabase\/|\/scripts\/(campo|simulacro)\//);
assert.ok(existsSync('dist-medicion/sw.js'), 'El build privado carece de service worker');
assert.ok(!existsSync('dist/medicion/index.html'), 'El build comercial contiene la entrada privada');
console.log('Paquetes separados. Fuentes en los mapas: comercial %d, privado %d.', comercial.length, medicion.length);
