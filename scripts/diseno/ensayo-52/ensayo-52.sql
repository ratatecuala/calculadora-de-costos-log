-- HERRAMIENTA DE DISEÑO (#52, docs/23). ENSAYO en PostgreSQL LOCAL desechable (stub de Supabase +
-- las 3 migraciones reales). NO es una migración, no está en supabase/migrations y nunca se aplica
-- a Supabase. La corrección de la fase 2 es la PROPUESTA de docs/23 §4, pendiente de aprobación.
-- Datos ficticios. A = …0a, B = …0b, C = …0c.
-- Fase 1: demuestra los huecos actuales (H1–H3). Fase 2: aplica la propuesta y la verifica (S0–S7).
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

-- ===================== FASE 2: corrección propuesta (borrador) =====================
\echo '--- FASE 2 (corrección propuesta aplicada) ---'
reset role;
-- 1. La función de guardado v1 pasa a SECURITY DEFINER. Mismo cuerpo, misma firma: solo cambia
--    quién ejecuta los INSERT. La identidad sigue saliendo de auth.uid() y cada consulta filtra por dueño.
alter function public.create_job_with_quote(jsonb, jsonb) security definer;
-- 2. Sin INSERT directo en jobs ni INSERT/DELETE directo en client_quotes.
revoke insert on table public.jobs from authenticated;
revoke insert, delete on table public.client_quotes from authenticated;
drop policy jobs_insert on public.jobs;
drop policy client_quotes_insert on public.client_quotes;
drop policy client_quotes_delete on public.client_quotes;
drop policy client_quotes_update on public.client_quotes; -- ya sin GRANT UPDATE desde la numeración
-- Variante B+ (docs/23 §4.2): solo con  -v bmas=1
\if :bmas
revoke execute on function private.allocate_quote_number(integer) from authenticated;
revoke usage on schema private from authenticated;
\echo 'variante B+: authenticated sin acceso al esquema private'
\endif

\if :omitir_s0
\echo 'control C3: comprobación S0 omitida'
\else
do $$ begin
  if (select prosecdef from pg_proc where oid = 'public.create_job_with_quote(jsonb, jsonb)'::regprocedure)
     and (select proconfig from pg_proc where oid = 'public.create_job_with_quote(jsonb, jsonb)'::regprocedure) = array['search_path=""']
  then raise notice 'OK S0 create_job_with_quote: SECURITY DEFINER con search_path vacío';
  else raise exception 'FALLA S0'; end if;
  if has_function_privilege('anon', 'public.create_job_with_quote(jsonb, jsonb)', 'execute') then raise exception 'FALLA S0b anon puede ejecutar'; end if;
  raise notice 'OK S0b anon no puede ejecutar la función';
end $$;
\endif

-- S1 · INSERT directo en jobs rechazado (42501), con o sin owner propio.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  insert into public.jobs (number, issued_number, quote_date, client_name, net_price, internal)
    values (5000, 5000, '2026-11-21', 'Directo', 1000, '{}'::jsonb);
  raise exception 'FALLA S1: INSERT directo aceptado';
exception when insufficient_privilege then raise notice 'OK S1 INSERT directo en jobs rechazado (42501)';
end $$;
commit;

-- S2 · INSERT y DELETE directos en client_quotes rechazados (el documento emitido no se reescribe).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ declare j uuid := (select v::uuid from prueba.memo where k = 'a_job1'); begin
  begin
    delete from public.client_quotes where job_id = j;
    raise exception 'FALLA S2: DELETE aceptado';
  exception when insufficient_privilege then raise notice 'OK S2 DELETE directo en client_quotes rechazado (42501)';
  end;
  begin
    insert into public.client_quotes (job_id, number, issued_at, client_name, net_price, total) values (j, 999, '2026-11-21', 'x', 1, 1);
    raise exception 'FALLA S2b: INSERT aceptado';
  exception when insufficient_privilege then raise notice 'OK S2b INSERT directo en client_quotes rechazado (42501)';
  end;
end $$;
commit;

-- S3 · El guardado sigue: cotización nueva de B → N° 1 (secuencia propia), con su documento.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ declare r jsonb; begin
  r := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (r ->> 'number')::int <> 1 or (r ->> 'issued_number')::int <> 1 then raise exception 'FALLA S3: %', r; end if;
  if (select owner_id from public.jobs where id = (r ->> 'id')::uuid) <> '00000000-0000-0000-0000-00000000000b' then raise exception 'FALLA S3 dueño'; end if;
  if (select number from public.client_quotes where job_id = (r ->> 'id')::uuid) <> 1 then raise exception 'FALLA S3 documento'; end if;
  insert into prueba.memo values ('b_job1', r ->> 'id');
  raise notice 'OK S3 guardado de B: N° 1, dueño B y documento N° 1';
end $$;
commit;

-- S4 · Importación: conserva el número emitido libre; repetida → NULL sin gastar número.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ declare r jsonb; r2 jsonb; r3 jsonb; begin
  r := public.create_job_with_quote(prueba.job('11111111-1111-4111-8111-111111111111', 40), prueba.quote());
  if (r ->> 'number')::int <> 40 or (r ->> 'issued_number')::int <> 40 then raise exception 'FALLA S4: %', r; end if;
  r2 := public.create_job_with_quote(prueba.job('11111111-1111-4111-8111-111111111111', 40), prueba.quote());
  if r2 is not null then raise exception 'FALLA S4 idempotencia: %', r2; end if;
  r3 := public.create_job_with_quote(prueba.job('22222222-2222-4222-8222-222222222222', 40), prueba.quote());
  if (r3 ->> 'number')::int <> 41 or (r3 ->> 'issued_number')::int <> 40 then raise exception 'FALLA S4 conflicto: %', r3; end if;
  raise notice 'OK S4 importación: N° 40 conservado; repetida → NULL; conflicto → interno 41 y emitido 40';
end $$;
commit;

-- S5 · Aislamiento con DEFINER: B usa el mismo local_id que A → crea lo suyo; B usa el id de un
--      trabajo de A → error de clave (no lo sobrescribe ni lo lee); A no ve lo de B.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ declare r jsonb; begin
  r := public.create_job_with_quote(prueba.job('11111111-1111-4111-8111-111111111111', 40), prueba.quote());
  if r is null or (select owner_id from public.jobs where id = (r ->> 'id')::uuid) <> '00000000-0000-0000-0000-00000000000a' then raise exception 'FALLA S5 local_id compartido: %', r; end if;
  begin
    perform public.create_job_with_quote(prueba.job(null, null, (select v::uuid from prueba.memo where k = 'b_job1')), prueba.quote());
    raise exception 'FALLA S5: aceptó el id de un trabajo ajeno';
  exception when unique_violation then null;
  end;
  if exists (select 1 from public.jobs where owner_id <> '00000000-0000-0000-0000-00000000000a') then raise exception 'FALLA S5: A ve trabajos ajenos'; end if;
  raise notice 'OK S5 aislamiento: mismo local_id en otra cuenta crea lo propio; id ajeno → error; A solo ve lo suyo';
end $$;
commit;
do $$ begin
  if (select client_name from public.jobs where id = (select v::uuid from prueba.memo where k = 'b_job1')) <> 'Cliente ficticio'
     or (select owner_id from public.jobs where id = (select v::uuid from prueba.memo where k = 'b_job1')) <> '00000000-0000-0000-0000-00000000000b'
  then raise exception 'FALLA S5b: el trabajo de B cambió'; end if;
  raise notice 'OK S5b el trabajo de B quedó intacto';
end $$;

-- S6 · Sin sesión (auth.uid() nulo) el guardado se niega, aunque la función sea DEFINER.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  perform public.create_job_with_quote(prueba.job(), prueba.quote());
  raise exception 'FALLA S6';
exception when insufficient_privilege then raise notice 'OK S6 sin sesión: rechazado (42501)';
end $$;
commit;

-- S7 · Lo que la app sí hace sigue funcionando: cambiar estado y pago; borrar el trabajo completo
--      (la cascada borra el documento aunque DELETE en client_quotes esté revocado). Número: no.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ declare j uuid := (select v::uuid from prueba.memo where k = 'b_job1'); begin
  update public.jobs set status = 'enviada', payment = 'recibido' where id = j;
  if (select status from public.jobs where id = j) <> 'enviada' then raise exception 'FALLA S7 estado'; end if;
  begin
    update public.jobs set number = 999 where id = j;
    raise exception 'FALLA S7 número';
  exception when insufficient_privilege then null;
  end;
  delete from public.jobs where id = j;
  if exists (select 1 from public.client_quotes where job_id = j) then raise exception 'FALLA S7 cascada'; end if;
  raise notice 'OK S7 estado y pago se cambian; el número no; borrar el trabajo borra su documento en cascada';
end $$;
commit;
