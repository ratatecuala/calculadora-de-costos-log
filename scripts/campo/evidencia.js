export const tiempos = ['km', 'marchaMin', 'esperaMin', 'cargaMin', 'descargaMin'];
export const partidasDirectas = ['peajes', 'ayudantes', 'otros'];
const clases = ['MEDIDO', 'COMPROBADO', 'DECLARADO', 'ESTIMADO', 'SIMULADO'];
export const valor = dato => dato?.[0] ?? null;
export const clase = dato => dato?.[1] ?? 'DATO FALTANTE';

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function campos(obj, nombres) {
  exigir(obj && typeof obj === 'object' && !Array.isArray(obj)
    && Object.keys(obj).length === nombres.length
    && nombres.every(k => Object.hasOwn(obj, k)), 'Campos incorrectos. Revisa la plantilla y elimina texto personal.');
}

function opcion(v, opciones, nombre) {
  exigir(opciones.includes(v), 'Opci�n inv�lida en ' + nombre);
}

function numero(v, nombre) {
  exigir(typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER, 'N�mero inv�lido en ' + nombre);
}

function dato(d, nombre, sim, permitidas = clases) {
  if (d === null) return;
  exigir(Array.isArray(d) && d.length === 2, 'Usa [valor, evidencia] o null en ' + nombre);
  numero(d[0], nombre);
  opcion(d[1], sim ? ['SIMULADO'] : permitidas.filter(c => c !== 'SIMULADO'), nombre);
  if (['ayudantes','cobrado','cotizado'].includes(nombre)) exigir(Number.isSafeInteger(d[0]), 'Se requiere un entero en ' + nombre);
}

const fuentes = ['boleta', 'surtidor', 'referencia_publicada', 'declaracion', 'supuesto'];
function precio(p, sim) {
  if (!p.precioLitro) return opcion(p.fuentePrecio, [null], 'fuentePrecio');
  opcion(p.fuentePrecio, fuentes, 'fuentePrecio');
  const evidencia = {boleta:'COMPROBADO', surtidor:'MEDIDO', referencia_publicada:'ESTIMADO', declaracion:'DECLARADO', supuesto:'ESTIMADO'};
  opcion(clase(p.precioLitro), [sim ? 'SIMULADO' : evidencia[p.fuentePrecio]], 'evidencia del precio');
}

export function validarContexto(f) {
  campos(f, ['uso','vehiculo','tipoVehiculo','plan','observacion']);
  opcion(f.uso, ['personal','flete_real','simulacion'], 'uso');
  exigir(typeof f.vehiculo === 'string' && /^veh-\d{3,8}$/.test(f.vehiculo), 'Usa un c�digo veh-001');
  opcion(f.tipoVehiculo, ['auto','camioneta','furgon','camion_liviano','otro'], 'tipoVehiculo');
}

export function validarPlan(p, sim) {
  const numeros = [...tiempos,'kmL','precioLitro','desgasteKm','fijoHora','trabajoHora','ayudantes','pagoAyudante','tag','otros','margenPct','recargos','cotizado'];
  campos(p, [...numeros,'fuentePrecio']);
  for (const k of numeros) dato(p[k], k, sim);
  precio(p, sim);
  exigir(p.kmL === null || valor(p.kmL) > 0, 'El rendimiento debe ser positivo');
  exigir(p.margenPct === null || valor(p.margenPct) <= 80, 'Margen fuera del rango del motor');
}

function validarIntervalo(i, sim) {
  campos(i, ['vehiculo','recorrido','carga','aire','registroCompleto','recargas']);
  exigir(/^veh-\d{3,8}$/.test(i.vehiculo), 'Veh�culo de intervalo inv�lido');
  opcion(i.recorrido, [null,'urbano','autopista','mixto'], 'recorrido');
  opcion(i.carga, [null,'sin','parcial','completa'], 'nivel de carga');
  opcion(i.aire,[null,true,false],'aire');
  opcion(i.registroCompleto,[null,true,false],'registroCompleto');
  exigir(Array.isArray(i.recargas), 'Lista de recargas inv�lida');
  let anterior = null;
  let fechaAnterior = null;
  for (const r of i.recargas) {
    campos(r, ['fecha','lleno','odometro','litros']);
    if (r.fecha !== null) {
      exigir(typeof r.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha)
        && Number.isFinite(Date.parse(r.fecha)) && new Date(r.fecha).toISOString().slice(0,10) === r.fecha
        && (fechaAnterior === null || r.fecha >= fechaAnterior),'Fecha de recarga inv�lida o fuera de orden');
      fechaAnterior = r.fecha;
    }
    opcion(r.lleno,[true,false],'lleno');
    dato(r.odometro,'odometro',sim,['MEDIDO','COMPROBADO']);
    dato(r.litros,'litros',sim,['MEDIDO','COMPROBADO']);
    if (r.odometro && anterior !== null) exigir(valor(r.odometro) >= anterior,'Od�metros fuera de orden');
    if (r.odometro) anterior = valor(r.odometro);
    exigir(!r.litros || valor(r.litros) > 0,'Litros deben ser positivos');
  }
  exigir(!i.recargas.slice(1,-1).some(r=>r.lleno),'Separa los intervalos en cada llenado completo');
}

export function validarObservacion(o, sim, vehiculo) {
  const numeros = [...tiempos,'resolucionKm','pesoKg','ayudantes','minutosAyudantes','precioLitro','cobrado'];
  campos(o,[...numeros,'inicio','tipoCarga','recorrido','nivelCarga','aire','equipo','fuentePrecio','cobertura','comprobantes','intervalo','mantencion','fijos']);
  opcion(o.recorrido,[null,'urbano','autopista','mixto'],'recorrido');
  opcion(o.nivelCarga,[null,'sin','parcial','completa'],'nivelCarga');
  opcion(o.aire,[null,true,false],'aire');
  for (const k of numeros) dato(o[k], k, sim, k === 'precioLitro' ? clases : ['MEDIDO','COMPROBADO','DECLARADO',...(k === 'pesoKg' ? ['ESTIMADO'] : [])]);
  if (o.inicio !== null) exigir(typeof o.inicio === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d{3})?)?(Z|[+-]\d\d:\d\d)$/.test(o.inicio) && Number.isFinite(Date.parse(o.inicio)), 'Inicio inv�lido. Incluye fecha, hora y zona.');
  opcion(o.tipoCarga,[null,'sin','muebles','mudanza','paquetes','materiales','otra'],'tipoCarga');
  opcion(o.equipo,[null,'ninguno','carro','rampa','elevador','varios','otro'],'equipo');
  precio(o,sim);
  campos(o.cobertura, partidasDirectas);
  for (const k of partidasDirectas) opcion(o.cobertura[k],[null,'parcial','completa'], 'cobertura');
  exigir(Array.isArray(o.comprobantes),'Lista de comprobantes inv�lida');
  const refs = new Set();
  for (const r of o.comprobantes) {
    campos(r,['ref','partida','clp']);
    exigir(typeof r.ref === 'string' && /^doc-\d{3,8}-\d{2,4}$/.test(r.ref) && !refs.has(r.ref),'L�nea de comprobante inv�lida o repetida');
    refs.add(r.ref);
    opcion(r.partida,partidasDirectas,'partida de comprobante');
    exigir(Number.isSafeInteger(r.clp) && r.clp >= 0,'Monto de comprobante inv�lido');
  }
  for (const k of partidasDirectas) {
    exigir(o.cobertura[k] !== 'completa' || o.comprobantes.some(r => r.partida === k),'Una partida completa exige respaldo, incluso para cero');
  }
  if (o.intervalo !== null) {
    validarIntervalo(o.intervalo,sim);
    exigir(o.intervalo.vehiculo === vehiculo,'El intervalo corresponde a otro veh�culo');
  }
  for (const [k,base] of [['mantencion','kmPeriodo'],['fijos','horasProductivas']]) {
    const h = o[k];
    if (h === null) continue;
    campos(h,['periodo','gastoClp',base]);
    exigir(/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(h.periodo), 'Usa dos fechas para el periodo');
    const [a,b] = h.periodo.split('/');
    exigir([a,b].every(x => Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10) === x) && a <= b, 'Periodo inv�lido');
    dato(h.gastoClp,'gastoClp',sim,['COMPROBADO','DECLARADO']);
    dato(h[base],base,sim,['MEDIDO','COMPROBADO','DECLARADO']);
  }
}
