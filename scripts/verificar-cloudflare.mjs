/**
 * Verificación en CLOUDFLARE REAL (Worker + Durable Object) con el proveedor SIMULADO.
 * Nunca usa Google. Mide cada caso con el contador real (GET /api/admin/routes).
 *
 *   STAGING_URL=https://<worker>.workers.dev STAGING_SECRETS_FILE=/fuera/del/repo/cf_secrets.json \
 *   node scripts/verificar-cloudflare.mjs principal     # casos 1–5 y concurrencia
 *   node scripts/verificar-cloudflare.mjs falla         # con STAGING_FAULT_COUNTER=true desplegado
 *
 * Límites reales en juego (no se modifican): 20 rutas/día por usuario, 40/día por origen,
 * 3 comparaciones/día y 10/mes por usuario, objetivo 7.000 y corte 8.000 al mes.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const BASE = process.env.STAGING_URL;
const secrets = JSON.parse(readFileSync(process.env.STAGING_SECRETS_FILE, 'utf8'));
const mode = process.argv[2] ?? 'principal';
const basic = `Basic ${Buffer.from(secrets.STAGING_BASIC_AUTH).toString('base64')}`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function admin(method = 'GET', body) {
  const res = await fetch(`${BASE}/api/admin/routes`, {
    method,
    headers: { Authorization: `Bearer ${secrets.ADMIN_TOKEN}`, 'X-Staging-Auth': secrets.STAGING_BASIC_AUTH, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`admin ${method} → ${res.status}`);
  return res.json();
}
const used = async () => (await admin()).globalUsed;
const client = () => `verif-${randomUUID()}`;

async function route(clientId, body) {
  const res = await fetch(`${BASE}/api/route`, {
    method: 'POST',
    headers: { Authorization: basic, 'X-Client-Id': clientId, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { http: res.status, json: await res.json() };
}
const A = 'Calle Uno 123, Ñuñoa';
const dest = (s) => `Pasaje ${s} 100, Maipú`;

if (mode === 'falla') {
  // Caso 6: el Durable Object real responde caído → cierre, sin consultar al proveedor.
  const r = await route(client(), { origin: A, destination: dest('falla') });
  check('contador caído → modo manual «contador_no_disponible» (503)', r.http === 503 && r.json.reason === 'contador_no_disponible', JSON.stringify(r.json).slice(0, 120));
  check('no se devuelve ninguna ruta (el proveedor no se consultó)', !('route' in r.json));
} else {
  // Interruptor encendido al empezar.
  await admin('POST', { enabled: true });
  const s0 = await admin();
  console.log(`Estado inicial: ${JSON.stringify(s0)}`);
  check('políticas vigentes: objetivo 7.000 y corte 8.000', s0.operationalMonthly === 7000 && s0.emergencyMonthly === 8000);

  // 1. Una solicitud reserva exactamente 1.
  let before = await used();
  let r = await route(client(), { origin: A, destination: dest(`uno-${Date.now()}`) });
  let after = await used();
  check('1. una solicitud se calcula y reserva exactamente 1', r.json.status === 'ok' && after - before === 1, `Δ=${after - before}`);

  // 2. Un reintento consume otra reserva.
  before = await used();
  r = await route(client(), { origin: `${A} [prueba:falla]`, destination: dest(`reintento-${Date.now()}`) });
  after = await used();
  check('2. falla reintentable: el reintento consume otra reserva (Δ=2)', r.json.reason === 'error_proveedor' && after - before === 2, `Δ=${after - before}`);

  // 3. Apagado: ninguna reserva nueva, ni rutas ni comparaciones.
  await admin('POST', { enabled: false });
  before = await used();
  const off1 = await route(client(), { origin: A, destination: dest(`apagado-${Date.now()}`) });
  const off2 = await route(client(), { origin: A, destination: dest(`apagado2-${Date.now()}`), kind: 'evitarPeajes' });
  after = await used();
  check(
    '3. con el servicio apagado no hay reservas (rutas ni comparaciones)',
    off1.json.reason === 'servicio_apagado' && off2.json.reason === 'servicio_apagado' && off1.http === 503 && after === before,
    `Δ=${after - before}`,
  );
  await admin('POST', { enabled: true });

  // 4. Reintento bloqueado: se apaga mientras el proveedor «demora» y luego falla.
  before = await used();
  const pending = route(client(), { origin: `${A} [prueba:falla-lenta]`, destination: dest(`lento-${Date.now()}`) });
  await new Promise((res) => setTimeout(res, 1500));
  await admin('POST', { enabled: false });
  r = await pending;
  after = await used();
  await admin('POST', { enabled: true });
  check('4. apagar durante la consulta bloquea el reintento (solo la reserva inicial, Δ=1)', r.json.reason === 'servicio_apagado' && after - before === 1, `Δ=${after - before}, ${r.json.reason}`);

  // 5. Comparaciones: 3 por día por usuario.
  const cmpClient = client();
  before = await used();
  const cmp = [];
  for (let i = 0; i < 4; i += 1) cmp.push((await route(cmpClient, { origin: A, destination: dest(`cmp-${i}-${Date.now()}`), kind: 'evitarPeajes' })).json);
  after = await used();
  const okCmp = cmp.filter((c) => c.status === 'ok').length;
  check(
    '5. comparaciones: 3 al día; la cuarta se rechaza sin reservar',
    okCmp === 3 && cmp[3].reason === 'limite_comparaciones' && after - before === 3,
    `ok=${okCmp}, Δ=${after - before}`,
  );

  // 6. Concurrencia: 30 solicitudes SIMULTÁNEAS del mismo usuario (límite 20/día).
  const conc = client();
  before = await used();
  const all = await Promise.all(Array.from({ length: 30 }, (_, i) => route(conc, { origin: A, destination: dest(`conc-${i}-${Date.now()}`) })));
  after = await used();
  const ok = all.filter((x) => x.json.status === 'ok').length;
  const denied = all.filter((x) => x.json.reason === 'limite_usuario').length;
  const failed = all.filter((x) => x.json.reason === 'contador_no_disponible').length;
  check(
    '6. 30 simultáneas: nunca más de 20 autorizadas y el contador suma exactamente las autorizadas',
    ok <= 20 && after - before === ok && ok + denied + failed === 30,
    `autorizadas=${ok}, rechazadas por límite=${denied}, contador caído=${failed}, Δ=${after - before}`,
  );

  const s1 = await admin();
  console.log(`Estado final: ${JSON.stringify(s1)}`);
  check('el servicio queda encendido al terminar', s1.enabled === true);
}

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} verificaciones correctas`);
process.exit(bad.length ? 1 : 0);
