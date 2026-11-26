/**
 * Pantalla «Viaje»: 1) vehículo (solo si hay uno) · 2) presupuesto previo · 3) iniciar · 4) lectura inicial ·
 * 5) finalizar · 6) lectura final · 7) comparación. Nada de lo que se toca durante el viaje es obligatorio:
 * todo se puede registrar después, con la hora editable.
 */
import { useState } from 'react';
import cotizacionFicticia from '../fixtures/cotizacion-v3-ficticia.json';
import { avisosLectura, ultimoOdometro } from '../calculos';
import { recodificarFoto } from '../foto';
import type { OrigenPresupuesto, PresupuestoSellado, TipoEvento, Uso, Viaje } from '../modelo';
import { FORMATO_REGISTRO, nuevoId } from '../modelo';
import { entradaDesdePlan, entradaDesdeVehiculo, leerCotizacion, type EntradaPlan } from '../presupuesto';
import { registrarLectura, siguienteCodigo } from '../repositorio';
import { huellaCorta } from '../sello';
import { aInputLocal, cambiarTramo, cerrarTramos, desdeInputLocal, isoLocal, zonaDispositivo } from '../tiempo';
import { CampoLectura, Confirmar, fechaHoraLegible, fmtClp, useCtx, useReloj } from '../ui';
import { FichaViaje } from './Ficha';
import { FormPresupuesto } from './Presupuesto';

const ESTADOS: [TipoEvento, string][] = [
  ['marcha', 'En marcha'],
  ['espera', 'Espera'],
  ['carga', 'Carga'],
  ['descarga', 'Descarga'],
  ['pausa', 'Pausa'],
];

export const AVISO_CONDUCIR = 'No manipules el teléfono mientras conduces. Todo lo de esta pantalla es opcional: puedes registrarlo al detenerte o después del viaje.';

function HoraEditable({ etiqueta, valor, onCambio }: { etiqueta: string; valor: string | null; onCambio: (iso: string | null) => void }) {
  return (
    <details className="m-hora">
      <summary>¿Lo registras después? Cambiar {etiqueta}</summary>
      <label className="m-campo">
        <span>{etiqueta}</span>
        <input type="datetime-local" defaultValue={aInputLocal(valor ?? isoLocal())} onChange={(e) => onCambio(desdeInputLocal(e.target.value))} data-hora={etiqueta} />
      </label>
    </details>
  );
}

interface FormEstado {
  entrada: EntradaPlan;
  origen: OrigenPresupuesto;
  avisos: string[];
  reemplaza: PresupuestoSellado | null;
}

export function PantallaViaje() {
  const { a, d, veh, recargar, irA, avisar } = useCtx();
  const [form, setForm] = useState<FormEstado | null>(null);
  const [uso, setUso] = useState<Uso>('personal');
  const [presId, setPresId] = useState<string | null>(null);
  const [horaInicio, setHoraInicio] = useState<string | null>(null);
  const [horaFin, setHoraFin] = useState<string | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);
  const ahora = useReloj();

  if (!veh) {
    return (
      <section className="m-tarjeta">
        <h2>{d.vehiculos.length ? 'Elige tu vehículo' : 'Primero, tu vehículo'}</h2>
        <p>{d.vehiculos.length ? 'Tienes varios vehículos: elige uno arriba.' : 'Registra tu vehículo una vez (sin patente). Después no se vuelve a pedir.'}</p>
        <button type="button" className="m-btn m-btn-primario m-grande" onClick={() => irA('vehiculo')}>
          {d.vehiculos.length ? 'Ver vehículos' : 'Agregar vehículo'}
        </button>
      </section>
    );
  }

  const enCurso = d.viajes.find((v) => v.vehiculoId === veh.id && v.estado === 'en curso');
  if (fichaId && !enCurso) return <FichaViaje viajeId={fichaId} onVolver={() => setFichaId(null)} />;

  if (enCurso) {
    const actual = enCurso.tramos.find((t) => t.fin === null);
    const guardar = async (x: Viaje) => {
      await a.guardar('viajes', { ...x, editadoEl: isoLocal() });
      await recargar();
    };
    const seg = actual ? Math.max(0, Math.floor((ahora.getTime() - Date.parse(actual.inicio)) / 1000)) : 0;
    const reloj = `${String(Math.floor(seg / 3600)).padStart(2, '0')}:${String(Math.floor((seg % 3600) / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`;
    const ultimo = ultimoOdometro(veh.id, d.viajes, d.cargas, enCurso.id);
    return (
      <>
        <p className="m-conducir" role="note" data-aviso-conducir>
          {AVISO_CONDUCIR}
        </p>
        <section className="m-tarjeta" aria-label="Viaje en curso">
          <h2>
            {enCurso.codigo} en curso · desde {fechaHoraLegible(enCurso.inicio)}
          </h2>
          <p className="m-estado-actual" data-estado-actual={actual?.tipo}>
            {ESTADOS.find(([k]) => k === actual?.tipo)?.[1] ?? '—'} <span className="num">{reloj}</span>
          </p>
          <div className="m-estados" role="group" aria-label="Estado del viaje (opcional)">
            {ESTADOS.map(([k, t]) => (
              <button key={k} type="button" className={actual?.tipo === k ? 'm-btn m-estado m-btn-on' : 'm-btn m-estado'} aria-pressed={actual?.tipo === k} onClick={() => actual?.tipo !== k && void guardar({ ...enCurso, tramos: cambiarTramo(enCurso.tramos, k, isoLocal()) })}>
                {t}
              </button>
            ))}
          </div>
          <p className="m-nota">Cada toque cierra el tramo anterior y abre otro: no se escriben minutos.</p>
        </section>
        <section className="m-tarjeta" aria-label="Lectura inicial">
          <h2>Lectura inicial (TRIP u odómetro)</h2>
          <div className="m-grilla">
            <CampoLectura
              id="inicial-trip"
              etiqueta="TRIP inicial"
              actual={enCurso.lecturas.inicial.trip?.valor ?? null}
              ayuda="Sugerencia: ponlo en cero al salir."
              avisosDe={(valor) => avisosLectura('trip', 'inicial', valor, enCurso, null)}
              onGuardar={async ({ valor, foto, conservar }) => {
                await registrarLectura(a, enCurso, 'inicial', 'trip', valor, { ahora: isoLocal(), foto, conservar, recodificar: recodificarFoto });
                await recargar();
                avisar('Lectura guardada');
              }}
            />
            <CampoLectura
              id="inicial-odometro"
              etiqueta="Odómetro inicial"
              actual={enCurso.lecturas.inicial.odometro?.valor ?? null}
              ayuda={ultimo !== null ? `Último conocido: ${ultimo} km` : undefined}
              avisosDe={(valor) => avisosLectura('odometro', 'inicial', valor, enCurso, ultimo)}
              onGuardar={async ({ valor, foto, conservar }) => {
                await registrarLectura(a, enCurso, 'inicial', 'odometro', valor, { ahora: isoLocal(), foto, conservar, recodificar: recodificarFoto });
                await recargar();
                avisar('Lectura guardada');
              }}
            />
          </div>
        </section>
        <section className="m-tarjeta">
          <HoraEditable etiqueta="hora de fin" valor={horaFin} onCambio={setHoraFin} />
          <button
            type="button"
            className="m-btn m-btn-primario m-grande"
            data-finalizar
            onClick={async () => {
              const fin = horaFin ?? isoLocal();
              const fin2 = Date.parse(fin) < Date.parse(enCurso.inicio) ? enCurso.inicio : fin;
              await guardar({ ...enCurso, estado: 'cerrado', fin: fin2, horaEditada: enCurso.horaEditada || horaFin !== null, tramos: cerrarTramos(enCurso.tramos, fin2) });
              setHoraFin(null);
              setFichaId(enCurso.id);
              avisar('Viaje finalizado: registra la lectura final');
            }}
          >
            Finalizar viaje
          </button>
          {anulando ? (
            <Confirmar
              texto="¿Anular este viaje en curso? Queda en el historial como anulado."
              si="Sí, anular"
              peligro
              onSi={() => {
                setAnulando(false);
                void guardar({ ...enCurso, estado: 'anulado', fin: isoLocal(), tramos: cerrarTramos(enCurso.tramos, isoLocal()) });
              }}
              onNo={() => setAnulando(false)}
            />
          ) : (
            <button type="button" className="m-btn" onClick={() => setAnulando(true)}>
              Anular viaje
            </button>
          )}
        </section>
      </>
    );
  }

  if (form) {
    return (
      <FormPresupuesto
        inicial={form.entrada}
        origen={form.origen}
        uso={uso}
        avisosIniciales={form.avisos}
        reemplaza={form.reemplaza}
        onSellado={(p) => {
          setForm(null);
          setPresId(p.id);
        }}
        onCancelar={() => setForm(null)}
      />
    );
  }

  const usados = new Set(d.viajes.map((v) => v.presupuestoId).filter(Boolean));
  const disponibles = d.presupuestos
    .filter((p) => p.vehiculoId === veh.id && p.estado === 'sellado' && !usados.has(p.id) && p.datos.uso === uso)
    .sort((x, y) => y.creadoEl.localeCompare(x.creadoEl));
  const elegido = disponibles.find((p) => p.id === presId) ?? null;

  const desdeCotizacion = (json: unknown) => {
    try {
      const c = leerCotizacion(json);
      setErrorArchivo(null);
      setForm({ entrada: c.entrada, origen: { tipo: 'cotizacion', schemaVersion: c.schemaVersion, folio: c.folio, ficticia: c.ficticia }, avisos: c.avisos, reemplaza: null });
    } catch (e) {
      setErrorArchivo(e instanceof Error ? e.message : 'No se pudo leer la cotización.');
    }
  };

  const iniciar = async () => {
    const inicio = horaInicio ?? isoLocal();
    const v: Viaje = {
      id: nuevoId(),
      formato: FORMATO_REGISTRO,
      codigo: elegido?.datos.id ?? siguienteCodigo(d),
      vehiculoId: veh.id,
      presupuestoId: elegido?.id ?? null,
      uso,
      estado: 'en curso',
      inicio,
      fin: null,
      zona: zonaDispositivo(),
      horaEditada: horaInicio !== null,
      lecturas: { inicial: { trip: null, odometro: null }, final: { trip: null, odometro: null } },
      tripReiniciadoKm: null,
      tramos: [{ tipo: 'marcha', inicio, fin: null }],
      recorrido: null,
      nivelCarga: null,
      aire: null,
      comprobantes: [],
      cobertura: { peajes: null, ayudantes: null, otros: null },
      creadoEl: isoLocal(),
      editadoEl: isoLocal(),
    };
    await a.guardar('viajes', v);
    setPresId(null);
    setHoraInicio(null);
    await recargar();
    avisar(`Viaje ${v.codigo} iniciado`);
  };

  return (
    <>
      <section className="m-tarjeta" aria-label="Presupuesto previo">
        <h2>1 · Presupuesto previo</h2>
        <div className="m-fila" role="radiogroup" aria-label="Uso">
          <button type="button" className={uso === 'personal' ? 'm-btn m-btn-on' : 'm-btn'} aria-pressed={uso === 'personal'} onClick={() => setUso('personal')}>
            Uso personal
          </button>
          <button type="button" className={uso === 'simulacion' ? 'm-btn m-btn-on' : 'm-btn'} aria-pressed={uso === 'simulacion'} onClick={() => setUso('simulacion')}>
            Simulación (ficticia)
          </button>
        </div>
        <ul className="m-lista" aria-label="Presupuestos sellados disponibles">
          {disponibles.map((p) => (
            <li key={p.id} className={presId === p.id ? 'm-item m-sel' : 'm-item'}>
              <button type="button" className="m-item-btn" onClick={() => setPresId(p.id)} data-presupuesto={p.datos.id}>
                {presId === p.id ? '● ' : '○ '}
                {p.datos.id} · {fmtClp(p.datos.resultado?.costoClp)} · sello {huellaCorta(p.sha256)} · {fechaHoraLegible(p.datos.fecha)}
              </button>
            </li>
          ))}
          <li className={presId === null ? 'm-item m-sel' : 'm-item'}>
            <button type="button" className="m-item-btn" onClick={() => setPresId(null)}>
              {presId === null ? '● ' : '○ '}Sin presupuesto (la comparación dirá «sin presupuesto previo»)
            </button>
          </li>
        </ul>
        <div className="m-fila m-envolver">
          <button type="button" className="m-btn m-btn-sec" data-nuevo-presupuesto onClick={() => setForm({ entrada: entradaDesdeVehiculo(veh), origen: { tipo: 'nuevo' }, avisos: [], reemplaza: null })}>
            Nuevo presupuesto
          </button>
          <label className="m-btn m-btn-sec m-foto">
            Desde una cotización (archivo)
            <input
              type="file"
              accept="application/json,.json"
              data-archivo-cotizacion
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (f.size > 1_000_000) return setErrorArchivo('El archivo es demasiado grande para ser una cotización.');
                try {
                  desdeCotizacion(JSON.parse(await f.text()));
                } catch {
                  setErrorArchivo('El archivo no es JSON válido.');
                }
              }}
            />
          </label>
          <button type="button" className="m-btn m-btn-sec" data-cotizacion-ficticia onClick={() => desdeCotizacion(cotizacionFicticia)}>
            Cotización ficticia de ejemplo
          </button>
        </div>
        {errorArchivo ? <p className="m-aviso">{errorArchivo}</p> : null}
        {elegido ? (
          <button
            type="button"
            className="m-btn"
            onClick={() => setForm({ entrada: entradaDesdePlan(elegido.datos.plan, elegido.datos.procedencia), origen: elegido.datos.origen, avisos: ['Corregir = sellar uno nuevo y anular el anterior.'], reemplaza: elegido })}
          >
            Corregir el presupuesto elegido
          </button>
        ) : null}
      </section>
      <section className="m-tarjeta" aria-label="Iniciar viaje">
        <h2>2 · Iniciar viaje</h2>
        <p className="m-nota">Fecha, hora y zona se guardan solas. Después podrás registrar la lectura inicial (TRIP u odómetro).</p>
        <HoraEditable etiqueta="hora de inicio" valor={horaInicio} onCambio={setHoraInicio} />
        <button type="button" className="m-btn m-btn-primario m-grande" data-iniciar onClick={iniciar}>
          Iniciar viaje{elegido ? ` con ${elegido.datos.id}` : ' sin presupuesto'}
        </button>
      </section>
    </>
  );
}

