import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluarRegistro } from '../scripts/campo/evaluar';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const ruta = (nombre: string) => join(raiz, 'datos', 'pruebas-campo', nombre + '.csv');
const plantilla = readFileSync(ruta('plantilla'), 'utf8');
const escenarios = readFileSync(ruta('escenarios'), 'utf8');

function resultados(csv: string) {
  const [encabezado, ...rows] = csv.trimEnd().split('\n');
  const campos = encabezado!.split(';');
  return rows.map((row) => Object.fromEntries(row.split(';').map((v, i) => [campos[i]!, v])));
}

function viaje(cambios: Record<string, string>) {
  const [encabezado, row] = plantilla.trimEnd().split('\n');
  const valores = row!.split(';');
  return encabezado + '\n' + encabezado!.split(';').map((k, i) => cambios[k] ?? valores[i]).join(';');
}

describe('registro de pruebas de campo', () => {
  it('la plantilla no inventa km, minutos ni montos mientras se espera el viaje', () => {
    expect(resultados(evaluarRegistro(plantilla))[0]).toMatchObject({
      estado: 'pendiente_recorrido', km: '', min_marcha: '', combustible_estimado_clp: '', costo_motor_clp: '', precio_sugerido_clp: '',
    });
  });

  it('procesa la misma medición sin cambiar la circulación al simular un flete', () => {
    const datos = { km: '12,5', min_marcha: '32', km_l_ref: '10', fuente_km_l: 'estimado', clp_l: '1300', fuente_clp_l: 'boleta',
      desgaste_clp_km: '45', fijos_clp_h: '1800', tag_clp: '0', fuente_tag: 'declarado' };
    const personal = viaje(datos);
    const sim = viaje({ ...datos, caso: 'flete-001', uso: 'simulacion', min_carga: '25', trabajo_clp_h: '6000' });
    const [a, b] = resultados(evaluarRegistro('\uFEFF' + personal.replace('\n', '\r\n') + '\r\n' + sim.split('\n')[1]));
    expect(a).toMatchObject({ estado: 'estimacion_completa', combustible_estimado_clp: '1625', desgaste_estimado_clp: '562,5',
      fijos_asignados_clp: '960', precio_sugerido_clp: '', margen_simulacion_pct: '' });
    expect(b).toMatchObject({ recorrido: a!.recorrido, km: a!.km, origen_km_min: 'medido', combustible_estimado_clp: '1625',
      trabajo_objetivo_clp: '5700', fijos_asignados_clp: '1710', costo_motor_clp: '9598', precio_sugerido_clp: '12000' });
  });

  it('solo con distancia y tiempo deja el combustible desconocido y el costo como cota', () => {
    const [r] = resultados(evaluarRegistro(viaje({ km: '5', min_marcha: '10' })));
    expect(r).toMatchObject({ estado: 'estimacion_parcial', tipo_costo: 'cotaInferior', combustible_estimado_clp: '', precio_sugerido_clp: '' });
    expect(r!.faltan.split('|')).toContain('combustible');
  });

  it('rechaza números ilegibles, fuentes ausentes y supuestos comerciales en circulación', () => {
    for (const cambios of [{ km: '1.000,5' }, { clp_l: '1200' }, { trabajo_clp_h: '5000' }]) {
      expect(() => evaluarRegistro(viaje(cambios as Record<string, string>))).toThrow(/Fila 2/);
    }
  });

  it('ejecuta el comando de campo y compara los cinco escenarios públicos reproducibles', () => {
    const runner = join(dirname(createRequire(import.meta.url).resolve('vite-node/package.json')), 'vite-node.mjs');
    const salida = execFileSync(process.execPath, [runner, 'scripts/campo/registro.ts', ruta('escenarios')], { cwd: raiz, encoding: 'utf8' });
    expect(salida).toBe(evaluarRegistro(escenarios));
    const registros = resultados(salida);
    expect(registros.map((r) => r.caso)).toEqual(['refrigerador', 'mudanza-pequena', 'muebles', 'reparto-furgon', 'flete-ayudantes']);
    expect(registros.every((r) => r.uso === 'simulacion' && r.origen_km_min === 'supuesto')).toBe(true);
    expect(registros.filter((r) => r.precio_sugerido_clp)).toHaveLength(4);
    expect(registros[2]).toMatchObject({ estado: 'estimacion_parcial', peajes_clp: '', faltan: 'peajes', precio_sugerido_clp: '' });
    expect(registros[4]!.ayudantes_clp).toBe('32000');
  });
});
