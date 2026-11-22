-- HERRAMIENTA DE DISEÑO (#52, A-74). Fase R del ensayo: reversión de la migración real en una base LOCAL
-- desechable que ya tiene TODAS las migraciones (incluida 20261122120000). Nunca se aplica a Supabase.
-- Variables de psql: :reversion (reversion-52.sql) y :migracion (la migración real).
-- R1 datos intactos y permisos anteriores; R2 guardado con la semántica anterior; R3 reversión
-- idempotente; R4 migración de nuevo sobre los datos, sin cambiarlos, con N1 otra vez.
\set ON_ERROR_STOP 1
\set QUIET 1
\echo '--- FASE R (reversión de la migración 20261122120000) ---'

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'r1@prueba.invalid'),
  ('00000000-0000-0000-0000-0000000000a2', 'r2@prueba.invalid');
create schema prueba;
grant usage on schema prueba to authenticated;
create function prueba.job(p_local uuid default null, p_issued integer default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('local_id', p_local, 'issued_number', p_issued, 'quote_date', '2026-11-22',
    'client_name', 'Cliente ficticio', 'net_price', 50000, 'internal', jsonb_build_object('engineVersion', 'x'))
$$;
create function prueba.quote() returns jsonb language sql immutable as $$
  select jsonb_build_object('issued_at', '2026-11-22', 'client_name', 'Cliente ficticio', 'net_price', 50000, 'total', 50000, 'tax_amount', null)
$$;
grant execute on all functions in schema prueba to authenticated;
create table prueba.memo (k text primary key, v text);
create function prueba.huella() returns text language sql stable as $$
  select md5(
    coalesce((select string_agg(j.id::text || ':' || j.owner_id || ':' || j.number || ':' || j.issued_number || ':' || coalesce(q.number::text, '-') || ':' || q.client_name, ',' order by j.id)
              from public.jobs j left join public.client_quotes q on q.job_id = j.id), '') || '|' ||
    coalesce((select string_agg(owner_id::text || ':' || last_number, ',' order by owner_id) from public.quote_counters), ''))
$$;

-- Datos con la migración aplicada (N1): R1 → 3 nuevas, importación libre N° 50, importación ocupada N° 2.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ declare r jsonb; begin
  perform public.create_job_with_quote(prueba.job(), prueba.quote());
  perform public.create_job_with_quote(prueba.job(), prueba.quote());
  perform public.create_job_with_quote(prueba.job(), prueba.quote());
  perform public.create_job_with_quote(prueba.job('a1000000-0000-4000-8000-000000000050', 50), prueba.quote());
  r := public.create_job_with_quote(prueba.job('a1000000-0000-4000-8000-000000000002', 2), prueba.quote());
  if (r ->> 'number')::int <> 4 or (r ->> 'issued_number')::int <> 2 then raise exception 'FALLA R0 preparación: %', r; end if;
end $$;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select public.create_job_with_quote(prueba.job(), prueba.quote()) \gset r2_
commit;
insert into prueba.memo values ('antes', prueba.huella()), ('trabajos', (select count(*)::text from public.jobs));

\i :reversion

-- R1 · datos intactos y permisos anteriores restaurados.
do $$ begin
  if (select v from prueba.memo where k = 'antes') <> prueba.huella() then raise exception 'FALLA R1: la reversión cambió datos o contadores'; end if;
  if (select prosecdef from pg_proc where oid = 'public.create_job_with_quote(jsonb, jsonb)'::regprocedure) then raise exception 'FALLA R1: la función sigue DEFINER'; end if;
  if not has_table_privilege('authenticated', 'public.jobs', 'insert') or not has_table_privilege('authenticated', 'public.client_quotes', 'delete') then raise exception 'FALLA R1: no volvieron los permisos de escritura'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and policyname in ('jobs_insert', 'client_quotes_insert', 'client_quotes_update', 'client_quotes_delete')) <> 4 then raise exception 'FALLA R1: faltan políticas'; end if;
  if not has_schema_privilege('authenticated', 'private', 'usage') or not has_function_privilege('authenticated', 'private.allocate_quote_number(integer)', 'execute') then raise exception 'FALLA R1: no volvió el acceso a private'; end if;
  if exists (select 1 from pg_indexes where indexname = 'jobs_owner_issued_idx') then raise exception 'FALLA R1: quedó el índice'; end if;
  raise notice 'OK R1 reversión: % trabajos, documentos y contadores idénticos (huella); función INVOKER, escritura directa, 4 políticas y acceso a private restaurados; índice retirado', (select v from prueba.memo where k = 'trabajos');
end $$;

-- R2 · el guardado funciona con la semántica ANTERIOR (la importación vuelve a mover el contador) y el
--      INSERT directo vuelve a aceptarse (el estado previo a #52, como se esperaba de la reversión).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ declare r jsonb; n jsonb; begin
  r := public.create_job_with_quote(prueba.job('a1000000-0000-4000-8000-000000001000', 1000), prueba.quote());
  n := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (r ->> 'number')::int <> 1000 or (n ->> 'number')::int <> 1001 then raise exception 'FALLA R2: % %', r, n; end if;
  insert into public.jobs (number, issued_number, quote_date, client_name, net_price, internal) values (7777, 7777, '2026-11-22', 'Directo', 1, '{}'::jsonb);
  raise notice 'OK R2 tras revertir, el guardado funciona con la semántica anterior (importar N° 1000 → la siguiente es la 1001) y el INSERT directo vuelve a aceptarse';
end $$;
rollback;

-- R3 · la reversión aplicada otra vez no falla.
\i :reversion
do $$ begin
  if (select v from prueba.memo where k = 'antes') <> prueba.huella() then raise exception 'FALLA R3'; end if;
  raise notice 'OK R3 la reversión aplicada por segunda vez no falla ni cambia datos';
end $$;

-- R4 · la migración de nuevo sobre los mismos datos: no los cambia y N1 vuelve.
\i :migracion
do $$ begin
  if (select v from prueba.memo where k = 'antes') <> prueba.huella() then raise exception 'FALLA R4: la migración cambió datos'; end if;
  if has_table_privilege('authenticated', 'public.jobs', 'insert') or has_schema_privilege('authenticated', 'private', 'usage') then raise exception 'FALLA R4: no volvió a cerrar la escritura directa o private'; end if;
end $$;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
do $$ declare r jsonb; n jsonb; begin
  r := public.create_job_with_quote(prueba.job('a1000000-0000-4000-8000-000000005000', 5000), prueba.quote());
  n := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (r ->> 'number')::int <> 5000 or (n ->> 'number')::int <> 5 then raise exception 'FALLA R4 N1: % %', r, n; end if;
  raise notice 'OK R4 migración otra vez: datos idénticos, escritura directa cerrada y N1 activo (importar N° 5000 → la siguiente es la 5)';
end $$;
rollback;
