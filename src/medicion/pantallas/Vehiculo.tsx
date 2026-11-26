/**
 * «Vehículo» (A-92): resumen en palabras simples, «Cambiar datos» (vuelve al alta guiada) y, plegadas en
 * «Opciones avanzadas», las resoluciones, la procedencia y los valores por defecto técnicos, más los avisos
 * (D-6: vacíos por defecto). Perfil propio, sin patente (D-4).
 */
import { useState } from 'react';
import { procedencia, type ClaseDato } from '../../shared/procedencia';
import { ETIQUETA_COMBUSTIBLE, ETIQUETA_TIPO, nombreVehiculo } from '../alta';
import { IconoVehiculo } from '../ilustraciones';
import type { Ajustes, DatoMedicion, FuentePrecio, LecturaTablero, VehiculoMedicion } from '../modelo';
import { CLASE_DE_FUENTE_PRECIO } from '../presupuesto';
import { isoLocal } from '../tiempo';
import { aTexto, CampoNumero, fmt, parseNumero, useCtx } from '../ui';

const TABLERO: Record<LecturaTablero, string> = { decimal: 'con decimal', entero: 'solo enteros', no_tiene: 'no tiene', no_se: 'no lo sabes' };
const ORIGEN: Record<string, string> = { declarado: 'lo dices tú', medido: 'medido con tus recargas', comprobado: 'con documento', estimado: 'estimado', simulado: 'simulado' };
const CLASES_DEFECTO: [ClaseDato, string][] = [
  ['declarado', 'Lo sé yo (declarado)'],
  ['medido', 'Medido (lleno a lleno)'],
  ['comprobado', 'Con documento (comprobado)'],
  ['estimado', 'Estimado'],
];

type CampoDef = 'kmL' | 'desgasteKm' | 'fijoHora' | 'trabajoHora';
const DEFS: [CampoDef, string, string][] = [
  ['kmL', 'Rendimiento', 'km/L'],
  ['desgasteKm', 'Desgaste por kilómetro', '$/km'],
  ['trabajoHora', 'Remuneración objetivo (solo simulaciones)', '$/h'],
  ['fijoHora', 'Gastos fijos por hora (solo simulación detallada)', '$/h'],
];

/** Opciones avanzadas: valores técnicos. Conserva todo lo demás del vehículo (perfil, tipo, alias). */
function FormAvanzado({ inicial }: { inicial: VehiculoMedicion }) {
  const { a, recargar, avisar } = useCtx();
  const [resTrip, setResTrip] = useState(aTexto(inicial?.resolucionTripKm ?? null));
  const [resOdo, setResOdo] = useState(aTexto(inicial?.resolucionOdometroKm ?? null));
  const [resLitros, setResLitros] = useState(aTexto(inicial?.resolucionLitros ?? null));
  const [precio, setPrecio] = useState(aTexto(inicial?.porDefecto.precioLitro.valor ?? null));
  const [fuente, setFuente] = useState<FuentePrecio>(inicial?.porDefecto.precioLitro.fuentePrecio ?? 'boleta');
  const [vals, setVals] = useState<Record<CampoDef, string>>(() => ({
    kmL: aTexto(inicial?.porDefecto.kmL.valor ?? null),
    desgasteKm: aTexto(inicial?.porDefecto.desgasteKm.valor ?? null),
    fijoHora: aTexto(inicial?.porDefecto.fijoHora.valor ?? null),
    trabajoHora: aTexto(inicial?.porDefecto.trabajoHora.valor ?? null),
  }));
  const [clases, setClases] = useState<Record<CampoDef, ClaseDato>>(() => ({
    kmL: inicial?.porDefecto.kmL.procedencia.clase === 'faltante' ? 'declarado' : (inicial?.porDefecto.kmL.procedencia.clase ?? 'declarado'),
    desgasteKm: inicial?.porDefecto.desgasteKm.procedencia.clase === 'faltante' ? 'declarado' : (inicial?.porDefecto.desgasteKm.procedencia.clase ?? 'declarado'),
    fijoHora: 'declarado',
    trabajoHora: 'declarado',
  }));

  const guardar = async () => {
    const ahora = isoLocal();
    const hoy = ahora.slice(0, 10);
    const dato = (texto: string, clase: ClaseDato, previo?: DatoMedicion): DatoMedicion => {
      const v = parseNumero(texto);
      // Sin cambios: se conserva el dato tal cual (con su procedencia y detalle).
      if (previo && previo.valor === v && (v === null || previo.procedencia.clase === clase)) return previo;
      return v === null || v < 0 ? { valor: null, procedencia: procedencia('faltante', 'vehiculo') } : { valor: v, procedencia: procedencia(clase, 'vehiculo', null, hoy) };
    };
    const p = parseNumero(precio);
    const kmL = dato(vals.kmL, clases.kmL, inicial.porDefecto.kmL);
    const rTrip = parseNumero(resTrip);
    const rOdo = parseNumero(resOdo);
    const veh: VehiculoMedicion = {
      ...inicial,
      resolucionTripKm: rTrip,
      resolucionOdometroKm: rOdo,
      resolucionLitros: parseNumero(resLitros),
      porDefecto: {
        precioLitro:
          p === inicial.porDefecto.precioLitro.valor && (p === null || fuente === inicial.porDefecto.precioLitro.fuentePrecio)
            ? inicial.porDefecto.precioLitro
            : {
                ...(p === null || p < 0 ? { valor: null, procedencia: procedencia('faltante', 'vehiculo') } : { valor: p, procedencia: procedencia(CLASE_DE_FUENTE_PRECIO[fuente], 'vehiculo', null, hoy) }),
                fuentePrecio: p === null ? null : fuente,
              },
        kmL,
        desgasteKm: dato(vals.desgasteKm, clases.desgasteKm, inicial.porDefecto.desgasteKm),
        fijoHora: dato(vals.fijoHora, clases.fijoHora, inicial.porDefecto.fijoHora),
        trabajoHora: dato(vals.trabajoHora, clases.trabajoHora, inicial.porDefecto.trabajoHora),
      },
      // Si el rendimiento cambió aquí, la respuesta del alta deja de describirlo.
      // Si cambió aquí un valor que el alta describe, esa respuesta deja de valer (queda sin responder).
      ...(inicial.perfil
        ? {
            perfil: {
              ...inicial.perfil,
              consumo: kmL.valor !== inicial.porDefecto.kmL.valor ? null : inicial.perfil.consumo,
              trip: rTrip !== inicial.resolucionTripKm ? null : inicial.perfil.trip,
              odometro: rOdo !== inicial.resolucionOdometroKm ? null : inicial.perfil.odometro,
            },
          }
        : {}),
      editadoEl: ahora,
    };
    await a.guardar('vehiculos', veh);
    await recargar();
    avisar('Detalles técnicos guardados');
  };

  return (
    <section className="m-tarjeta" aria-label="Detalles técnicos del vehículo">
      <h2>Detalles técnicos</h2>
      <p className="m-nota">Solo si los conoces. Lo que dejes vacío queda como «no se sabe», nunca como cero.</p>
      <div className="m-grilla">
        <CampoNumero id="veh-res-trip" etiqueta="Resolución del TRIP" valor={resTrip} onCambio={setResTrip} sufijo="km" ayuda="Lo que avanza el último dígito: 0,1 si muestra decimal, 1 si solo enteros." />
        <CampoNumero id="veh-res-odo" etiqueta="Resolución del kilometraje total" valor={resOdo} onCambio={setResOdo} sufijo="km" />
        <CampoNumero id="veh-res-litros" etiqueta="Resolución de los litros del surtidor" valor={resLitros} onCambio={setResLitros} sufijo="L" ayuda="Por ejemplo 0,01. Si no la sabes, déjala vacía." />
      </div>
      <h3>Valores que se proponen al estimar un viaje</h3>
      <p className="m-nota">No se piden SOAP, permisos, seguros ni gastos anuales.</p>
      <div className="m-grilla">
        <CampoNumero id="veh-precio" etiqueta="Precio del combustible" valor={precio} onCambio={setPrecio} sufijo="$/L" />
        <label className="m-campo">
          <span>Origen del precio</span>
          <select value={fuente} onChange={(e) => setFuente(e.target.value as FuentePrecio)}>
            <option value="boleta">Boleta (comprobado)</option>
            <option value="surtidor">Surtidor (medido)</option>
            <option value="declaracion">Lo sé yo (declarado)</option>
            <option value="supuesto">Supuesto (estimado)</option>
          </select>
        </label>
        {DEFS.map(([k, etiqueta, unidad]) => (
          <div key={k} className="m-par">
            <CampoNumero id={`veh-${k}`} etiqueta={etiqueta} valor={vals[k]} onCambio={(v) => setVals((s) => ({ ...s, [k]: v }))} sufijo={unidad} />
            <label className="m-campo">
              <span>Origen</span>
              <select value={clases[k]} onChange={(e) => setClases((s) => ({ ...s, [k]: e.target.value as ClaseDato }))}>
                {CLASES_DEFECTO.map(([c, t]) => (
                  <option key={c} value={c}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
      <button type="button" className="m-btn m-btn-primario" onClick={guardar}>
        Guardar detalles técnicos
      </button>
    </section>
  );
}

function FormAjustes() {
  const { a, d, recargar, avisar } = useCtx();
  const u = d.ajustes.umbrales;
  const [vel, setVel] = useState(aTexto(u.velocidadMediaKmH));
  const [desv, setDesv] = useState(aTexto(u.desvioKmPct));
  const [abierto, setAbierto] = useState(aTexto(u.viajeAbiertoHoras));
  const [copia, setCopia] = useState(aTexto(d.ajustes.recordatorioCopiaDias));
  const guardar = async () => {
    const pos = (t: string) => {
      const n = parseNumero(t);
      return n !== null && n > 0 ? n : null;
    };
    const aj: Ajustes = {
      ...d.ajustes,
      umbrales: { velocidadMediaKmH: pos(vel), desvioKmPct: pos(desv), viajeAbiertoHoras: pos(abierto) },
      recordatorioCopiaDias: pos(copia),
      editadoEl: isoLocal(),
    };
    await a.guardar('ajustes', aj);
    await recargar();
    avisar('Ajustes guardados');
  };
  return (
    <section className="m-tarjeta" aria-label="Avisos">
      <h2>Avisos (opcionales)</h2>
      <p className="m-nota">Mientras estén vacíos, el aviso no existe. No te sugerimos valores. Los avisos nunca bloquean nada.</p>
      <div className="m-grilla">
        <CampoNumero id="aj-vel" etiqueta="Velocidad media implícita mayor que" valor={vel} onCambio={setVel} sufijo="km/h" />
        <CampoNumero id="aj-desv" etiqueta="Km observados difieren del previsto en más de" valor={desv} onCambio={setDesv} sufijo="%" />
        <CampoNumero id="aj-abierto" etiqueta="Viaje abierto por más de" valor={abierto} onCambio={setAbierto} sufijo="h" />
        <CampoNumero id="aj-copia" etiqueta="Recordar copia de seguridad cada" valor={copia} onCambio={setCopia} sufijo="días" />
      </div>
      <button type="button" className="m-btn m-btn-primario" onClick={guardar}>
        Guardar avisos
      </button>
    </section>
  );
}

function Fila({ t, v }: { t: string; v: string }) {
  return (
    <div>
      <dt>{t}</dt>
      <dd>{v}</dd>
    </div>
  );
}

export function PantallaVehiculo() {
  const { d, veh, elegirVehiculo, abrirAlta } = useCtx();
  if (!veh) return <p className="m-nota">Elige un vehículo en el inicio.</p>;
  const p = veh.perfil;
  const kmL = veh.porDefecto.kmL;
  const noSe = 'no lo sabemos';
  return (
    <>
      <h1 className="m-titulo">Mi vehículo</h1>
      <section className="m-tarjeta m-resumen-veh" aria-label="Resumen del vehículo" data-resumen-vehiculo>
        <div className="m-fila">
          <IconoVehiculo tipo={veh.tipoVehiculo} />
          <div>
            <h2>{nombreVehiculo(veh)}</h2>
            <p className="m-nota">{ETIQUETA_TIPO[veh.tipoVehiculo]}</p>
          </div>
        </div>
        <dl className="m-datos">
          <Fila t="Motor" v={p?.motor ?? noSe} />
          <Fila t="Combustible" v={veh.combustible ? ETIQUETA_COMBUSTIBLE[veh.combustible] : noSe} />
          <Fila t="TRIP" v={p?.trip ? TABLERO[p.trip] : veh.resolucionTripKm !== null ? `avanza de a ${fmt(veh.resolucionTripKm, ' km')}` : noSe} />
          <Fila t="Kilometraje total" v={p?.odometro ? TABLERO[p.odometro] : veh.resolucionOdometroKm !== null ? `avanza de a ${fmt(veh.resolucionOdometroKm, ' km')}` : noSe} />
          <Fila
            t="Rendimiento"
            v={
              kmL.valor === null
                ? 'aún no lo sabemos: se medirá con tus recargas'
                : p?.consumo?.unidad === 'L/100km' && p.consumo.valor !== null
                  ? `${fmt(p.consumo.valor, ' L/100 km')} (${ORIGEN[kmL.procedencia.clase] ?? kmL.procedencia.clase})`
                  : `${fmt(kmL.valor, ' km/L')} (${ORIGEN[kmL.procedencia.clase] ?? kmL.procedencia.clase})`
            }
          />
        </dl>
        <button type="button" className="m-btn m-btn-primario" onClick={() => abrirAlta(veh)}>
          Cambiar datos
        </button>
      </section>
      {d.vehiculos.length > 1 ? (
        <section className="m-tarjeta" aria-label="Otros vehículos">
          <h2>Tus vehículos</h2>
          <ul className="m-lista">
            {d.vehiculos.map((v) => (
              <li key={v.id} className={veh.id === v.id ? 'm-item m-sel' : 'm-item'}>
                <button type="button" className="m-item-btn" onClick={() => elegirVehiculo(v.id)}>
                  <strong>{nombreVehiculo(v)}</strong>
                  {veh.id === v.id ? ' ✓ en uso' : ''}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <button type="button" className="m-btn m-btn-sec" onClick={() => abrirAlta(null)}>
        + Agregar otro vehículo
      </button>
      <details className="m-avanzado" data-avanzado="vehiculo">
        <summary>Opciones avanzadas</summary>
        <p className="m-nota">
          Código interno del vehículo: <code>{veh.alias}</code> (se usa en los archivos, nunca la patente).
        </p>
        <FormAvanzado key={veh.id + veh.editadoEl} inicial={veh} />
        <FormAjustes />
      </details>
    </>
  );
}
