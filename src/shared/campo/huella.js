// Los envelopes v1/v2 mantienen el orden de su JSON histórico. Desde v3 el
// orden de propiedades no afecta a la huella. Las secuencias sí conservan orden.
export function serializarCanonico(x) {
  if (x===null || ['string','boolean'].includes(typeof x)) return JSON.stringify(x);
  if (typeof x==='number' && Number.isFinite(x)) return JSON.stringify(x);
  if (Array.isArray(x)) return '['+Array.from(x,serializarCanonico).join(',')+']';
  if (typeof x==='object' && Object.getPrototypeOf(x)===Object.prototype) {
    return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+serializarCanonico(x[k])).join(',')+'}';
  }
  throw new Error('La huella requiere valores JSON válidos.');
}
export function textoOriginal(datos) {
  return datos.version===3 ? serializarCanonico(datos) : JSON.stringify(datos);
}
export async function sha256Texto(texto) {
  const bytes=new TextEncoder().encode(texto);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
export const huellaCanonica = datos=>sha256Texto(serializarCanonico(datos));
export async function envolverOriginal(datos) {
  const copia=structuredClone(datos);
  return {datos:copia,sha256:await sha256Texto(textoOriginal(copia))};
}
export const VERSION_MOTOR=Object.freeze({etiqueta:'motor-1.0.1',sha256:'5743dc911be5b04764a5686b706924fd706870f9f991584c1e6f501688f24677'});
