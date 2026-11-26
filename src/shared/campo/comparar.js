import { buildCostItems } from '../../engine/inputs.ts';
import { computeMeasures } from '../../engine/measures.ts';
import { displayAmount } from '../../engine/rounding.ts';
import { clase, valor, partidasDirectas, tiempos } from './evidencia.js';
import { alcancePartida } from './alcance.js';
import { conciliar, derivarReferencia, dividir, espera, medirIntervalo, seguro, sumar, vincularIntervalo } from './referencia.js';

function suma(...xs) {
  return sumar(xs);
}

export function diferencia(previsto, referencia) {
  const delta = previsto === null || referencia === null ? null : previsto - referencia;
  return { previsto, referencia, diferencia:delta, absoluta:delta === null ? null : Math.abs(delta),
    porcentaje:delta === null || referencia === 0 ? null : seguro(delta/referencia*100),
    sentido:delta === null ? 'sin comparación' : delta === 0 ? 'igual' : delta < 0 ? 'subestimación' : 'sobreestimación' };
}

export function cobertura(campos) {
  const faltan = Object.keys(campos).filter(k => campos[k] === null);
  const total = Object.keys(campos).length;
  return { presentes:total-faltan.length,total,faltan };
}

// El motor exige números en algunos campos. El adaptador anula cada partida dependiente
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
  const incluidas=items.filter(i=>alcancePartida(p,i.id)==='incluida');
  const medidas = computeMeasures({items:incluidas,margin:(n('margenPct') ?? 0)/100,surcharges:n('recargos')});
  const sugerible = uso !== 'personal' && medidas.complete && n('margenPct') !== null && n('recargos') !== null;
  return { evidencia:uso === 'simulacion' ? 'SIMULADO':'ESTIMADO',
    coberturaEconomica:medidas.complete && espera(ruta,p).potencialClp===0 ? 'cubierto por el modelo':'parcial',
    partidas:Object.fromEntries(items.map(i => [i.id,incluidas.includes(i) ? seguro(i.amount) : null])), litrosEstimados:dividir(km,params.kmPerL),
    costoClp:incluidas.every(i => i.amount === null) ? null : displayAmount(medidas.cost),
    tipo:medidas.cost.type, faltan:medidas.missing, sugeridoClp:sugerible ? displayAmount(medidas.suggested) : null };
}

export function rendimiento(i) {
  return medirIntervalo(i)?.kmL ?? null;
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

export function informe(f,sello,ultimoAjuste=null,versionActual=null) {
  const o = f.observacion, sim = f.uso === 'simulacion';
  const p = sello?.plan, previo = sello?.resultado ?? null;
  const original=sello?.versionMotor;
  const motores=!original?.sha256 || !versionActual?.sha256 ? 'sin verificar' :
    original.etiqueta===versionActual.etiqueta && original.sha256===versionActual.sha256 ? 'idénticos':'distintos';
  const posterior = p ? presupuesto(p,o,f.uso) : null;
  const verificable = Boolean(sello && (sim || (o.inicio && Date.parse(sello.fecha) <= Date.parse(o.inicio))));
  const cmp = (a,b) => diferencia(verificable ? a ?? null : null,b ?? null);
  const cmpClp = (a,b) => cmp(p?.baseClp && p.baseClp===o.baseClp ? a : null,b);
  const d = gastos(o,sim);
  const recorrido = {};
  for (const k of tiempos) recorrido[k] = {...cmp(valor(p?.[k]),valor(o[k])),evidencia:clase(o[k])};
  const totalMin = r => suma(...tiempos.slice(1).map(k => valor(r?.[k])));
  recorrido.totalMin = cmp(totalMin(p),totalMin(o));
  const porPartida = {};
  for (const k of partidasDirectas) {
    const partida = d.porPartida[k];
    const ref = partida.cobertura === 'completa' ? partida.clp : null;
    porPartida[k] = {original:cmpClp(previo?.partidas[k],ref),recalculado:cmpClp(posterior?.partidas[k],ref)};
  }
  const vinculo = vincularIntervalo(o,p,f.vehiculo,ultimoAjuste);
  const kmL = vinculo.medicion?.kmL ?? null, claseComparable=vinculo.utilizable;
  const referencia=derivarReferencia(o,vinculo);
  const {desgasteKm,fijoHora}=referencia;
  for (const k of ['combustible','desgaste','gastosFijos']) {
    const ref = referencia.asignaciones[k];
    porPartida[k] = {evidencia:ref === null ? 'DATO FALTANTE' : sim ? 'SIMULADO':'ESTIMADO',
      original:cmpClp(previo?.partidas[k],ref),recalculado:cmpClp(posterior?.partidas[k],ref)};
  }
  const faltantes = {...Object.fromEntries(tiempos.map(k => [k,o[k]])), inicio:o.inicio, resolucionKm:o.resolucionKm,
    precioLitro:o.precioLitro, rendimientoComparable:claseComparable ? kmL : null, desgastePeriodo:desgasteKm, fijosPeriodo:fijoHora,
    tipoCarga:o.tipoCarga,pesoKg:o.pesoKg,ayudantes:o.ayudantes,minutosAyudantes:o.minutosAyudantes,equipo:o.equipo};
  for (const k of partidasDirectas) faltantes[k] = d.porPartida[k].cobertura === 'completa' ? d.porPartida[k].clp : null;
  if (f.uso !== 'personal') faltantes.cobrado = o.cobrado;
  if (alcancePartida(p ?? f.plan,'gastosFijos')==='excluida') delete faltantes.fijosPeriodo;
  for (const k of o.noAplica ?? []) if (p?.noAplica?.includes(k)) delete faltantes[k];
  const esperaOriginal=p ? espera(p,p) : null, esperaObservada=espera(o,p);
  const coberturaCosto=(m,e)=>!m || m.faltan.length || e.potencialClp!==0 ? 'parcial':'cubierto por el modelo';
  return {uso:f.uso,vehiculo:f.vehiculo,tipoVehiculo:f.tipoVehiculo,contexto:f.uso === 'personal' ? 'metodología personal' : sim ? 'ensayo ficticio':'observación de flete',
    estadoPresupuesto:!sello ? 'sin presupuesto previo' : verificable ? 'previo al viaje o simulación' : 'cronología sin verificar',
    fechaPresupuesto:sello?.fecha ?? null, entradasOriginales:p ?? null, presupuestoOriginal:previo, recalculado:posterior,
    versionMotorOriginal:sello?.versionMotor ?? null,
    esperaFueraDelMotor:{original:esperaOriginal,observada:esperaObservada},
    coberturaCostoEconomico:{original:coberturaCosto(previo,esperaOriginal),recalculado:coberturaCosto(posterior,esperaObservada)},
    conciliacionIndependiente:conciliar(f,sello,verificable,d,referencia,diferencia),
    recorrido, gastosDelViaje:d, comparacionClp:porPartida,
    variacionCostoModelado:{...cmp(motores==='idénticos' && previo?.tipo === 'estimado' ? previo.costoClp : null,posterior?.tipo === 'estimado' ? posterior.costoClp : null),
      motores,versionActual,uso:motores==='idénticos'?'sensibilidad al recorrido':'sin atribución exclusiva al recorrido'},
    referencias:{intervalo:vinculo,incertidumbreCombustible:referencia.incertidumbre,rendimientoMedidoIntervaloKmL:kmL,claseComparable,rendimientoKmL:{...cmp(valor(p?.kmL),claseComparable ? kmL : null),evidencia:kmL === null || !claseComparable ? 'DATO FALTANTE' : sim ? 'SIMULADO':'MEDIDO'},
      desgasteClpKm:desgasteKm, fijoClpHora:fijoHora,litrosAsignadosEstimados:referencia.litros,
      precioLitro:o.precioLitro,fuentePrecio:o.fuentePrecio},
    precios:f.uso === 'personal' ? null : {sugerido:previo?.sugeridoClp ?? null,cotizado:p?.cotizado ?? null,cobrado:o.cobrado,
      cotizadoVsCobrado:cmp(valor(p?.cotizado),valor(o.cobrado))},
    observacion:o, completitud:{plan:p ? cobertura(p) : null, observacion:cobertura(faltantes)} };
}
