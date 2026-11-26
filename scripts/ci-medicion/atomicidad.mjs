import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { expect } = require('playwright/test');
const [base, carpeta] = process.argv.slice(2);
assert.equal(new URL(base).hostname, '127.0.0.1');
const copias = readdirSync(carpeta, { recursive: true })
  .filter(nombre => /^respaldo-medicion-.*\.json$/.test(basename(nombre)));
assert.ok(copias.length > 0, 'Falta un respaldo ficticio descargado en el E2E');
const respaldo = JSON.parse(readFileSync(join(carpeta, copias[0]), 'utf8'));
assert.ok(respaldo.vehiculos.length && respaldo.presupuestos.length && respaldo.viajes.length && respaldo.cargas.length);

async function contenidoBD(page) {
  return page.evaluate(async () => {
    const pedido = r => new Promise((ok, fallo) => {
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fallo(r.error);
    });
    const bd = await pedido(indexedDB.open('medicion.v1'));
    try {
      const nombres = Array.from(bd.objectStoreNames);
      if (!nombres.length) throw new Error('Faltan las colecciones de medición');
      const tx = bd.transaction(nombres, 'readonly');
      return Object.fromEntries(await Promise.all(nombres.map(async nombre => {
        const registros = await pedido(tx.objectStore(nombre).getAll());
        return [nombre, registros];
      })));
    } finally {
      bd.close();
    }
  });
}

const pruebas = [
  ['JSON incompleto', () => '{'],
  ['versión de respaldo desconocida', r => ({ ...r, version: 999 })],
  ['sello de presupuesto alterado', r => {
    r.presupuestos[0].datos.plan.km = [98765, 'DECLARADO'];
    return r;
  }],
  ['referencia de vehículo ausente', r => {
    r.cargas[0].vehiculoId = 'vehiculo-ficticio-ausente';
    return r;
  }],
  ['identificador duplicado', r => {
    r.viajes.push(structuredClone(r.viajes[0]));
    return r;
  }],
];
const browser = await chromium.launch();
try {
  for (const [nombre, alterar] of pruebas) {
    const pagina = await browser.newPage();
    try {
      await pagina.goto(base);
      await pagina.getByRole('button', { name: 'Restaurar una copia de seguridad', exact: true }).click();
      const entrada = pagina.locator('[data-respaldo-importar]');
      const resultado = pagina.locator('[data-resultado-importar]');
      const previo = await contenidoBD(pagina);
      // La copia válida incluye varias filas nuevas. Un rechazo tardío debe
      // preservar cada colección, incluso las que preceden a la fila inválida.
      const invalido = alterar(structuredClone(respaldo));
      const cargar = datos => entrada.setInputFiles({
        name: 'respaldo-ficticio.json', mimeType: 'application/json',
        buffer: Buffer.from(typeof datos === 'string' ? datos : JSON.stringify(datos)),
      });
      await cargar(invalido);
      await expect(resultado).toContainText(/no se importó nada/i);
      assert.deepEqual(await contenidoBD(pagina), previo, nombre);
      // Control positivo en el mismo dispositivo: la copia sin alterar debe
      // introducir sus registros y la reimportación no debe cambiar la base.
      if (nombre === 'sello de presupuesto alterado') {
        await cargar(respaldo);
        await expect(resultado).toContainText(/Importado: [1-9]\d* nuevos/);
        const importado = await contenidoBD(pagina);
        assert.deepEqual(importado.presupuestos, respaldo.presupuestos);
        await cargar(respaldo);
        await expect(resultado).toContainText('Importado: 0 nuevos');
        assert.deepEqual(await contenidoBD(pagina), importado);
        console.log('OK · Copia válida, sello original y reimportación idéntica');
      }
      console.log('OK · Rechazo sin escrituras en IndexedDB: ' + nombre);
    } finally {
      await pagina.close();
    }
  }
} finally {
  await browser.close();
}
