export function seguro(n) {
  if (n !== null && (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER))
    throw new Error('Resultado fuera de rango; revisa las unidades y denominadores.');
  return n;
}
export function sumar(xs) {
  return xs.includes(null) ? null : seguro(xs.reduce((a,b)=>a+b,0));
}
export const producto = (a,b) => a === null || b === null ? null : seguro(a*b);
export const dividir = (n,d) => n === null || !(d > 0) ? null : seguro(n/d);
