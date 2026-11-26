export const directas = ['peajes','ayudantes','otros'];
export function validarNoAplica(lista, valores) {
  if (lista===undefined) return;
  if (!Array.isArray(lista) || new Set(lista).size!==lista.length ||
      lista.some(k=>!directas.includes(k) || valores[k])) throw new Error('Partidas no aplicables contradictorias o repetidas.');
}
export function alcancePartida(plan,k) {
  if (plan?.modalidad==='simplificada' && k==='gastosFijos') return 'excluida';
  if (plan?.noAplica?.includes(k)) return 'no aplicable';
  return 'incluida';
}
