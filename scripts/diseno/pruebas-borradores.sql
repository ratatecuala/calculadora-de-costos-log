-- HERRAMIENTA DE DISEÑO (#45). Pruebas de los borradores M3 y M4 sobre un PostgreSQL LOCAL
-- desechable, con TODAS las migraciones reales del repositorio (incluida la de #52, 20261122120000)
-- y el stub de Supabase.
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

-- Rol de prueba LOCAL (A-74): con D-52-2/D-52-3, authenticated ya no llega a private.insert_cargo_items,
-- así que las capas internas de M3 (marca, transacción, sin líneas previas) se prueban con este rol, que
-- sí tiene EXECUTE. Solo existe en el PostgreSQL local desechable.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'prueba_capas') then create role prueba_capas nologin; end if;
end $$;
grant usage on schema prueba to prueba_capas;
grant execute on all functions in schema prueba to prueba_capas;
grant usage on schema private to prueba_capas;
grant execute on function private.insert_cargo_items(uuid, jsonb) to prueba_capas;

-- Tabla de apoyo para recordar ids entre transacciones (solo superusuario).
create table prueba.memo (k text primary key, v text);
grant select, insert on prueba.memo to authenticated;
grant select on prueba.memo to prueba_capas;

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
set local role prueba_capas;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare j uuid := (select v::uuid from prueba.memo where k = 't1_job'); msg text;
begin
  perform private.insert_cargo_items(j, prueba.items(1));
  raise exception 'FALLA T6: se agregaron líneas a una cotización emitida';
exception when insufficient_privilege then
  get stacked diagnostics msg = message_text;
  if msg ilike 'permission denied%' then raise exception 'FALLA T6: rechazado por permisos, no por la capa de M3 (%)', msg; end if;
  raise notice 'OK T6 no se agregan líneas a una cotización emitida (capa de M3: «%»)', msg;
end $$;
commit;

-- T6d (#52, A-74) · Capa de permisos de D-52-2/D-52-3: authenticated no puede llamar a la función
--       privada (sin USAGE en private ni EXECUTE).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare j uuid := (select v::uuid from prueba.memo where k = 't1_job'); msg text;
begin
  perform private.insert_cargo_items(j, prueba.items(1));
  raise exception 'FALLA T6d: authenticated llamó a la función privada';
exception when insufficient_privilege then
  get stacked diagnostics msg = message_text;
  if msg not ilike 'permission denied%' then raise exception 'FALLA T6d: se esperaba un rechazo por permisos (%)', msg; end if;
  raise notice 'OK T6d authenticated no llega a private.insert_cargo_items (D-52-2/D-52-3: «%»)', msg;
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
set local role prueba_capas;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare j uuid := (select v::uuid from prueba.memo where k = 't6b_job'); msg text;
begin
  perform private.insert_cargo_items(j, prueba.items(1));
  raise exception 'FALLA T6b: se agregaron líneas a una cotización emitida sin líneas';
exception when insufficient_privilege then
  get stacked diagnostics msg = message_text;
  if msg ilike 'permission denied%' then raise exception 'FALLA T6b: rechazado por permisos, no por la capa de M3 (%)', msg; end if;
  raise notice 'OK T6b no se agregan líneas a una cotización emitida sin líneas (capa de M3: «%»)', msg;
end $$;
commit;

-- T6c (reescrita con #52, A-74) · (1) el INSERT directo en jobs ya no es posible: la migración
--       20261122120000 lo revoca (42501). (2) La capa «marca de transacción» de M3 sigue: un trabajo
--       creado SIN el guardado v2 (aquí por el superusuario, en la misma transacción) no recibe líneas.
--       T6c-2 usa el rol de prueba prueba_capas (con EXECUTE) y exige que el rechazo venga de la marca,
--       no de los permisos; la capa de permisos de D-52-2/D-52-3 se prueba aparte en T6d.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  insert into public.jobs (owner_id, number, issued_number, quote_date, client_name, net_price, internal)
    values ('00000000-0000-0000-0000-00000000000a', 999999, 999999, '2026-11-20', 'Directo', 1000, '{}'::jsonb);
  raise exception 'FALLA T6c-1: INSERT directo aceptado';
exception when insufficient_privilege then raise notice 'OK T6c-1 INSERT directo en jobs rechazado (#52)';
end $$;
reset role;
insert into public.jobs (id, owner_id, number, issued_number, quote_date, client_name, net_price, internal)
  values ('99999999-9999-4999-8999-999999999999', '00000000-0000-0000-0000-00000000000a', 999999, 999999, '2026-11-20', 'Sin v2', 1000, '{}'::jsonb);
set local role prueba_capas;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ declare msg text; begin
  perform private.insert_cargo_items('99999999-9999-4999-8999-999999999999', prueba.items(1));
  raise exception 'FALLA T6c-2: líneas insertadas sin pasar por el guardado v2';
exception when insufficient_privilege then
  get stacked diagnostics msg = message_text;
  if msg not ilike '%create_job_with_quote_v2%' then raise exception 'FALLA T6c-2: no lo detuvo la marca de M3 (%)', msg; end if;
  raise notice 'OK T6c-2 sin la marca del guardado v2 no se insertan líneas (capa de M3: «%»)', msg;
end $$;
rollback;


-- T15 · Volumen «calculado» incoherente con las dimensiones: rechazado y nada se guarda.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare jobs_antes integer; jobs_despues integer;
begin
  select count(*) into jobs_antes from public.jobs;
  begin
    perform public.create_job_with_quote_v2(prueba.job(), prueba.quote(),
      jsonb_build_array(jsonb_build_object('kind', 'cajas', 'description', 'Caja', 'qty', 1,
        'dimsCm', jsonb_build_object('l', 50, 'w', 40, 'h', 40), 'volumeM3', 1.0, 'volumeSource', 'calculado')));
    raise exception 'FALLA T15: volumen calculado incoherente aceptado';
  exception when check_violation then null;
  end;
  select count(*) into jobs_despues from public.jobs;
  if jobs_despues <> jobs_antes then raise exception 'FALLA T15: quedó un trabajo'; end if;
  raise notice 'OK T15 volumen calculado incoherente rechazado (50×40×40 cm ≠ 1,0 m³)';
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
