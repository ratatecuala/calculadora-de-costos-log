/** Vehículo de medición (D-4: perfil propio, sin patente) y ajustes de avisos (D-6: vacíos por defecto). */
import { useState } from 'react';
import { procedencia, type ClaseDato } from '../../shared/procedencia';
import type { Ajustes, Combustible, DatoMedicion, FuentePrecio, TipoVehiculo, VehiculoMedicion } from '../modelo';
import { FORMATO_REGISTRO, nuevoId } from '../modelo';
import { CLASE_DE_FUENTE_PRECIO } from '../presupuesto';
import { siguienteAlias } from '../repositorio';
import { isoLocal } from '../tiempo';
import { aTexto, CampoNumero, parseNumero, useCtx } from '../ui';

const TIPOS: [TipoVehiculo, string][] = [
  ['auto', 'Auto'],
  ['camioneta', 'Camioneta'],
  ['furgon', 'Furgón'],
  ['camion_liviano', 'Camión liviano'],
  ['otro', 'Otro'],
];
const CLASES_DEFECTO: [ClaseDato, string][] = [
  ['declarado', 'Lo sé yo (declarado)'],
  ['medido', 'Medido (lleno a lleno)'],
  ['comprobado', 'Con documento (comprobado)'],
  ['estimado', 'Estimado'],
];

type CampoDef = 'kmL' | 'desgasteKm' | 'fijoHora' | 'trabajoHora';
const DEFS: [CampoDef, string, string][] = [
  ['kmL', 'Rendimiento', 'km/L'],
  ['desgasteKm', 'Desgaste', '$/km'],
  ['trabajoHora', 'Lo que quieres ganar', '$/h'],
  ['fijoHora', 'Gastos fijos (opcional, modalidad detallada)', '$/h'],
];

function FormVehiculo({ inicial, onListo }: { inicial: VehiculoMedicion | null; onListo: () => void }) {
  const { a, d, recargar, elegirVehiculo, avisar } = useCtx();
  const [tipo, setTipo] = useState<TipoVehiculo>(inicial?.tipoVehiculo ?? 'auto');
  const [comb, setComb] = useState<Combustible>(inicial?.combustible ?? 'gasolina');
  const [resTrip, setResTrip] = useState(aTexto(inicial?.resolucionTripKm ?? null));
  const [resOdo, setResOdo] = useState(aTexto(inicial?.resolucionOdometroKm ?? null));
  const [cap, setCap] = useState(aTexto(inicial?.capacidadEstanqueL ?? null));
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
    const dato = (texto: string, clase: ClaseDato): DatoMedicion => {
      const v = parseNumero(texto);
      return v === null || v < 0 ? { valor: null, procedencia: procedencia('faltante', 'vehiculo') } : { valor: v, procedencia: procedencia(clase, 'vehiculo', null, hoy) };
    };
    const p = parseNumero(precio);
    const veh: VehiculoMedicion = {
      id: inicial?.id ?? nuevoId(),
      formato: FORMATO_REGISTRO,
      alias: inicial?.alias ?? siguienteAlias(d.vehiculos),
      tipoVehiculo: tipo,
      combustible: comb,
      resolucionTripKm: parseNumero(resTrip),
      resolucionOdometroKm: parseNumero(resOdo),
      resolucionLitros: parseNumero(resLitros),
      capacidadEstanqueL: parseNumero(cap),
      porDefecto: {
        precioLitro: {
          ...(p === null || p < 0 ? { valor: null, procedencia: procedencia('faltante', 'vehiculo') } : { valor: p, procedencia: procedencia(CLASE_DE_FUENTE_PRECIO[fuente], 'vehiculo', null, hoy) }),
          fuentePrecio: p === null ? null : fuente,
        },
        kmL: dato(vals.kmL, clases.kmL),
        desgasteKm: dato(vals.desgasteKm, clases.desgasteKm),
        fijoHora: dato(vals.fijoHora, clases.fijoHora),
        trabajoHora: dato(vals.trabajoHora, clases.trabajoHora),
      },
      creadoEl: inicial?.creadoEl ?? ahora,
      editadoEl: ahora,
    };
    await a.guardar('vehiculos', veh);
    elegirVehiculo(veh.id);
    await recargar();
    avisar(`Vehículo ${veh.alias} guardado`);
    onListo();
  };

  return (
    <section className="m-tarjeta" aria-label="Datos del vehículo">
      <h2>{inicial ? `Editar ${inicial.alias}` : 'Nuevo vehículo'}</h2>
      <p className="m-nota">Sin patente ni datos personales: el vehículo se identifica con un alias (veh-001).</p>
      <div className="m-grilla">
        <label className="m-campo">
          <span>Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoVehiculo)} id="veh-tipo">
            {TIPOS.map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="m-campo">
          <span>Combustible</span>
          <select value={comb} onChange={(e) => setComb(e.target.value as Combustible)}>
            <option value="gasolina">Gasolina</option>
            <option value="diesel">Diésel</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <CampoNumero id="veh-res-trip" etiqueta="Resolución del TRIP" valor={resTrip} onCambio={setResTrip} sufijo="km" ayuda="Lo que avanza el último dígito (p. ej., 0,1). Vacío si no tiene TRIP." />
        <CampoNumero id="veh-res-odo" etiqueta="Resolución del odómetro" valor={resOdo} onCambio={setResOdo} sufijo="km" />
        <CampoNumero id="veh-res-litros" etiqueta="Resolución de los litros del surtidor (opcional)" valor={resLitros} onCambio={setResLitros} sufijo="L" ayuda="Por ejemplo 0,01. Si no la sabes, déjala vacía." />
        <CampoNumero id="veh-cap"etiqueta="Capacidad del estanque (opcional)" valor={cap} onCambio={setCap} sufijo="L" ayuda="Solo para avisar si una carga la supera." />
      </div>
      <h3>Valores por defecto del presupuesto (opcionales)</h3>
      <p className="m-nota">Lo que dejes vacío queda como dato faltante, nunca como cero. No se piden SOAP, permisos, seguros ni gastos anuales.</p>
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
      <div className="m-fila">
        <button type="button" className="m-btn m-btn-primario m-grande" onClick={guardar}>
          Guardar vehículo
        </button>
        <button type="button" className="m-btn" onClick={onListo}>
          Cancelar
        </button>
      </div>
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
      <p className="m-nota">
        Vacíos por defecto: mientras estén vacíos, el aviso no existe. No hay valores sugeridos porque no tienen fuente (DATO FALTANTE). Los avisos nunca bloquean.
      </p>
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

export function PantallaVehiculo() {
  const { d, veh, elegirVehiculo } = useCtx();
  const [editando, setEditando] = useState<VehiculoMedicion | 'nuevo' | null>(d.vehiculos.length === 0 ? 'nuevo' : null);
  if (editando) return <FormVehiculo inicial={editando === 'nuevo' ? null : editando} onListo={() => setEditando(null)} />;
  return (
    <>
      <section className="m-tarjeta" aria-label="Vehículos">
        <h2>Vehículos</h2>
        <ul className="m-lista">
          {d.vehiculos.map((v) => (
            <li key={v.id} className={veh?.id === v.id ? 'm-item m-sel' : 'm-item'}>
              <button type="button" className="m-item-btn" onClick={() => elegirVehiculo(v.id)}>
                <strong>{v.alias}</strong> · {TIPOS.find(([k]) => k === v.tipoVehiculo)?.[1]} · {v.combustible}
                {veh?.id === v.id ? ' ✓' : ''}
              </button>
              <button type="button" className="m-btn m-btn-sec" onClick={() => setEditando(v)}>
                Editar
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="m-btn m-btn-primario" onClick={() => setEditando('nuevo')}>
          + Agregar vehículo
        </button>
      </section>
      <FormAjustes />
    </>
  );
}
