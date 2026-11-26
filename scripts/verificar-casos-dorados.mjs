#!/usr/bin/env node
/**
 * Verificación INDEPENDIENTE de los casos dorados G1–G10 y de los escenarios A, B y C
 * de docs/03-motor-de-costos.md (#24). Ver docs/15-validacion-motor.md.
 *
 * - NO importa nada de src/: recalcula desde las definiciones escritas en docs/03.
 * - Usa aritmética racional exacta (BigInt), sin coma flotante, para que el resultado
 *   no dependa de errores de redondeo binario.
 * - Compara cada resultado con el valor que la documentación declara como esperado y
 *   termina con código 1 si alguno no coincide.
 *
 * Uso: node scripts/verificar-casos-dorados.mjs
 * Sin red, sin credenciales, sin dependencias.
 */

// ---------- Racionales exactos ----------
const gcd = (a, b) => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
class Q {
  constructor(n, d = 1n) {
    n = BigInt(n);
    d = BigInt(d);
    if (d === 0n) throw new Error('división por cero');
    if (d < 0n) [n, d] = [-n, -d];
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }
  /** Acepta enteros o textos decimales («57.4», «0.15»). */
  static of(x) {
    if (x instanceof Q) return x;
    const s = String(x);
    if (!s.includes('.')) return new Q(BigInt(s));
    const [i, f] = s.split('.');
    const sign = i.startsWith('-') ? -1n : 1n;
    const scale = 10n ** BigInt(f.length);
    return new Q(sign * (BigInt(i.replace('-', '')) * scale + BigInt(f)), scale);
  }
  add(o) { o = Q.of(o); return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Q.of(o); return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Q.of(o); return new Q(this.n * o.n, this.d * o.d); }
  div(o) { o = Q.of(o); return new Q(this.n * o.d, this.d * o.n); }
  cmp(o) { o = Q.of(o); const l = this.n * o.d; const r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
  floor() { const q = this.n / this.d; return this.n < 0n && q * this.d !== this.n ? q - 1n : q; }
  ceil() { const q = this.n / this.d; return this.n > 0n && q * this.d !== this.n ? q + 1n : q; }
  /** Al entero más cercano; las mitades hacia arriba. */
  roundHalfUp() { return this.add(new Q(1n, 2n)).floor(); }
  toDecimal(digits = 1) {
    const scale = 10n ** BigInt(digits);
    const v = this.mul(new Q(scale)).roundHalfUp();
    const sign = v < 0n ? '-' : '';
    const a = v < 0n ? -v : v;
    const i = a / scale;
    const f = (a % scale).toString().padStart(digits, '0');
    return `${sign}${i}${digits ? ',' + f : ''}`;
  }
}
const q = (x) => Q.of(x);
const sum = (...xs) => xs.reduce((s, x) => s.add(x), q(0));
const ceilTo1000 = (x) => q(x).div(1000).ceil() * 1000n;

// ---------- Definiciones de docs/03 ----------
/** §2 (4) y §3C: ⌈C/(1 − m) + recargos⌉₁₀₀₀ */
const suggested = (C, m, surcharges = 0) => ceilTo1000(q(C).div(q(1).sub(m)).add(surcharges));
const unrounded = (C, m, surcharges = 0) => q(C).div(q(1).sub(m)).add(surcharges);

const results = [];
function check(caseId, what, docExpected, computed) {
  const ok = String(docExpected) === String(computed);
  results.push({ caseId, what, docExpected: String(docExpected), computed: String(computed), ok });
}

// Partidas del ejemplo v4 (ruta con autopista)
const v4 = { combustible: 5023, peajes: 4200, ayudantes: 15000, desgaste: 1779, gastosFijos: 3350, remuneracion: 13400 };
const P = 55000;
const m15 = '0.15';

// G1 — completo
{
  const D = sum(v4.combustible, v4.peajes, v4.ayudantes);
  const W = q(v4.desgaste);
  const CF = q(v4.gastosFijos);
  const R = q(v4.remuneracion);
  const C = sum(D, W, CF, R);
  check('G1', 'D', 24223, D.floor());
  check('G1', 'C', 42752, C.floor());
  check('G1', 'C/(1−m) sin redondear', '50296,5', unrounded(C, m15).toDecimal(1));
  check('G1', 'sugerido', 51000, suggested(C, m15));
  check('G1', 'P − D', 30777, q(P).sub(D).roundHalfUp());
  check('G1', 'P − D − W − CF', 25648, q(P).sub(D).sub(W).sub(CF).roundHalfUp());
  check('G1', 'P − C', 12248, q(P).sub(C).roundHalfUp());
}
// G2
check('G2', 'C/(1−m) sin redondear', '51998,8', unrounded(44199, m15).toDecimal(1));
check('G2', 'sugerido', 52000, suggested(44199, m15));
// G3 — faltan peajes y CF: K = conocido
{
  const Dk = sum(v4.combustible, v4.ayudantes);
  const K = sum(Dk, v4.desgaste, v4.remuneracion);
  check('G3', 'K (cota inferior, piso)', 35202, K.floor());
  check('G3', 'K/(1−m) sin redondear', '41414,1', unrounded(K, m15).toDecimal(1));
  check('G3', 'precio «al menos»', 42000, suggested(K, m15));
  check('G3', 'P − D_conocido (cota sup., techo)', 34977, q(P).sub(Dk).ceil());
  check('G3', 'P − D − W (cota sup., techo)', 33198, q(P).sub(Dk).sub(v4.desgaste).ceil());
  check('G3', 'P − K (cota sup., techo)', 19798, q(P).sub(K).ceil());
}
// G4 — falta solo CF
{
  const D = sum(v4.combustible, v4.peajes, v4.ayudantes);
  const K = sum(D, v4.desgaste, v4.remuneracion);
  check('G4', 'K (cota inferior, piso)', 39402, K.floor());
  check('G4', 'precio «al menos»', 47000, suggested(K, m15));
  check('G4', 'P − D (estimado)', 30777, q(P).sub(D).roundHalfUp());
  check('G4', 'P − D − W (cota sup., techo)', 28998, q(P).sub(D).sub(v4.desgaste).ceil());
  check('G4', 'P − K (cota sup., techo)', 15598, q(P).sub(K).ceil());
}
// G5 — X (autopista) sin peajes conocidos; Y (sin peajes) completa
{
  const KX = sum(v4.combustible, v4.ayudantes, v4.desgaste, v4.gastosFijos, v4.remuneracion);
  const CY = q(44199);
  check('G5', 'K_X', 38552, KX.floor());
  check('G5', 'umbral ⌊C_Y − K_X⌋', 5647, CY.sub(KX).floor());
  const verdict = (t) => {
    const c = KX.add(t).cmp(CY);
    return c < 0 ? 'autopista' : c > 0 ? 'sin peajes' : 'empate';
  };
  check('G5', 'peajes 4.200', 'autopista', verdict(4200));
  check('G5', 'peajes 6.000', 'sin peajes', verdict(6000));
  check('G5', 'peajes 5.647', 'empate', verdict(5647));
}
// G6 — combustible desconocido en ambas rutas (tarifa común por km)
{
  const kX = q(37729); // autopista: más costo conocido, menos km
  const kY = q(36931);
  const kmX = q('57.4');
  const kmY = q('62.3');
  // C_X − C_Y = (kX − kY) + r·(kmX − kmY); se anula en r* = (kX − kY)/(kmY − kmX)
  const r = kX.sub(kY).div(kmY.sub(kmX));
  check('G6', 'diferencia conocida', 798, kX.sub(kY).floor());
  check('G6', 'diferencia de km', '4,9', kmY.sub(kmX).toDecimal(1));
  check('G6', 'umbral $/km', '162,9', r.toDecimal(1));
  check('G6', 'umbral exacto (798/4,9 reducido)', '1140/7', `${r.n}/${r.d}`);
  check('G6', 'conviene si la tarifa supera el umbral', 'autopista', kmX.cmp(kmY) < 0 ? 'autopista' : 'sin peajes');
}
// G7 — redondeo de cotas
check('G7', 'cota inferior 35.201,6 → piso', 35201, q('35201.6').floor());
check('G7', 'cota superior 34.977,4 → techo', 34978, q('34977.4').ceil());
check('G7', 'umbral 5.647,4 → piso', 5647, q('5647.4').floor());
// G8 — IVA con regla verificada al 19 % (solo aritmética; la política es de #16)
{
  const tax = q(55000).mul('0.19').roundHalfUp();
  check('G8', 'IVA', 10450, tax);
  check('G8', 'total', 65450, 55000n + tax);
  check('G8', 'sin perfil: total = neto', 55000, 55000);
}
// G9 — montos internos que no deben aparecer en la cotización del cliente (lista derivada de G1)
check('G9', 'montos internos de G1', '24223,1779,3350,13400,42752,51000', [24223, 1779, 3350, 13400, 42752, 51000].join(','));
// G10 — solo A → B (13,2 km, 20 min de conducción, 60 min de carga y descarga, 6.000 $/h, 1.500 $/h)
{
  const H = q(20 + 60).div(60);
  check('G10', 'H (horas)', '1,3', H.toDecimal(1));
  check('G10', 'R = 6.000 · H', 8000, q(6000).mul(H).roundHalfUp());
  check('G10', 'CF = 1.500 · H', 2000, q(1500).mul(H).roundHalfUp());
}
// Escenario A (§4)
{
  const fuel = q(80).div(10).mul(1000);
  const D = sum(fuel, 3000, 15000, 2000, 3000);
  const ckm = sum(q(400000).div(50000), q(80000).div(10000), q(300000).div(20000));
  const W = ckm.mul(80);
  const CF = q(1800000).div(1200).mul(3);
  const R = q(6000).mul(3);
  const C = sum(D, W, CF, R);
  check('Esc. A', 'combustible', 8000, fuel.floor());
  check('Esc. A', 'D', 31000, D.floor());
  check('Esc. A', 'c_km', 31, ckm.floor());
  check('Esc. A', 'W', 2480, W.floor());
  check('Esc. A', 'CF', 4500, CF.floor());
  check('Esc. A', 'C', 55980, C.floor());
  check('Esc. A', 'C/0,9', '62200,0', unrounded(C, '0.1').toDecimal(1));
  check('Esc. A', 'sugerido', 63000, suggested(C, '0.1'));
  check('Esc. A', 'P − D', 29000, q(60000).sub(D).roundHalfUp());
  check('Esc. A', 'P − D − W − CF', 22020, q(60000).sub(D).sub(W).sub(CF).roundHalfUp());
  check('Esc. A', 'por hora', 7340, q(60000).sub(D).sub(W).sub(CF).div(3).roundHalfUp());
  check('Esc. A', 'P − C', 4020, q(60000).sub(C).roundHalfUp());
}
// Escenario B (§4)
{
  const C = sum(56000, 2480, 4500, 3000);
  check('Esc. B', 'C', 65980, C.floor());
  check('Esc. B', 'C/0,9', '73311,1', unrounded(C, '0.1').toDecimal(1));
  check('Esc. B', 'sugerido', 74000, suggested(C, '0.1'));
  check('Esc. B', 'P − D', 4000, q(60000).sub(56000).roundHalfUp());
  check('Esc. B', 'falta para cubrir W + CF + R', 5980, q(2480 + 4500 + 3000).sub(4000).roundHalfUp());
}
// Escenario C y pruebas T1–T3 (FUERA DE V1: solo se revisa la aritmética del documento)
{
  // Sin redondeos intermedios (§3): el combustible exacto es 8.888,9; se redondea solo al mostrar.
  const fuel = q(80).div(9).mul(1000);
  const A = sum(fuel, 3000, 2480, 2000);
  check('Esc. C', 'combustible 80/9 L × 1.000', 8889, fuel.roundHalfUp());
  check('Esc. C', 'A', 16369, A.roundHalfUp());
  check('Esc. C', 'Δ sin trabajo alternativo', -28631, A.sub(45000).roundHalfUp());
  check('Esc. C', 'Δ con B = 30.000', 1369, A.add(30000).sub(45000).roundHalfUp());
  check('T1', 'Δ con G = 7.000', -5631, A.add(30000).sub(45000 + 7000).roundHalfUp());
  check('T2', 'Δ correcto', -13631, A.sub(30000).roundHalfUp());
  check('T3', 'Δ con B neto 18.000', -10631, A.add(18000).sub(45000).roundHalfUp());
}

// ---------- Informe ----------
const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
console.log(pad('Caso', 8) + pad('Medida', 40) + pad('docs/03', 36) + pad('Recalculado', 36) + 'Coincide');
for (const r of results) {
  console.log(pad(r.caseId, 8) + pad(r.what, 40) + pad(r.docExpected, 36) + pad(r.computed, 36) + (r.ok ? 'sí' : 'NO'));
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} coinciden con docs/03.`);
process.exit(bad.length === 0 ? 0 : 1);
