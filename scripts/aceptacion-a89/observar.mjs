import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// El proceso recibe solo estímulos. El padre conserva los esperados y compara.
const { casos, comunes, historicos, sesion } = JSON.parse(readFileSync(0, 'utf8'));
const producto = await import(pathToFileURL(resolve(process.argv[2])).href);
for (const name of ['evaluar', 'abrirHistorico', 'iniciarSesion']) {
  if (typeof producto[name] !== 'function') throw new Error('Falta la operación ' + name);
}

const muestras = [];
for (const caso of casos) muestras.push(structuredClone(await producto.evaluar(caso, comunes)));

const lecturas = [];
for (const archivo of historicos) lecturas.push(structuredClone(await producto.abrirHistorico(archivo)));

const activa = await producto.iniciarSesion(sesion.inicial, sesion.entrada, comunes);
const pasos = [];
for (const accion of sesion.acciones) {
  switch (accion) {
    case 'abrir': break;
    case 'elegir_simplificada': await activa.elegirModalidad('S'); break;
    case 'confirmar_precio': await activa.confirmarPrecio(); break;
    case 'elegir_detallada': await activa.elegirModalidad('D'); break;
    default: throw new Error('Acción desconocida: ' + accion);
  }
  // Un adaptador puede devolver una referencia viva al borrador.
  pasos.push(structuredClone(await activa.observar()));
}
process.stdout.write(JSON.stringify({ casos: muestras, historicos: lecturas, pasos }));
