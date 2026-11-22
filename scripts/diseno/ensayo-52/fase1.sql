-- HERRAMIENTA DE DISEÑO (#52, docs/23 §11). Ensayo en PostgreSQL LOCAL desechable. Nunca se aplica a
-- Supabase. FASE 1: sobre las 3 migraciones ANTERIORES a 20261122120000 (stub de Supabase incluido),
-- prepara los datos ficticios y demuestra los huecos H1–H4. Después ensayar.sh aplica la migración
-- REAL de #52 y corre fase2.sql (S0–S7). Datos ficticios. A = …0a, B = …0b, C = …0c.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@prueba.invalid'),
  ('00000000-0000-0000-0000-00000000000b', 'b@prueba.invalid'),
  ('00000000-0000-0000-0000-00000000000c', 'c@prueba.invalid');

create schema prueba;
grant usage on schema prueba to anon, authenticated;
create function prueba.job(p_local uuid default null, p_issued integer default null, p_id uuid default null) returns jsonb
language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('id', p_id)) || jsonb_build_object(
    'local_id', p_local, 'issued_number', p_issued, 'quote_date', '2026-11-21',
    'client_name', 'Cliente ficticio', 'net_price', 50000, 'internal', jsonb_build_object('engineVersion', 'x'))
$$;
create function prueba.quote() returns jsonb language sql immutable as $$
  select jsonb_build_object('issued_at', '2026-11-21', 'client_name', 'Cliente ficticio', 'net_price', 50000, 'total', 50000, 'tax_amount', null)
$$;
grant execute on all functions in schema prueba to anon, authenticated;
create table prueba.memo (k text primary key, v text);
grant select, insert, update on prueba.memo to authenticated;

-- ============================ FASE 1: estado actual ============================
\echo '--- FASE 1 (migraciones actuales) ---'

-- H1 · INSERT directo en jobs ANTES del primer guardado: el contador se crea después desde el
--      máximo, así que la secuencia salta al número elegido por el cliente.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
insert into public.jobs (number, issued_number, quote_date, client_name, net_price, internal)
  values (5000, 5000, '2026-11-21', 'Directo', 1000, '{}'::jsonb);
do $$ declare r jsonb; begin
  r := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (r ->> 'number')::int = 5001 then raise notice 'HUECO H1 confirmado: INSERT directo aceptado y el primer guardado recibe el N° 5001 (no el 1)';
  else raise notice 'H1 no reproducido: %', r; end if;
end $$;
commit;

-- H2 · Trabajo sin cotización y con número emitido repetido (dos documentos con el mismo N°).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ declare r jsonb; j uuid; begin
  r := public.create_job_with_quote(prueba.job(), prueba.quote());   -- N° 1 legítimo
  insert into public.jobs (number, issued_number, quote_date, client_name, net_price, internal)
    values (77, (r ->> 'issued_number')::int, '2026-11-21', 'Directo', 1000, '{}'::jsonb) returning id into j;
  if not exists (select 1 from public.client_quotes where job_id = j) then
    raise notice 'HUECO H2 confirmado: trabajo sin cotización y con el mismo número emitido (%) que otro documento', r ->> 'issued_number';
  end if;
  insert into prueba.memo values ('a_job1', r ->> 'id');
end $$;
commit;

-- H3 · (NUEVO, no estaba en #52) Reescribir un documento ya emitido: DELETE + INSERT en client_quotes.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ declare j uuid := (select v::uuid from prueba.memo where k = 'a_job1'); n int; begin
  delete from public.client_quotes where job_id = j;
  insert into public.client_quotes (job_id, number, issued_at, client_name, net_price, total)
    values (j, 999, '2026-11-21', 'Otro cliente', 1, 1);
  select number into n from public.client_quotes where job_id = j;
  if n = 999 then raise notice 'HUECO H3 confirmado: el documento emitido se reemplazó (N° 999, otro cliente, $1) aunque UPDATE está revocado'; end if;
end $$;
rollback;

-- H4 · (revisión de ChatGPT del 22-11) Importación por la función con un número emitido libre igual al
--      máximo de INTEGER: el contador sube a 2.147.483.647 y la siguiente cotización normal desborda.
--      Existe HOY, sin INSERT directo, y #52 (D-52-1) por sí solo no lo corrige.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ declare r jsonb; begin
  r := public.create_job_with_quote(prueba.job('44444444-4444-4444-8444-444444444444', 2147483647), prueba.quote());
  begin
    perform public.create_job_with_quote(prueba.job(), prueba.quote());
    raise notice 'H4 no reproducido';
  exception when numeric_value_out_of_range then
    raise notice 'HUECO H4 confirmado: tras importar el N° 2.147.483.647, la siguiente cotización falla (integer out of range): la cuenta queda bloqueada';
  end;
end $$;
rollback;

