/**
 * Verificación REAL de RLS contra un proyecto Supabase (staging), con dos usuarios y un
 * visitante anónimo. No usa claves privilegiadas: solo la clave publicable y sesiones reales.
 *
 * Uso (sin secretos en el repositorio):
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
 *   TEST_USERS_FILE=/ruta/fuera/del/repo/test_users.json \
 *   node scripts/verificar-rls.mjs
 *
 * test_users.json: {"a":{"email","password"},"b":{"email","password"}} (usuarios de prueba).
 * El script crea datos de prueba del usuario A, intenta leerlos/modificarlos/borrarlos como B
 * y como anónimo, verifica el enlace público, y al final A borra sus datos de prueba.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const users = JSON.parse(readFileSync(process.env.TEST_USERS_FILE, 'utf8'));
if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function login(u) {
  const c = createClient(url, key, opts);
  const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(`No se pudo iniciar sesión: ${error.message}`);
  return { c, id: data.user.id };
}

const A = await login(users.a);
const B = await login(users.b);
const anon = createClient(url, key, opts);
check('dos sesiones reales distintas', A.id !== B.id);

// ---------- Datos de A ----------
const marker = `rls-${Date.now()}`;
// Número libre y alto para la fila de prueba (la numeración es única por cuenta, A-47).
const testNumber = 900000 + Math.floor(Math.random() * 90000);
// No modifica datos existentes: el perfil de A solo se crea si todavía no existe.
const { data: existingProfile } = await A.c.from('profiles').select('id').eq('id', A.id).maybeSingle();
if (!existingProfile) await A.c.from('profiles').insert({ id: A.id, business_name: `Negocio A ${marker}` });
// El script marca un vehículo temporal como predeterminado (eso desmarca los demás de A).
// Se guarda el predeterminado original y se restaura SIEMPRE al final, aunque la prueba falle.
const { data: defaultsBefore } = await A.c.from('vehicles').select('id').eq('is_default', true);
const originalDefault = defaultsBefore?.[0]?.id ?? null;
let veh = null;
let job = null;
try {
const { data: vehRow, error: vehErr } = await A.c
  .from('vehicles')
  .insert({ name: `Vehículo RLS ${marker}`, type: 'camioneta', fuel: 'gasolina', km_per_l: 11, wear_per_km: 40 })
  .select()
  .single();
veh = vehRow;
check('A crea un vehículo', !vehErr && veh?.owner_id === A.id, vehErr?.message);
const { error: defErr } = await A.c.rpc('set_default_vehicle', { p_vehicle_id: veh.id });
check('A marca su vehículo como predeterminado', !defErr, defErr?.message);

const internal = { costEstimate: 41234, costType: 'estimado', margin: 0.15, engineVersion: 'motor-1.0.1', vehicle: { kmPerL: 11, wearPerKm: 40 } };
const { data: jobRow, error: jobErr } = await A.c
  .from('jobs')
  .insert({ number: testNumber, issued_number: testNumber, quote_date: '2026-11-18', client_name: `Cliente ${marker}`, net_price: 60000, internal, waypoints: [] })
  .select()
  .single();
job = jobRow;
check('A crea un trabajo con costos internos', !jobErr && job?.owner_id === A.id, jobErr?.message);
const { data: cq, error: cqErr } = await A.c
  .from('client_quotes')
  .insert({ job_id: job.id, number: testNumber, issued_at: '2026-11-18', client_name: `Cliente ${marker}`, net_price: 60000, total: 60000 })
  .select()
  .single();
check('A crea la cotización al cliente', !cqErr, cqErr?.message);
const { data: token, error: shareErr } = await A.c.rpc('create_quote_share', { p_quote_id: cq.id });
check('A crea un enlace público (token de 43 caracteres)', !shareErr && /^[A-Za-z0-9_-]{43}$/.test(token ?? ''), shareErr?.message);

// ---------- B intenta acceder a lo de A ----------
for (const table of ['profiles', 'vehicles', 'jobs', 'client_quotes', 'quote_shares']) {
  const col = table === 'profiles' ? 'id' : 'owner_id';
  const { data, error } = await B.c.from(table).select('id').eq(col, A.id);
  check(`B no LEE ${table} de A`, !error && data.length === 0, error?.message ?? `${data?.length} filas`);
}
const { data: bJobById } = await B.c.from('jobs').select('id').eq('id', job.id);
check('B no lee el trabajo de A ni sabiendo su id', bJobById.length === 0);

const upd = async (table, id, patch) => (await B.c.from(table).update(patch).eq('id', id).select('id')).data ?? [];
check('B no MODIFICA el vehículo de A', (await upd('vehicles', veh.id, { name: 'hackeado' })).length === 0);
check('B no MODIFICA el trabajo de A', (await upd('jobs', job.id, { status: 'rechazada' })).length === 0);
check('B no MODIFICA la cotización de A', (await upd('client_quotes', cq.id, { client_name: 'x' })).length === 0);
check('B no MODIFICA el perfil de A', (await upd('profiles', A.id, { business_name: 'x' })).length === 0);

const del = async (table, id) => (await B.c.from(table).delete().eq('id', id).select('id')).data ?? [];
check('B no BORRA el vehículo de A', (await del('vehicles', veh.id)).length === 0);
check('B no BORRA el trabajo de A', (await del('jobs', job.id)).length === 0);
check('B no BORRA la cotización de A', (await del('client_quotes', cq.id)).length === 0);

const { error: insForeign } = await B.c.from('jobs').insert({ owner_id: A.id, number: 9, issued_number: 9, quote_date: '2026-11-18', client_name: 'x', net_price: 1, internal: {} });
check('B no INSERTA filas a nombre de A', !!insForeign, insForeign?.message);
const { error: cqForeign } = await B.c.from('client_quotes').insert({ job_id: job.id, number: 9, issued_at: '2026-11-18', client_name: 'x', net_price: 1, total: 1 });
check('B no cuelga una cotización del trabajo de A', !!cqForeign, cqForeign?.message);
const { error: shareForeign } = await B.c.rpc('create_quote_share', { p_quote_id: cq.id });
check('B no crea enlaces para la cotización de A', !!shareForeign, shareForeign?.message);
const { error: defForeign } = await B.c.rpc('set_default_vehicle', { p_vehicle_id: veh.id });
check('B no cambia el predeterminado de A', !!defForeign, defForeign?.message);

// ---------- Anónimo ----------
for (const table of ['profiles', 'vehicles', 'jobs', 'client_quotes', 'quote_shares']) {
  const { data, error } = await anon.from(table).select('*').limit(1);
  check(`anónimo no accede a ${table}`, !!error || (data?.length ?? 0) === 0, error?.message ?? `${data?.length} filas`);
}
const { error: hashErr } = await A.c.from('quote_shares').select('token_hash').limit(1);
check('ni el dueño puede leer el hash del token', !!hashErr, hashErr?.message);

// ---------- Enlace público ----------
const ALLOWED = [
  'number', 'issued_at', 'business_name', 'business_phone', 'business_email', 'client_name', 'service_description',
  'includes', 'conditions', 'valid_until', 'service_date', 'origin_label', 'destination_label', 'net_price', 'tax_amount', 'total',
];
const { data: pub, error: pubErr } = await anon.rpc('get_public_quote', { p_token: token });
const row = pub?.[0];
check('anónimo ve la cotización con un token válido', !pubErr && row?.client_name === `Cliente ${marker}`, pubErr?.message);
const keys = Object.keys(row ?? {}).sort();
check('el enlace devuelve SOLO campos autorizados', JSON.stringify(keys) === JSON.stringify([...ALLOWED].sort()), keys.join(','));
const text = JSON.stringify(pub);
check('el enlace no revela costos internos', !/41234|margin|costEstimate|kmPerL|wear|engineVersion/i.test(text));
const { data: bad } = await anon.rpc('get_public_quote', { p_token: 'x'.repeat(43) });
check('un token inventado no devuelve nada', (bad ?? []).length === 0);
const { data: shares } = await A.c.from('quote_shares').select('id').eq('quote_id', cq.id);
const { error: revErrB } = await B.c.rpc('revoke_quote_share', { p_share_id: shares[0].id });
check('B no puede revocar el enlace de A', !!revErrB, revErrB?.message);
const { error: revErr } = await A.c.rpc('revoke_quote_share', { p_share_id: shares[0].id });
const { data: afterRevoke } = await anon.rpc('get_public_quote', { p_token: token });
check('tras revocar, el enlace deja de funcionar', !revErr && (afterRevoke ?? []).length === 0, revErr?.message);
const past = new Date(Date.now() - 1000).toISOString();
const { error: expErr } = await A.c.rpc('create_quote_share', { p_quote_id: cq.id, p_expires_at: past });
check('no se aceptan expiraciones en el pasado', !!expErr);

// ---------- Limpieza: A borra sus datos de prueba (prueba DELETE del dueño) ----------
const { data: delJob } = await A.c.from('jobs').delete().eq('id', job.id).select('id');
check('A puede borrar su trabajo (y en cascada su cotización y enlaces)', delJob.length === 1);
const { data: cqGone } = await A.c.from('client_quotes').select('id').eq('id', cq.id);
check('la cotización se borró en cascada', cqGone.length === 0);
const { data: delVeh } = await A.c.from('vehicles').delete().eq('id', veh.id).select('id');
check('A puede borrar su vehículo', delVeh.length === 1);
veh = null;
job = null;
} finally {
  // Limpieza de respaldo si la prueba se interrumpió, y restauración del predeterminado original.
  if (job) await A.c.from('jobs').delete().eq('id', job.id);
  if (veh) await A.c.from('vehicles').delete().eq('id', veh.id);
  const { error: restoreErr } = await A.c.rpc('set_default_vehicle', { p_vehicle_id: originalDefault });
  const { data: defaultsAfter } = await A.c.from('vehicles').select('id').eq('is_default', true);
  const after = (defaultsAfter ?? []).map((v) => v.id);
  check(
    'el vehículo predeterminado de A queda igual que antes de la prueba',
    !restoreErr && (originalDefault === null ? after.length === 0 : after.length === 1 && after[0] === originalDefault),
    restoreErr?.message ?? `antes: ${originalDefault ? 'uno' : 'ninguno'}; después: ${after.length}`,
  );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificaciones correctas`);
process.exit(failed.length ? 1 : 0);
