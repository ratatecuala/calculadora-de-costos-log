/**
 * Historial con filtros, presupuestos sellados, exportación (CSV para Excel y paquete para la CLI de #55),
 * copia de seguridad (exportar / importar con fusión por id) y «borrar todo» con confirmación propia.
 */
import { useState } from 'react';
import { distanciaViaje } from '../calculos';
import { cargasCsv, comparacionCsv, paqueteMedicion, viajesCsv } from '../exportar';
import type { Uso, Viaje } from '../modelo';
import { exportarRespaldo, fusionarRespaldo, guardarPresupuesto, leerRespaldo } from '../repositorio';
import { anular, huellaCorta } from '../sello';
import { diasDesde, isoLocal } from '../tiempo';
import { Confirmar, descargar, fechaHoraLegible, fmt, fmtClp, useCtx } from '../ui';
import { FichaViaje } from './Ficha';

const CSV = 'text/csv;charset=utf-8';
const JSON_T = 'application/json;charset=utf-8';

export function PantallaHistorial({ persistente }: { persistente: boolean | null }) {
  const { a, d, recargar, avisar } = useCtx();
  const [fVeh, setFVeh] = useState('');
  const [fEstado, setFEstado] = useState<'' | Viaje['estado']>('');
  const [fUso, setFUso] = useState<'' | Uso>('');
  const [ficha, setFicha] = useState<string | null>(null);
  const [anulandoPres, setAnulandoPres] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [conFotos, setConFotos] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  if (ficha) return <FichaViaje viajeId={ficha} onVolver={() => setFicha(null)} />;

  const viajes = d.viajes
    .filter((v) => (!fVeh || v.vehiculoId === fVeh) && (!fEstado || v.estado === fEstado) && (!fUso || v.uso === fUso))
    .sort((x, y) => y.inicio.localeCompare(x.inicio));
  const dias = diasDesde(d.ajustes.ultimaCopia);
  const recordar = d.ajustes.recordatorioCopiaDias !== null && (dias === null || dias >= d.ajustes.recordatorioCopiaDias);
  const hoy = isoLocal().slice(0, 10);
  const datos = { vehiculos: d.vehiculos, presupuestos: d.presupuestos, viajes: d.viajes, cargas: d.cargas };

  const exportarCopia = async () => {
    const r = await exportarRespaldo(a, isoLocal(), conFotos);
    descargar(`respaldo-medicion-${hoy}.json`, JSON.stringify(r), JSON_T);
    await a.guardar('ajustes', { ...d.ajustes, ultimaCopia: isoLocal(), editadoEl: isoLocal() });
    await recargar();
    avisar('Copia de seguridad exportada');
  };

  return (
    <>
      <section className="m-tarjeta" aria-label="Viajes">
        <h2>Historial</h2>
        <div className="m-fila m-envolver">
          <select aria-label="Filtrar por vehículo" value={fVeh} onChange={(e) => setFVeh(e.target.value)}>
            <option value="">Todos los vehículos</option>
            {d.vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.alias}
              </option>
            ))}
          </select>
          <select aria-label="Filtrar por estado" value={fEstado} onChange={(e) => setFEstado(e.target.value as '' | Viaje['estado'])}>
            <option value="">Todos los estados</option>
            <option value="en curso">En curso</option>
            <option value="cerrado">Cerrados</option>
            <option value="anulado">Anulados</option>
          </select>
          <select aria-label="Filtrar por uso" value={fUso} onChange={(e) => setFUso(e.target.value as '' | Uso)}>
            <option value="">Todo uso</option>
            <option value="personal">Personal</option>
            <option value="simulacion">Simulación</option>
          </select>
        </div>
        <ul className="m-lista" data-historial>
          {viajes.length === 0 ? <li className="m-nota">Sin viajes con estos filtros.</li> : null}
          {viajes.map((v) => {
            const veh = d.vehiculos.find((x) => x.id === v.vehiculoId) ?? null;
            return (
              <li key={v.id} className="m-item">
                <button type="button" className="m-item-btn" onClick={() => setFicha(v.id)} data-viaje={v.codigo}>
                  <strong>{v.codigo}</strong> · {fechaHoraLegible(v.inicio)} · {veh?.alias} · {v.estado} · {fmt(distanciaViaje(v, veh).km, ' km')}
                  {v.presupuestoId ? '' : ' · sin presupuesto'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="m-tarjeta" aria-label="Presupuestos sellados">
        <h2>Presupuestos sellados</h2>
        <p className="m-nota">Un presupuesto sellado no se edita. Para corregirlo, elígelo en «Viaje» y usa «Corregir»: se sella uno nuevo y este queda anulado.</p>
        <ul className="m-lista">
          {[...d.presupuestos]
            .sort((x, y) => y.creadoEl.localeCompare(x.creadoEl))
            .map((p) => (
              <li key={p.id} className="m-item m-columna" data-sello={p.datos.id}>
                <span>
                  {p.datos.id} · {fmtClp(p.datos.resultado?.costoClp)} · sello <code>{huellaCorta(p.sha256)}</code> · {p.estado}
                  {p.motivoAnulacion ? ` (${p.motivoAnulacion})` : ''}
                </span>
                {p.estado === 'sellado' ? (
                  anulandoPres === p.id ? (
                    <div className="m-confirmar">
                      <label className="m-campo">
                        <span>Motivo (sin datos personales)</span>
                        <input value={motivo} maxLength={80} onChange={(e) => setMotivo(e.target.value)} />
                      </label>
                      <Confirmar
                        texto="¿Anular este presupuesto? Es irreversible; sus datos sellados se conservan."
                        si="Sí, anular"
                        peligro
                        onSi={async () => {
                          await guardarPresupuesto(a, anular(p, motivo, isoLocal()));
                          setAnulandoPres(null);
                          setMotivo('');
                          await recargar();
                        }}
                        onNo={() => setAnulandoPres(null)}
                      />
                    </div>
                  ) : (
                    <button type="button" className="m-btn" onClick={() => setAnulandoPres(p.id)}>
                      Anular
                    </button>
                  )
                ) : null}
              </li>
            ))}
        </ul>
      </section>

      <section className="m-tarjeta" aria-label="Exportar">
        <h2>Exportar</h2>
        <p className="m-nota">CSV para Excel (UTF-8, separador «;», coma decimal). Las fotos nunca se exportan aquí.</p>
        <div className="m-fila m-envolver">
          <button type="button" className="m-btn m-btn-sec" data-exportar="viajes" onClick={() => descargar('viajes.csv', viajesCsv(datos), CSV)}>
            viajes.csv
          </button>
          <button type="button" className="m-btn m-btn-sec" data-exportar="cargas" onClick={() => descargar('cargas.csv', cargasCsv(datos), CSV)}>
            cargas.csv
          </button>
          <button type="button" className="m-btn m-btn-sec" data-exportar="comparacion" onClick={() => descargar('comparacion.csv', comparacionCsv(datos), CSV)}>
            comparacion.csv
          </button>
          <button
            type="button"
            className="m-btn m-btn-sec"
            data-exportar="paquete"
            onClick={async () => {
              try {
                descargar('paquete-medicion.json', JSON.stringify(await paqueteMedicion(datos), null, 2), JSON_T);
              } catch (e) {
                avisar(e instanceof Error ? e.message : 'No se pudo armar el paquete');
              }
            }}
          >
            Paquete para la CLI (paquete-medicion.json)
          </button>
        </div>
      </section>

      <section className="m-tarjeta" aria-label="Copia de seguridad">
        <h2>Copia de seguridad</h2>
        <p data-ultima-copia className={recordar ? 'm-aviso' : undefined}>
          {dias === null ? 'Nunca has exportado una copia.' : `Última copia hace ${dias} día${dias === 1 ? '' : 's'}.`} Los datos viven solo en este navegador: si borras sus datos o pierdes el teléfono, se pierden.
        </p>
        <p className="m-nota" data-persistencia>
          Almacenamiento persistente: {persistente === true ? 'concedido' : persistente === false ? 'no concedido por el navegador' : 'no disponible'}. Sin conexión:{' '}
          {'serviceWorker' in navigator && navigator.serviceWorker.controller ? 'listo' : 'se activa al abrir la versión compilada con conexión'}.
        </p>
        <label className="m-check">
          <input type="checkbox" checked={conFotos} onChange={(e) => setConFotos(e.target.checked)} />
          Incluir fotos conservadas (por defecto no)
        </label>
        <div className="m-fila m-envolver">
          <button type="button" className="m-btn m-btn-primario" data-respaldo-exportar onClick={exportarCopia}>
            Exportar copia
          </button>
          <label className="m-btn m-btn-sec m-foto">
            Importar copia (fusiona sin duplicar)
            <input
              type="file"
              accept="application/json,.json"
              data-respaldo-importar
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const r = await fusionarRespaldo(a, leerRespaldo(await f.text()));
                  await recargar();
                  setResultado(`Importado: ${r.agregados} nuevos, ${r.actualizados} actualizados, ${r.iguales} sin cambios${r.conflictos.length ? `. Conflictos: ${r.conflictos.join(' ')}` : ''}.`);
                } catch (err) {
                  setResultado(err instanceof Error ? err.message : 'No se pudo importar.');
                }
              }}
            />
          </label>
        </div>
        {resultado ? (
          <p className="m-info" role="status" data-resultado-importar>
            {resultado}
          </p>
        ) : null}
      </section>

      <section className="m-tarjeta" aria-label="Borrar todo">
        <h2>Borrar todo de este dispositivo</h2>
        {borrar ? (
          <Confirmar
            peligro
            texto="Esto borra vehículos, presupuestos, viajes, cargas y fotos de este navegador. No se puede deshacer. ¿Exportaste una copia antes?"
            si="Sí, borrar todo"
            onSi={async () => {
              setBorrar(false);
              await a.borrarTodo();
              await recargar();
              avisar('Datos borrados de este dispositivo');
            }}
            onNo={() => setBorrar(false)}
          />
        ) : (
          <button type="button" className="m-btn m-btn-peligro" data-borrar-todo onClick={() => setBorrar(true)}>
            Borrar todo…
          </button>
        )}
      </section>
    </>
  );
}
