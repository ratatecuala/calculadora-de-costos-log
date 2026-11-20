-- HERRAMIENTA DE DISEÑO (#45). Pruebas de los borradores M3 y M4 sobre un PostgreSQL LOCAL
-- desechable, con las 3 migraciones reales del repositorio y el stub de Supabase.
-- Cada prueba imprime «OK …» o detiene la ejecución con «FALLA …». Nunca se ejecuta en Supabase.
-- Datos ficticios. Usuarios: A = …0a, B = …0b.

\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@prueba.invalid'),
  ('00000000-0000-0000-0000-00000000000b', 'b@prueba.invalid');

create schema prueba;
grant usage on schema prueba to anon, authenticated;

create function prueba.job(p_local uuid default null, p_issued integer default null) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'local_id', p_local, 'issued_number', p_issued, 'quote_date', '2026-11-20',
    'client_name', 'Cliente ficticio', 'net_price', 50000,
    'internal', jsonb_build_object('schemaVersion', 2, 'cargo', jsonb_build_object('mode', 'detallado', 'summary', 'Prueba')))
$$;
create function prueba.quote() returns jsonb language sql immutable as $$
  select jsonb_build_object('issued_at', '2026-11-20', 'client_name', 'Cliente ficticio', 'net_price', 50000, 'total', 50000, 'tax_amount', null)
$$;
-- n líneas válidas; con p_bad, la última tiene qty = 0 (viola el check).
create function prueba.items(n integer, p_bad boolean default false) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', 'cajas', 'description', 'Caja ficticia ' || i, 'qty', case when p_bad and i = n then 0 else 1 end,
    'unitWeightKg', 10, 'dimsCm', jsonb_build_object('l', 50, 'w', 40, 'h', 40),
    'volumeM3', 0.08, 'volumeSource', 'calculado', 'fragile', false, 'handling', 'normal') order by i), '[]'::jsonb)
  from generate_series(1, n) as i
$$;
grant execute on all functions in schema prueba to anon, authenticated;

-- Tabla de apoyo para recordar ids entre transacciones (solo superusuario).
create table prueba.memo (k text primary key, v text);
grant select, insert on prueba.memo to authenticated;

-- T1 · Guardado v2 con 3 líneas: trabajo, cotización y líneas en una transacción.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare r jsonb; n integer;
begin
  r := public.create_job_with_quote_v2(prueba.job(), prueba.quote(), prueba.items(3));
  if r is null or r ->> 'number' is null then raise exception 'FALLA T1: sin resultado'; end if;
  select count(*) into n from public.job_cargo_items where job_id = (r ->> 'id')::uuid;
  if n <> 3 then raise exception 'FALLA T1: % líneas', n; end if;
  insert into prueba.memo values ('t1_job', r ->> 'id');
  raise notice 'OK T1 guardado v2 con 3 líneas (N° %)', r ->> 'number';
end $$;
commit;

-- T2-T4 · El dueño NO puede insertar, modificar ni borrar líneas directamente.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare j uuid := (select v::uuid from prueba.memo where k = 't1_job');
begin
  begin
    insert into public.job_cargo_items (owner_id, job_id, position, kind, description, qty)
      values ('00000000-0000-0000-0000-00000000000a', j, 50, 'otro', 'Agregada después', 1);
    raise exception 'FALLA T2: INSERT directo aceptado';
  exception when insufficient_privilege then raise notice 'OK T2 INSERT directo rechazado';
  end;
  begin
    update public.job_cargo_items set qty = 99 where job_id = j;
    raise exception 'FALLA T3: UPDATE aceptado';
  exception when insufficient_privilege then raise notice 'OK T3 UPDATE rechazado';
  end;
  begin
    delete from public.job_cargo_items where job_id = j;
    raise exception 'FALLA T4: DELETE aceptado';
  exception when insufficient_privilege then raise notice 'OK T4 DELETE rechazado';
  end;
end $$;
commit;

-- T5 · B no ve las líneas de A.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ declare n integer; begin
  select count(*) into n from public.job_cargo_items;
  if n <> 0 then raise exception 'FALLA T5: B ve % líneas', n; end if;
  raise notice 'OK T5 B no ve líneas de A';
end $$;
commit;

-- T6 · No se pueden agregar líneas a una cotización ya emitida (otra transacción), ni siquiera
--      llamando directamente a la función privada.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare j uuid := (select v::uuid from prueba.memo where k = 't1_job');
begin
  perform private.insert_cargo_items(j, prueba.items(1));
  raise exception 'FALLA T6: se agregaron líneas a una cotización emitida';
exception when insufficient_privilege then raise notice 'OK T6 no se agregan líneas a una cotización emitida';
end $$;
commit;

-- T6b · Cotización emitida SIN líneas: tampoco se le pueden agregar después (defensa por
--       transacción: created_at = now()). Ejercita una defensa distinta de la de T6.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ declare r jsonb; begin
  r := public.create_job_with_quote_v2(prueba.job(), prueba.quote(), '[]'::jsonb);
  insert into prueba.memo values ('t6b_job', r ->> 'id');
end $$;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare j uuid := (select v::uuid from prueba.memo where k = 't6b_job');
begin
  perform private.insert_cargo_items(j, prueba.items(1));
  raise exception 'FALLA T6b: se agregaron líneas a una cotización emitida sin líneas';
exception when insufficient_privilege then raise notice 'OK T6b no se agregan líneas a una cotización emitida sin líneas';
end $$;
commit;

-- T7 · Una línea inválida revierte TODO: sin trabajo nuevo y sin avance del contador.
insert into prueba.memo select 't7_contador', last_number::text from public.quote_counters
  where owner_id = '00000000-0000-0000-0000-00000000000a';
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare jobs_antes integer; jobs_despues integer;
begin
  select count(*) into jobs_antes from public.jobs;
  begin
    perform public.create_job_with_quote_v2(prueba.job(), prueba.quote(), prueba.items(3, true));
    raise exception 'FALLA T7: línea inválida aceptada';
  exception when check_violation then null;
  end;
  select count(*) into jobs_despues from public.jobs;
  if jobs_despues <> jobs_antes then raise exception 'FALLA T7: quedó un trabajo sin líneas'; end if;
  raise notice 'OK T7 línea inválida: nada se guarda';
end $$;
commit;
do $$ declare c integer; antes integer := (select v::integer from prueba.memo where k = 't7_contador'); begin
  select last_number into c from public.quote_counters where owner_id = '00000000-0000-0000-0000-00000000000a';
  if c <> antes then raise exception 'FALLA T7: el contador avanzó de % a %', antes, c; end if;
  raise notice 'OK T7 el contador no avanzó (sigue en %): sin huecos', c;
end $$;

-- T8 · Importación repetida (mismo local_id): devuelve NULL, no duplica líneas ni gasta número.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare r1 jsonb; r2 jsonb; n integer;
begin
  r1 := public.create_job_with_quote_v2(prueba.job('11111111-1111-1111-1111-111111111111', 7), prueba.quote(), prueba.items(2));
  if r1 is null or (r1 ->> 'issued_number')::integer <> 7 then raise exception 'FALLA T8: importación inicial %', r1; end if;
  insert into prueba.memo values ('t8_job', r1 ->> 'id');
end $$;
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare r2 jsonb; n integer;
begin
  r2 := public.create_job_with_quote_v2(prueba.job('11111111-1111-1111-1111-111111111111', 7), prueba.quote(), prueba.items(5));
  if r2 is not null then raise exception 'FALLA T8: importación repetida devolvió %', r2; end if;
  select count(*) into n from public.job_cargo_items where job_id = (select v::uuid from prueba.memo where k = 't8_job');
  if n <> 2 then raise exception 'FALLA T8: % líneas tras repetir', n; end if;
  raise notice 'OK T8 importación repetida: NULL, 2 líneas originales, número emitido 7 conservado';
end $$;
commit;

-- T9 · Más de 200 líneas: rechazado antes de gastar número.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  perform public.create_job_with_quote_v2(prueba.job(), prueba.quote(), prueba.items(201));
  raise exception 'FALLA T9: 201 líneas aceptadas';
exception when invalid_parameter_value then raise notice 'OK T9 201 líneas rechazadas';
end $$;
commit;

-- T9b · 200 líneas: aceptadas en el mismo guardado atómico.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ declare r jsonb; n integer; begin
  r := public.create_job_with_quote_v2(prueba.job(), prueba.quote(), prueba.items(200));
  select count(*) into n from public.job_cargo_items where job_id = (r ->> 'id')::uuid;
  if n <> 200 then raise exception 'FALLA T9b: % líneas', n; end if;
  raise notice 'OK T9b 200 líneas guardadas (N° %)', r ->> 'number';
end $$;
commit;

-- T10 · anon no puede guardar.
begin;
set local role anon;
do $$ begin
  perform public.create_job_with_quote_v2(prueba.job(), prueba.quote(), '[]'::jsonb);
  raise exception 'FALLA T10: anon guardó';
exception when insufficient_privilege then raise notice 'OK T10 anon no puede guardar';
end $$;
commit;

-- T11 · El dueño no puede reescribir el snapshot interno (A-47, permisos de la migración real).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  update public.jobs set internal = '{}'::jsonb where id = (select v::uuid from prueba.memo where k = 't1_job');
  raise exception 'FALLA T11: internal modificado';
exception when insufficient_privilege then raise notice 'OK T11 internal no se puede modificar';
end $$;
commit;

-- T12 · La v1 sigue funcionando igual (sin líneas).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ declare r jsonb; begin
  r := public.create_job_with_quote(prueba.job(), prueba.quote());
  if r is null or (r ->> 'number')::integer <> 1 then raise exception 'FALLA T12: %', r; end if;
  raise notice 'OK T12 guardado v1 intacto (B: N° 1, secuencia propia)';
end $$;
commit;

-- T13 · Eliminar el trabajo completo (función existente) borra sus líneas en cascada.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ declare j uuid := (select v::uuid from prueba.memo where k = 't1_job'); n integer; begin
  delete from public.jobs where id = j;
  select count(*) into n from public.job_cargo_items where job_id = j;
  if n <> 0 then raise exception 'FALLA T13: quedaron % líneas', n; end if;
  raise notice 'OK T13 borrar el trabajo completo borra sus líneas (caso documentado, distinto de alterarlas)';
end $$;
commit;
