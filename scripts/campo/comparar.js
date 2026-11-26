import { buildCostItems } from '../../src/engine/inputs.ts';
import { computeMeasures } from '../../src/engine/measures.ts';
import { displayAmount } from '../../src/engine/rounding.ts';
import { clase, valor, partidasDirectas, tiempos } from './evidencia.js';

function suma(...xs) {
  return xs.every(x => x !== null) ? xs.reduce((a,b) => a+b,0) : null;
}

function division(n,d) {
  return n !== null && d > 0 ? n/d : null;
}

export function diferencia(previsto, referencia) {
  const delta = previsto === null || referencia === null ? null : previsto - referencia;
  return { previsto, referencia, diferencia:delta, absoluta:delta === null ? null : Math.abs(delta),
    porcentaje:delta === null || referencia === 0 ? null : delta/referencia*100,
    sentido:delta === null ? 'sin comparaci�n' : delta === 0 ? 'igual' : delta < 0 ? 'subestimaci�n' : 'sobreestimaci�n' };
}

export function cobertura(campos) {
  const faltan = Object.keys(campos).filter(k => campos[k] === null);
  const total = Object.keys(campos).length;
  return { presentes:total-faltan.length,total,faltan };
}

// El motor exige n�meros en algunos campos. El adaptador anula cada partida dependiente
// de una entrada ausente ANTES de sumar. Nunca publica la cifra provisional del motor.
export function presupuesto(p, ruta, uso) {
  const n = k => valor(p[k]);
  const km = valor(ruta.km), marcha = valor(ruta.marchaMin);
  const maniobras = suma(valor(ruta.cargaMin),valor(ruta.descargaMin));
  const helpers = n('ayudantes');
  const params = { kmPerL:n('kmL'), fuelPricePerL:n('precioLitro'), wearPerKm:n('desgasteKm'),
    fixedPerHour:n('fijoHora'), ownerPerHour:n('trabajoHora'), helpers:helpers ?? 0,
    helperFee:n('pagoAyudante'), loadMinutes:maniobras ?? 0, tolls:n('tag'), otherCosts:n('otros') ?? 0 };
  const incognita = { combustible:km === null, desgaste:km === null, gastosFijos:marcha === null || maniobras === null,
    remuneracion:marcha === null || maniobras === null, ayudantes:helpers === null, otros:n('otros') === null };
  const items = buildCostItems(km ?? 0,marcha ?? 0,params).map(item => incognita[item.id] ? {...item,amount:null} : item);
  const medidas = computeMeasures({items,margin:(n('margenPct') ?? 0)/100,surcharges:n('recargos')});
  const sugerible = uso !== 'personal' && medidas.complete && n('margenPct') !== null && n('recargos') !== null;
  return { evidencia:uso === 'simulacion' ? 'SIMULADO':'ESTIMADO',
    partidas:Object.fromEntries(items.map(i => [i.id,i.amount])), litrosEstimados:division(km,params.kmPerL),
    costoClp:items.every(i => i.amount === null) ? null : displayAmount(medidas.cost),
    tipo:medidas.cost.type, faltan:medidas.missing, sugeridoClp:sugerible ? displayAmount(medidas.suggested) : null };
}

export function rendimiento(i) {
  if (!i || i.registroCompleto !== true || i.recargas.length < 2) return null;
  const a = i.recargas[0], b = i.recargas.at(-1);
  if (!a.lleno || !b.lleno || !a.odometro || !b.odometro) return null;
  const km = valor(b.odometro)-valor(a.odometro);
  const litros = suma(...i.recargas.slice(1).map(r => valor(r.litros)));
  return km > 0 ? division(km,litros) : null;
}

function gastos(o,sim) {
  const porPartida = {};
  for (const k of partidasDirectas) {
    const lineas = o.comprobantes.filter(r => r.partida === k);
    porPartida[k] = { clp:lineas.length ? lineas.reduce((s,r) => s+r.clp,0) : null, cobertura:o.cobertura[k] };
  }
  return { evidencia:o.comprobantes.length ? (sim ? 'SIMULADO':'COMPROBADO') : 'DATO FALTANTE',
    subtotalClp:o.comprobantes.length ? o.comprobantes.reduce((s,r)=>s+r.clp,0) : null, porPartida };
}

export function informe(f,sello) {
  const o = f.observacion, sim = f.uso === 'simulacion';
  const p = sello?.plan, previo = sello?.resultado ?? null;
  const posterior = p ? presupuesto(p,o,f.uso) : null;
  const verificable = Boolean(sello && (sim || (o.inicio && Date.parse(sello.fecha) <= Date.parse(o.inicio))));
  const cmp = (a,b) => diferencia(verificable ? a ?? null : null,b ?? null);
  const d = gastos(o,sim);
  const recorrido = {};
  for (const k of tiempos) recorrido[k] = {...cmp(valor(p?.[k]),valor(o[k])),evidencia:clase(o[k])};
  const totalMin = r => suma(...tiempos.slice(1).map(k => valor(r?.[k])));
  recorrido.totalMin = cmp(totalMin(p),totalMin(o));
  const porPartida = {};
  for (const k of partidasDirectas) {
    const partida = d.porPartida[k];
    const ref = partida.cobertura === 'completa' ? partida.clp : null;
    porPartida[k] = {original:cmp(previo?.partidas[k],ref),recalculado:cmp(posterior?.partidas[k],ref)};
  }
  const kmL = rendimiento(o.intervalo);
  const claseComparable = o.intervalo !== null && o.recorrido !== null && o.nivelCarga !== null && o.aire !== null
    && o.recorrido === o.intervalo.recorrido && o.nivelCarga === o.intervalo.carga && o.aire === o.intervalo.aire;
  const desgasteKm = division(valor(o.mantencion?.gastoClp),valor(o.mantencion?.kmPeriodo));
  const fijoHora = division(valor(o.fijos?.gastoClp),valor(o.fijos?.horasProductivas));
  // Estas referencias son asignaciones estimadas a partir de un periodo, nunca comprobantes del viaje.
  const referencia = presupuesto({kmL:[claseComparable ? kmL : null],precioLitro:o.precioLitro,desgasteKm:[desgasteKm],fijoHora:[fijoHora]},o,f.uso);
  for (const k of ['combustible','desgaste','gastosFijos']) {
    const ref = referencia.partidas[k];
    porPartida[k] = {evidencia:ref === null ? 'DATO FALTANTE' : sim ? 'SIMULADO':'ESTIMADO',
      original:cmp(previo?.partidas[k],ref),recalculado:cmp(posterior?.partidas[k],ref)};
  }
  const faltantes = {...Object.fromEntries(tiempos.map(k => [k,o[k]])), inicio:o.inicio, resolucionKm:o.resolucionKm,
    precioLitro:o.precioLitro, rendimientoComparable:claseComparable ? kmL : null, desgastePeriodo:desgasteKm, fijosPeriodo:fijoHora,
    tipoCarga:o.tipoCarga,pesoKg:o.pesoKg,ayudantes:o.ayudantes,minutosAyudantes:o.minutosAyudantes,equipo:o.equipo};
  for (const k of partidasDirectas) faltantes[k] = d.porPartida[k].cobertura === 'completa' ? d.porPartida[k].clp : null;
  if (f.uso !== 'personal') faltantes.cobrado = o.cobrado;
  return {uso:f.uso,vehiculo:f.vehiculo,tipoVehiculo:f.tipoVehiculo,contexto:f.uso === 'personal' ? 'metodolog�a personal' : sim ? 'ensayo ficticio':'observaci�n de flete',
    estadoPresupuesto:!sello ? 'sin presupuesto previo' : verificable ? 'previo al viaje o simulaci�n' : 'cronolog�a sin verificar',
    fechaPresupuesto:sello?.fecha ?? null, entradasOriginales:p ?? null, presupuestoOriginal:previo, recalculado:posterior,
    recorrido, gastosDelViaje:d, comparacionClp:porPartida,
    variacionCostoModelado:cmp(previo?.tipo === 'estimado' ? previo.costoClp : null,posterior?.tipo === 'estimado' ? posterior.costoClp : null),
    referencias:{rendimientoMedidoIntervaloKmL:kmL,claseComparable,rendimientoKmL:{...cmp(valor(p?.kmL),claseComparable ? kmL : null),evidencia:kmL === null || !claseComparable ? 'DATO FALTANTE' : sim ? 'SIMULADO':'MEDIDO'},
      desgasteClpKm:desgasteKm, fijoClpHora:fijoHora,litrosAsignadosEstimados:referencia.litrosEstimados,
      precioLitro:o.precioLitro,fuentePrecio:o.fuentePrecio},
    precios:f.uso === 'personal' ? null : {sugerido:previo?.sugeridoClp ?? null,cotizado:p?.cotizado ?? null,cobrado:o.cobrado,
      cotizadoVsCobrado:cmp(valor(p?.cotizado),valor(o.cobrado))},
    observacion:o, completitud:{plan:p ? cobertura(p) : null, observacion:cobertura(faltantes)} };
}
