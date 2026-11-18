/**
 * Verificación REAL de la numeración de cotizaciones (A-47) contra Supabase (staging).
 * Usa sesiones reales de los usuarios de prueba A y B y solo la clave publicable.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
 *   TEST_USERS_FILE=/fuera/del/repo/test_users.json node scripts/verificar-numeracion.mjs
 *
 * Al final, A borra las cotizaciones que creó esta prueba (los números usados no se reutilizan).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
const users = JSON.parse(readFileSync(process.env.TEST_USERS_FILE, 'utf8'));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function login(u) {
  const c = createClient(url, key, opts);
  const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw new Error(error.message);
  return { c, id: data.user.id };
}

const tag = `num-${Date.now()}`;
const created = [];
function payload(client, { localId = null, issued = null } = {}) {
  return {
    p_job: {
      id: null,
      local_id: localId,
      number: 1,
      issued_number: issued,
      quote_date: '2026-11-18',
      client_name: `${client} ${tag}`,
      net_price: 1000,
      internal: {},
      waypoints: [],
    },
    p_quote: { number: 1, issued_at: '2026-11-18', client_name: `${client} ${tag}`, net_price: 1000, tax_amount: null, total: 1000 },
  };
}
async function save(c, opts2, label) {
  const { data, error } = await c.rpc('create_job_with_quote', payload(label, opts2));
  if (error) throw new Error(`${label}: ${error.message}`);
  if (data) created.push(data.id);
  return data;
}

// Dos «dispositivos» de A (sesiones independientes) y la cuenta B.
const A1 = await login(users.a);
const A2 = await login(users.a);
const B = await login(users.b);
const maxOf = async (c) => (((await c.from('jobs').select('number').order('number', { ascending: false }).limit(1)).data ?? [])[0]?.number ?? 0);

// 1. Concurrencia: 20 guardados simultáneos desde dos dispositivos de A.
const before = await maxOf(A1.c);
const conc = await Promise.all(Array.from({ length: 20 }, (_, i) => save(i % 2 ? A2.c : A1.c, {}, `Concurrente-${i}`)));
const nums = conc.map((r) => r.number).sort((x, y) => x - y);
const unique = new Set(nums).size === nums.length;
// Correlativos entre sí y posteriores al máximo previo. No se exige empezar en «máximo + 1»: los
// números de cotizaciones borradas (incluidas las de ejecuciones anteriores de esta prueba) no se
// reutilizan (A-47), así que el contador puede ir por delante del máximo visible.
const contiguous = nums[0] > before && nums[nums.length - 1] === nums[0] + 19;
check('20 guardados simultáneos (2 dispositivos): números únicos y correlativos', unique && contiguous, `${nums[0]}…${nums[nums.length - 1]} (máximo previo ${before})`);
check('cotizaciones nuevas: número emitido = número interno', conc.every((r) => r.issued_number === r.number));

// 2. Otro dispositivo ve los mismos números.
const { data: seen } = await A2.c.from('jobs').select('id, number').in('id', conc.map((r) => r.id));
check('el otro dispositivo ve los mismos números', seen.length === 20 && seen.every((s) => conc.find((r) => r.id === s.id).number === s.number));

// 3. Importación repetida y simultánea (mismo local_id): una sola copia, sin gastar números.
const localId = randomUUID();
const dupe = await Promise.all([save(A1.c, { localId, issued: 7 }, 'Importada'), save(A2.c, { localId, issued: 7 }, 'Importada')]);
const copies = dupe.filter(Boolean);
check('importación repetida al mismo tiempo: exactamente 1 copia', copies.length === 1, `${copies.length} copias`);
const again = await save(A1.c, { localId, issued: 7 }, 'Importada');
check('importación repetida después: no duplica', again === null);
const next = await save(A1.c, {}, 'Tras-importar');
check('la importación repetida no dejó huecos en la secuencia', next.number === Math.max(before + 20, copies[0]?.number ?? 0) + 1, `siguiente=${next.number}`);

// 4. Importación con número ocupado: número interno nuevo, documento con el número emitido.
const occupied = nums[0];
const imp = await save(A1.c, { localId: randomUUID(), issued: occupied }, 'Importada-ocupada');
check('número local ocupado → número interno nuevo y único', imp.number !== occupied && imp.issued_number === occupied, `interno=${imp.number}, emitido=${imp.issued_number}`);
const { data: cq } = await A1.c.from('client_quotes').select('number').eq('job_id', imp.id).single();
check('el documento del cliente conserva el número emitido', cq.number === occupied);

// 5. Importación con número libre: se conserva tal cual.
const free = (await maxOf(A1.c)) + 50;
const impFree = await save(A1.c, { localId: randomUUID(), issued: free }, 'Importada-libre');
check('número local libre → se conserva como número interno', impFree.number === free && impFree.issued_number === free);
const afterFree = await save(A1.c, {}, 'Tras-libre');
check('la secuencia sigue después del número importado (sin repetir)', afterFree.number === free + 1, `siguiente=${afterFree.number}`);

// 6. Documento histórico inalterable.
const { error: updNum } = await A1.c.from('jobs').update({ number: 99999 }).eq('id', imp.id);
check('el dueño no puede cambiar el número de un trabajo', !!updNum, updNum?.message);
const { error: updIssued } = await A1.c.from('jobs').update({ issued_number: 1 }).eq('id', imp.id);
check('el dueño no puede cambiar el número emitido', !!updIssued, updIssued?.message);
const { error: updCq } = await A1.c.from('client_quotes').update({ number: 1 }).eq('job_id', imp.id);
check('nadie puede reescribir la cotización emitida al cliente', !!updCq, updCq?.message);
const { data: st, error: updStatus } = await A1.c.from('jobs').update({ status: 'enviada', payment: 'recibido' }).eq('id', imp.id).select('status, payment');
check('estado y pago se siguen pudiendo cambiar', !updStatus && st?.[0]?.status === 'enviada', updStatus?.message);
const { error: counterRead } = await A1.c.from('quote_counters').select('*');
check('el contador no se puede leer ni manipular por la API', !!counterRead, counterRead?.message);

// 7. Secuencias independientes por cuenta.
// Los números de cotizaciones borradas no se reutilizan (A-47), y esta misma prueba borra lo que
// crea: el siguiente número de B puede ser mayor que su máximo visible + 1. Lo que se exige es
// que la secuencia de B sea propia (no la de A), correlativa y sin reutilizar números.
// Independencia: los guardados de B no consumen números de A (A sigue correlativa entre un
// guardado anterior y otro posterior a los de B). No se compara el orden absoluto entre cuentas:
// una cuenta B legítima puede tener un contador mayor que el de A.
const bBefore = await maxOf(B.c);
const aPrev = await save(A1.c, {}, 'A antes de B');
const b1 = await save(B.c, {}, 'B');
const b2 = await save(B.c, {}, 'B');
const aNext = await save(A1.c, {}, 'A después de B');
check(
  'la cuenta B tiene su propia secuencia (correlativa, sin reutilizar números, sin consumir números de A)',
  b1.number > bBefore && b2.number === b1.number + 1 && aNext.number === aPrev.number + 1,
  `B=${b1.number},${b2.number}; máximo visible previo de B=${bBefore}; A=${aPrev.number}→${aNext.number}`,
);

// 8. Enlace público muestra el número emitido.
const { data: token } = await A1.c.rpc('create_quote_share', { p_quote_id: (await A1.c.from('client_quotes').select('id').eq('job_id', imp.id).single()).data.id });
const anon = createClient(url, key, opts);
const { data: pub } = await anon.rpc('get_public_quote', { p_token: token });
check('el enlace público muestra el número emitido', pub?.[0]?.number === occupied);

// Limpieza de lo creado por esta prueba (cada dueño borra lo suyo).
const delA = await A1.c.from('jobs').delete().in('id', created).select('id');
const delB = await B.c.from('jobs').delete().in('id', created).select('id');
console.log(`Limpieza: ${(delA.data?.length ?? 0) + (delB.data?.length ?? 0)} de ${created.length} cotizaciones de prueba borradas`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificaciones correctas`);
process.exit(failed.length ? 1 : 0);
