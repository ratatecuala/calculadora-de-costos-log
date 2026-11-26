-- Verificación de un respaldo restaurado (docs/17-supabase-seguridad-respaldo.md §5).
--
-- SOLO LECTURA: fija el formato de la sesión (SET) y ejecuta una única consulta SELECT, sin datos
-- personales en la salida (conteos, banderas y huellas md5). Se ejecuta en el origen y en la base
-- restaurada CON EL MISMO instante de referencia (el `referencia_utc` del manifiesto), y se comparan
-- ambas salidas con `diff` (las conexiones, con service=…: docs/17 §5.5):
--
--   psql -w -d "service=ORIGEN"     -X -q -A -t -F ' | ' -v referencia=2026-11-24T12:00:00Z -f scripts/verificar-restauracion.sql > origen.txt
--   psql -w -d "service=RESTAURADO" -X -q -A -t -F ' | ' -v referencia=2026-11-24T12:00:00Z -f scripts/verificar-restauracion.sql > restaurado.txt
--   diff origen.txt restaurado.txt && echo "Sin diferencias"
--
-- Qué compara (A-78):
--   * conteos;
--   * huellas del CONTENIDO COMPLETO de las tablas de la app (todas las columnas de profiles, vehicles,
--     jobs, client_quotes, quote_shares y quote_counters) y de auth.users y auth.identities: md5 de
--     cada fila en su forma de texto, en orden de clave. Un cambio en cualquier columna (un cliente,
--     un precio, el JSON interno, un vehículo, un correo o un hash de contraseña) cambia la huella;
--   * huellas de identificadores y números (para ubicar la diferencia);
--   * invariantes de numeración y privilegios.
--   Los enlaces «vigentes» se cuentan en el instante de referencia, no en now(): un enlace que vence
--   entre el respaldo y la restauración no es una diferencia (P2 de la reauditoría de A-77).
--
-- Las filas «inv.*» son invariantes: deben valer lo indicado en la columna «esperado» en
-- cualquier base sana (también sirven sin comparar con el origen).
-- Probado en el ensayo local del 18-11-2026 (Postgres 16 con un stub mínimo de Supabase).
-- #52 (A-74): las invariantes de privilegios dependen de si la migración 20261122120000 está aplicada
-- (se detecta porque create_job_with_quote es SECURITY DEFINER). Así el script sirve antes y después.
-- Probado en local con las dos variantes (ensayo-52/probar-restauracion.sh).

\set ON_ERROR_STOP 1
\if :{?referencia}
\else
  do $$ begin raise exception 'falta el instante de referencia: psql -v referencia=<referencia_utc del manifiesto>'; end $$;
\endif
-- Formato de texto fijo: las huellas no dependen de la zona horaria ni de la configuración local.
set timezone = 'UTC';
set datestyle = 'ISO, YMD';
set intervalstyle = 'postgres';
set extra_float_digits = 1;
set bytea_output = 'hex';
-- M3 instala la tabla de carga y su ayudante. M4 instala, por separado, el RPC v2.
select to_regclass('public.job_cargo_items') is not null as hay_m3,
       to_regprocedure('public.create_job_with_quote_v2(jsonb,jsonb,jsonb)') is not null as hay_m4 \gset

with
ref as (select :'referencia'::timestamptz as instante),
m3 as (select :'hay_m3'::boolean as aplicada),
m52 as (
  select coalesce((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'create_job_with_quote'
                      and pg_get_function_identity_arguments(p.oid) = 'p_job jsonb, p_quote jsonb'), false) as aplicada
),
cnt as (
  select 'conteo.auth.users' as control, count(*)::text as valor, '' as esperado from auth.users
  union all select 'conteo.auth.identities', count(*)::text, '' from auth.identities
  union all select 'conteo.public.profiles', count(*)::text, '' from public.profiles
  union all select 'conteo.public.vehicles', count(*)::text, '' from public.vehicles
  union all select 'conteo.public.jobs', count(*)::text, '' from public.jobs
  union all select 'conteo.public.client_quotes', count(*)::text, '' from public.client_quotes
  union all select 'conteo.public.quote_shares', count(*)::text, '' from public.quote_shares
  union all select 'conteo.public.quote_shares_vigentes_en_referencia', count(*)::text, '' from public.quote_shares
    where revoked_at is null and (expires_at is null or expires_at > (select instante from ref))
  union all select 'conteo.public.quote_counters', count(*)::text, '' from public.quote_counters
\if :hay_m3
  union all select 'conteo.public.job_cargo_items', count(*)::text, '' from public.job_cargo_items
\endif
),
huella as (
  -- Huellas de identificadores y números (no revelan contenido): detectan filas cambiadas o perdidas.
  select 'huella.auth.users.id' as control, md5(coalesce(string_agg(id::text, ',' order by id), '')) as valor, '' as esperado from auth.users
  union all select 'huella.public.jobs.id+number+issued', md5(coalesce(string_agg(id::text || ':' || number || ':' || issued_number, ',' order by id), '')), '' from public.jobs
  union all select 'huella.public.client_quotes.id+number+total', md5(coalesce(string_agg(id::text || ':' || number || ':' || total, ',' order by id), '')), '' from public.client_quotes
  union all select 'huella.public.quote_shares.id+hash', md5(coalesce(string_agg(id::text || ':' || encode(token_hash, 'hex'), ',' order by id), '')), '' from public.quote_shares
  union all select 'huella.public.quote_counters', md5(coalesce(string_agg(owner_id::text || ':' || last_number, ',' order by owner_id), '')), '' from public.quote_counters
  union all select 'huella.public.vehicles.id', md5(coalesce(string_agg(id::text, ',' order by id), '')), '' from public.vehicles
  -- CONTENIDO COMPLETO (A-78): todas las columnas de cada fila, en su forma de texto.
  union all select 'contenido.auth.users', md5(coalesce(string_agg(md5(t::text), ',' order by t.id), '')), '' from auth.users t
  union all select 'contenido.auth.identities', md5(coalesce(string_agg(md5(t::text), ',' order by t.id), '')), '' from auth.identities t
  union all select 'contenido.public.profiles', md5(coalesce(string_agg(md5(t::text), ',' order by t.id), '')), '' from public.profiles t
  union all select 'contenido.public.vehicles', md5(coalesce(string_agg(md5(t::text), ',' order by t.id), '')), '' from public.vehicles t
  union all select 'contenido.public.jobs', md5(coalesce(string_agg(md5(t::text), ',' order by t.id), '')), '' from public.jobs t
  union all select 'contenido.public.client_quotes', md5(coalesce(string_agg(md5(t::text), ',' order by t.id), '')), '' from public.client_quotes t
  union all select 'contenido.public.quote_shares', md5(coalesce(string_agg(md5(t::text), ',' order by t.id), '')), '' from public.quote_shares t
  union all select 'contenido.public.quote_counters', md5(coalesce(string_agg(md5(t::text), ',' order by t.owner_id), '')), '' from public.quote_counters t
\if :hay_m3
  union all select 'contenido.public.job_cargo_items', md5(coalesce(string_agg(md5(t::text), ',' order by t.id), '')), '' from public.job_cargo_items t
\endif
),
inv as (
  -- Numeración (A-47): toda cuenta con trabajos tiene contador. Antes de #52, además, el contador es
  -- >= su número máximo (los números borrados no se reutilizan, por eso puede ser mayor). Con #52 (N1,
  -- A-72) las importaciones conservan su número SIN mover el contador, así que un contador por debajo
  -- del máximo es normal y ya no es un error.
  select 'inv.contador_menor_que_maximo' as control,
         count(*)::text as valor, '0' as esperado
    from (select owner_id, max(number) m from public.jobs group by owner_id) j
    left join public.quote_counters c using (owner_id)
   where c.last_number is null or (not (select aplicada from m52) and c.last_number < j.m)
  union all
  select 'inv.numeros_duplicados_por_cuenta', count(*)::text, '0'
    from (select 1 from public.jobs group by owner_id, number having count(*) > 1) d
  union all
  select 'inv.cotizaciones_sin_trabajo', count(*)::text, '0'
    from public.client_quotes q
   where not exists (select 1 from public.jobs j where j.id = q.job_id and j.owner_id = q.owner_id)
  union all
  select 'inv.filas_sin_usuario_auth', (
      (select count(*) from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id))
    + (select count(*) from public.vehicles v where not exists (select 1 from auth.users u where u.id = v.owner_id))
    + (select count(*) from public.jobs j where not exists (select 1 from auth.users u where u.id = j.owner_id))
    + (select count(*) from public.quote_counters c where not exists (select 1 from auth.users u where u.id = c.owner_id))
    )::text, '0'
  -- Seguridad: RLS, políticas y privilegios tal como los dejan las migraciones.
  union all
  select 'inv.tablas_public_sin_rls', count(*)::text, '0'
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  union all
  select 'inv.tablas_public_con_rls', count(*)::text, case when (select aplicada from m3) then '7' else '6' end
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  union all
  select 'inv.politicas_public', count(*)::text, case when (select aplicada from m3) then '14' when (select aplicada from m52) then '13' else '17' end from pg_policies where schemaname = 'public'
  union all
  select 'inv.privilegios_tabla_anon', count(*)::text, '0'
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema in ('public', 'private')
  union all
  select 'inv.privilegios_tabla_authenticated',
         coalesce(string_agg(table_name || ':' || privs, ' ' order by table_name), ''),
         case when (select aplicada from m52)
              then 'client_quotes:SELECT ' || case when (select aplicada from m3) then 'job_cargo_items:SELECT ' else '' end
                   || 'jobs:DELETE,SELECT profiles:DELETE,INSERT,SELECT,UPDATE vehicles:DELETE,INSERT,SELECT,UPDATE'
              else 'client_quotes:DELETE,INSERT,SELECT jobs:DELETE,INSERT,SELECT profiles:DELETE,INSERT,SELECT,UPDATE vehicles:DELETE,INSERT,SELECT,UPDATE' end
    from (select table_name, string_agg(privilege_type, ',' order by privilege_type) privs
            from information_schema.role_table_grants
           where grantee = 'authenticated' and table_schema = 'public'
           group by table_name) g
  union all
  select 'inv.authenticated_lee_token_hash',
         has_column_privilege('authenticated', 'public.quote_shares', 'token_hash', 'select')::text, 'false'
  union all
  select 'inv.funciones_sin_search_path', count(*)::text, '0'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  union all
  select 'inv.funciones_ejecutables_por_anon',
         coalesce(string_agg(n.nspname || '.' || p.proname, ' ' order by p.proname), ''), 'public.get_public_quote'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
  union all
  select 'inv.security_definer',
         coalesce(string_agg(n.nspname || '.' || p.proname, ' ' order by n.nspname, p.proname), ''),
         'private.allocate_quote_number'
           || case when (select aplicada from m3) then ' private.insert_cargo_items' else '' end
           || case when (select aplicada from m52) then ' public.create_job_with_quote' else '' end
           || case when :'hay_m4'::boolean then ' public.create_job_with_quote_v2' else '' end
           || ' public.create_quote_share public.get_public_quote public.revoke_quote_share'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
  union all
  select 'inv.esquema_private_usable_por_anon', has_schema_privilege('anon', 'private', 'usage')::text, 'false'
  union all
  select 'inv.esquema_private_usable_por_authenticated', has_schema_privilege('authenticated', 'private', 'usage')::text,
         case when (select aplicada from m52) then 'false' else 'true' end
)
select control, valor, esperado from cnt
union all select control, valor, esperado from huella
union all select control, valor, esperado from inv
union all select 'referencia_utc', to_char((select instante from ref), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''
order by control;
