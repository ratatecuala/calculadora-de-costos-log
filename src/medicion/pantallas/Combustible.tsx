/**
 * Recargas de combustible. Las PARCIALES son el uso normal: no se exige llenar el estanque. Los intervalos
 * lleno a lleno son opcionales, para calibración controlada. Sin saldo inicial y final no se infieren los
 * litros consumidos por un viaje: una carga parcial queda como gasto registrado.
 */
import { useState } from 'react';
import { avisosCarga, intervalosLleno, kmDesdeAnterior, ordenarCargas, totalCarga, type Aviso } from '../calculos';
import { intervaloFicha, medirIntervalo } from '../campo';
import type { CargaCombustible, CierreIntervalo, Muestra, NivelCarga, Recorrido } from '../modelo';
import { FORMATO_REGISTRO, nuevoId } from '../modelo';
import { aInputLocal, desdeInputLocal, isoLocal } from '../tiempo';
import { Avisos, CampoNumero, Confirmar, fechaHoraLegible, fmt, fmtClp, parseNumero, useCtx } from '../ui';

type FuenteCarga = NonNullable<CargaCombustible['fuentePrecio']>;

export function PantallaCombustible() {
  const { a, d, veh, recargar, irA, avisar } = useCtx();
  const [litros, setLitros] = useState('');
  const [precio, setPrecio] = useState('');
  const [total, setTotal] = useState('');
  const [odo, setOdo] = useState('');
  const [lleno, setLleno] = useState(false);
  const [fuente, setFuente] = useState<FuenteCarga>('boleta');
  const [fecha, setFecha] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [borrando, setBorrando] = useState<string | null>(null);

  if (!veh) {
    return (
      <section className="m-tarjeta">
        <h2>Combustible</h2>
        <p>Primero elige o registra tu vehículo.</p>
        <button type="button" className="m-btn m-btn-primario" onClick={() => irA('vehiculo')}>
          Ir a Vehículo
        </button>
      </section>
    );
  }
  const l = parseNumero(litros);
  const p = parseNumero(precio);
  const automatico = l !== null ? totalCarga(l, p) : null;
  const propias = d.cargas.filter((c) => c.vehiculoId === veh.id);
  const ordenadas = ordenarCargas(propias);
  const kmAnt = kmDesdeAnterior(ordenadas);
  const intervalos = intervalosLleno(d.cargas, veh.id);

  const guardar = async () => {
    if (l === null) return;
    const ahora = isoLocal();
    const t = parseNumero(total);
    const c: CargaCombustible = {
      id: nuevoId(),
      formato: FORMATO_REGISTRO,
      vehiculoId: veh.id,
      fechaHora: fecha ?? ahora,
      litros: l,
      precioLitro: p,
      totalClp: t !== null ? Math.round(t) : automatico,
      totalEditado: t !== null && t !== automatico,
      fuentePrecio: p === null ? null : fuente,
      odometro: parseNumero(odo),
      lleno,
      referencia: null,
      cierreIntervalo: null,
      creadoEl: ahora,
      editadoEl: ahora,
    };
    setAvisos(avisosCarga(c, propias, veh));
    await a.guardar('cargas', c);
    setLitros('');
    setPrecio('');
    setTotal('');
    setOdo('');
    setLleno(false);
    setFecha(null);
    await recargar();
    avisar('Carga guardada');
  };

  const cerrar = async (c: CargaCombustible, cambio: Partial<CierreIntervalo>) => {
    const base: CierreIntervalo = c.cierreIntervalo ?? { muestra: null, recorrido: null, carga: null, aire: null, registroCompleto: null };
    await a.guardar('cargas', { ...c, cierreIntervalo: { ...base, ...cambio }, editadoEl: isoLocal() });
    await recargar();
  };

  return (
    <>
      <section className="m-tarjeta" aria-label="Nueva carga">
        <h2>Registrar carga de combustible</h2>
        <p className="m-nota">No hace falta llenar el estanque: una carga parcial es lo normal. Fecha y hora se guardan solas.</p>
        <div className="m-grilla">
          <CampoNumero id="carga-litros" etiqueta="Litros" valor={litros} onCambio={setLitros} sufijo="L" />
          <CampoNumero id="carga-precio" etiqueta="Precio por litro" valor={precio} onCambio={setPrecio} sufijo="$/L" />
          <CampoNumero id="carga-total" etiqueta="Total pagado" valor={total} onCambio={setTotal} sufijo="$" ayuda={`Automático: ${fmtClp(automatico)}. Escríbelo solo si la boleta dice otra cosa.`} />
          <CampoNumero id="carga-odo" etiqueta="Odómetro (opcional)" valor={odo} onCambio={setOdo} sufijo="km" ayuda="Sirve para los km entre cargas y para ubicar tus viajes." />
          <label className="m-campo">
            <span>Origen del precio</span>
            <select value={fuente} onChange={(e) => setFuente(e.target.value as FuenteCarga)}>
              <option value="boleta">Boleta</option>
              <option value="surtidor">Surtidor</option>
              <option value="declaracion">Lo recuerdo (declarado)</option>
            </select>
          </label>
        </div>
        <div className="m-fila" role="radiogroup" aria-label="Tipo de carga">
          <button type="button" className={!lleno ? 'm-btn m-btn-on' : 'm-btn'} aria-pressed={!lleno} onClick={() => setLleno(false)}>
            Parcial
          </button>
          <button type="button" className={lleno ? 'm-btn m-btn-on' : 'm-btn'} aria-pressed={lleno} onClick={() => setLleno(true)}>
            Lleno
          </button>
        </div>
        <details className="m-hora">
          <summary>¿La registras después? Cambiar fecha y hora</summary>
          <input type="datetime-local" aria-label="Fecha y hora de la carga" defaultValue={aInputLocal(isoLocal())} onChange={(e) => setFecha(desdeInputLocal(e.target.value))} data-fecha-carga />
        </details>
        <button type="button" className="m-btn m-btn-primario m-grande" disabled={l === null} onClick={guardar} data-guardar-carga>
          Guardar carga
        </button>
        <Avisos avisos={avisos} />
      </section>

      <section className="m-tarjeta" aria-label="Cargas">
        <h2>Cargas de {veh.alias}</h2>
        <ul className="m-lista" data-cargas>
          {[...ordenadas].reverse().map((c) => (
            <li key={c.id} className="m-item">
              <span>
                {fechaHoraLegible(c.fechaHora)} · {fmt(c.litros, ' L')} · {fmtClp(c.totalClp)} · {c.lleno ? 'lleno' : 'parcial'}
                {c.odometro !== null ? ` · odómetro ${fmt(c.odometro)}` : ''}
                {kmAnt.get(c.id) != null ? ` · ${fmt(kmAnt.get(c.id))} km desde la anterior` : ''}
                {!(c.litros > 0) ? ' · revisar litros' : ''}
              </span>
              {borrando === c.id ? (
                <Confirmar
                  texto="¿Borrar esta carga?"
                  si="Sí, borrar"
                  peligro
                  onSi={async () => {
                    setBorrando(null);
                    await a.borrar('cargas', c.id);
                    await recargar();
                  }}
                  onNo={() => setBorrando(null)}
                />
              ) : (
                <button type="button" className="m-btn" onClick={() => setBorrando(c.id)}>
                  Borrar
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="m-tarjeta" aria-label="Intervalos lleno a lleno">
        <h2>Intervalos lleno a lleno (opcional)</h2>
        <p className="m-nota">
          Solo para calibración controlada: aparecen cuando registras dos cargas «lleno». El km/L lo calcula el contrato de #55 con un intervalo completo, odómetros y litros de boleta o surtidor.
        </p>
        <p className="m-nota" data-calibracion-validacion>
          Calibración y validación van separadas: un intervalo marcado «Calibración» sirve para ajustar y nunca valida un presupuesto. Para validar, el presupuesto debe reservar
          «validación» antes del viaje y el intervalo debe ser posterior al último ajuste. Los litros que el contrato asigne a un viaje son una estimación, no consumo medido del viaje.
        </p>
        {intervalos.length === 0 ? <p className="m-nota">Sin intervalos todavía.</p> : null}
        {intervalos.map((i) => {
          const m = i.hasta.cierreIntervalo;
          const medicion = medirIntervalo(intervaloFicha(i, veh, false, null));
          const incert = (k: 'incertidumbreLitros' | 'incertidumbreKm', texto: string) => {
            const n = parseNumero(texto);
            void cerrar(i.hasta, { [k]: n !== null && n >= 0 ? n : null });
          };
          return (
            <article key={i.codigo} className="m-cmp" data-intervalo={i.codigo}>
              <h3>
                {i.codigo}: {fechaHoraLegible(i.desde.fechaHora)} → {fechaHoraLegible(i.hasta.fechaHora)}
              </h3>
              <p>
                {fmt(i.km, ' km')} por odómetro · {i.parciales.length} carga(s) parcial(es) entre medio ·{' '}
                <span data-km-l>{medicion ? `${fmt(Math.round(medicion.kmL * 100) / 100, ' km/L')} medido sobre el intervalo` : 'km/L: dato faltante (falta marcar el registro completo, un odómetro o litros de boleta/surtidor)'}</span>
              </p>
              <div className="m-grilla">
                <label className="m-campo">
                  <span>Uso del intervalo</span>
                  <select value={m?.muestra ?? ''} onChange={(e) => void cerrar(i.hasta, { muestra: (e.target.value || null) as Muestra | null })}>
                    <option value="">— sin marcar —</option>
                    <option value="calibracion">Calibración</option>
                    <option value="validacion">Validación</option>
                  </select>
                </label>
                <label className="m-campo">
                  <span>Recorrido</span>
                  <select value={m?.recorrido ?? ''} onChange={(e) => void cerrar(i.hasta, { recorrido: (e.target.value || null) as Recorrido | null })}>
                    <option value="">—</option>
                    <option value="urbano">Urbano</option>
                    <option value="autopista">Autopista</option>
                    <option value="mixto">Mixto</option>
                  </select>
                </label>
                <label className="m-campo">
                  <span>Carga</span>
                  <select value={m?.carga ?? ''} onChange={(e) => void cerrar(i.hasta, { carga: (e.target.value || null) as NivelCarga | null })}>
                    <option value="">—</option>
                    <option value="sin">Sin</option>
                    <option value="parcial">Parcial</option>
                    <option value="completa">Completa</option>
                  </select>
                </label>
                <label className="m-campo">
                  <span>Aire acondicionado</span>
                  <select value={m?.aire === true ? 'si' : m?.aire === false ? 'no' : ''} onChange={(e) => void cerrar(i.hasta, { aire: e.target.value === 'si' ? true : e.target.value === 'no' ? false : null })}>
                    <option value="">—</option>
                    <option value="si">Sí</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="m-check">
                  <input type="checkbox" checked={m?.registroCompleto === true} onChange={(e) => void cerrar(i.hasta, { registroCompleto: e.target.checked })} />
                  Registré todas las cargas del intervalo
                </label>
                <label className="m-campo">
                  <span>Incertidumbre de los litros (± L, opcional)</span>
                  <input inputMode="decimal" defaultValue={m?.incertidumbreLitros != null ? String(m.incertidumbreLitros).replace('.', ',') : ''} onBlur={(e) => incert('incertidumbreLitros', e.target.value)} />
                </label>
                <label className="m-campo">
                  <span>Incertidumbre de los km (± km, opcional)</span>
                  <input inputMode="decimal" defaultValue={m?.incertidumbreKm != null ? String(m.incertidumbreKm).replace('.', ',') : ''} onBlur={(e) => incert('incertidumbreKm', e.target.value)} />
                </label>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
