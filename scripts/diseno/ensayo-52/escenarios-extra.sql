-- HERRAMIENTA DE DISEÑO (#52, docs/23 v3 §7). Escenarios adicionales sobre la propuesta (D-52-1 + N1),
-- en PostgreSQL LOCAL desechable. Nunca se aplica a Supabase. Cada prueba imprime «OK …» o «INFO …»
-- (resultado medido o documentado, no aprobado/fallado) o se detiene con «FALLA …».
-- Usuarios ficticios nuevos: F = …0f, G = …10, H = …11.
\set ON_ERROR_STOP 1
\set QUIET 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000f', 'f@prueba.invalid'),
  ('00000000-0000-0000-0000-000000000010', 'g@prueba.invalid'),
  ('00000000-0000-0000-0000-000000000011', 'h@prueba.invalid');

-- X1 (L11) · Cuenta con el contador YA inflado al máximo (estado que hoy deja H4). N1 no rebaja
--      contadores existentes: la siguiente cotización sigue fallando, sin escribir nada. Una reparación
--      MANUAL y autorizada (D-52-4b) la desbloquearía; aquí solo se simula para documentarlo.
insert into public.quote_counters (owner_id, last_number) values ('00000000-0000-0000-0000-00000000000f', 2147483647);
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', true);
do $$ begin
  perform public.create_job_with_quote(prueba.job(), prueba.quote());
  raise exception 'FALLA X1: N1 desbloqueó solo un contador inflado';
exception when numeric_value_out_of_range then
  if exists (select 1 from public.jobs where owner_id = '00000000-0000-0000-0000-00000000000f') then raise exception 'FALLA X1: quedó un trabajo'; end if;
  raise notice 'OK X1 (L11) contador ya inflado al máximo: N1 por sí sola NO desbloquea la cuenta (error 22003, nada escrito). Requiere D-52-4b';
end $$;
commit;
do $$ declare r jsonb; begin
  -- Simulación de una reparación manual autorizada (D-52-4b): solo para documentar el efecto.
  update public.quote_counters set last_number = 0 where owner_id = '00000000-0000-0000-0000-00000000000f';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000f', true);
  r := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (r ->> 'number')::int <> 1 then raise exception 'FALLA X1b: %', r; end if;
  raise notice 'INFO X1b una reparación manual simulada (contador a 0) desbloquea la cuenta: siguiente N° 1. Solo con D-52-4b y caso a caso';
end $$;

-- X2 · Rendimiento del bucle de saltos: 10.000 números importados contiguos (1…10.000) en una cuenta
--      con contador nuevo. Se mide la primera cotización nueva (recorre el bloque) y la siguiente.
insert into public.jobs (owner_id, local_id, number, issued_number, quote_date, client_name, net_price, internal)
  select '00000000-0000-0000-0000-000000000010', gen_random_uuid(), i, i, '2026-11-22', 'Importada ' || i, 1000, '{}'::jsonb
  from generate_series(1, 10000) as i;
analyze public.jobs;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000010', true);
do $$ declare t0 timestamptz; r1 jsonb; r2 jsonb; r3 jsonb; ms1 numeric; ms2 numeric; ms3 numeric; begin
  t0 := clock_timestamp(); r1 := public.create_job_with_quote(prueba.job(), prueba.quote()); ms1 := extract(epoch from clock_timestamp() - t0) * 1000;
  t0 := clock_timestamp(); r2 := public.create_job_with_quote(prueba.job(), prueba.quote()); ms2 := extract(epoch from clock_timestamp() - t0) * 1000;
  t0 := clock_timestamp(); r3 := public.create_job_with_quote(prueba.job(gen_random_uuid(), 50000), prueba.quote()); ms3 := extract(epoch from clock_timestamp() - t0) * 1000;
  if (r1 ->> 'number')::int <> 10001 or (r2 ->> 'number')::int <> 10002 or (r3 ->> 'number')::int <> 50000 then raise exception 'FALLA X2: % % %', r1, r2, r3; end if;
  raise notice 'OK X2 10.000 importados contiguos: 1.ª nueva = N° 10.001, 2.ª = N° 10.002, importación libre = N° 50.000';
  raise notice 'INFO X2 tiempos medidos en local: 1.ª nueva % ms (recorre el bloque una vez) · 2.ª nueva % ms · importación % ms', round(ms1, 1), round(ms2, 1), round(ms3, 1);
end $$;
commit;

-- X3 · Privilegios por defecto (Supabase suele tener ALTER DEFAULT PRIVILEGES que dan EXECUTE a anon y
--      authenticated sobre funciones NUEVAS en public). Se simula y se comprueba que:
--      (a) una función nueva queda ejecutable por anon si no se revoca explícitamente;
--      (b) el `revoke all … from public, anon` del plan la cierra;
--      (c) CREATE OR REPLACE CONSERVA los privilegios existentes (no los reabre ni los cierra).
reset role;
alter default privileges in schema public grant execute on functions to anon, authenticated;
create function public.prueba_nueva_x3() returns int language sql security definer set search_path = '' as $$ select 1 $$;
do $$ begin
  if not has_function_privilege('anon', 'public.prueba_nueva_x3()', 'execute') then raise exception 'FALLA X3a: la simulación no dio EXECUTE a anon'; end if;
  raise notice 'OK X3a con privilegios por defecto, una función NUEVA queda ejecutable por anon si no se revoca';
end $$;
revoke all on function public.prueba_nueva_x3() from public, anon;
create or replace function public.prueba_nueva_x3() returns int language sql security definer set search_path = '' as $$ select 2 $$;
do $$ begin
  if has_function_privilege('anon', 'public.prueba_nueva_x3()', 'execute') then raise exception 'FALLA X3b/c: anon recuperó EXECUTE'; end if;
  if not has_function_privilege('authenticated', 'public.prueba_nueva_x3()', 'execute') then raise exception 'FALLA X3c: authenticated perdió EXECUTE'; end if;
  raise notice 'OK X3b/c el revoke explícito cierra a anon, y CREATE OR REPLACE conserva los privilegios (anon sigue sin EXECUTE; authenticated lo mantiene)';
end $$;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
drop function public.prueba_nueva_x3();

-- X4 · Sombreado: un usuario con sesión crea en su sesión una tabla temporal «jobs» y una función
--      pg_temp.gen_random_uuid(). Con search_path vacío y referencias calificadas, el guardado DEFINER
--      escribe en public.jobs y usa pg_catalog.gen_random_uuid(). Además, no puede crear sobrecargas en public.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
create temp table jobs (id uuid, number int);
create function pg_temp.gen_random_uuid() returns uuid language sql as $$ select '00000000-0000-4000-8000-0000000000ff'::uuid $$;
do $$ declare r jsonb; begin
  r := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (r ->> 'id')::uuid = '00000000-0000-4000-8000-0000000000ff' then raise exception 'FALLA X4: usó la función temporal'; end if;
  if not exists (select 1 from public.jobs where id = (r ->> 'id')::uuid) then raise exception 'FALLA X4: no escribió en public.jobs'; end if;
  if exists (select 1 from pg_temp.jobs) then raise exception 'FALLA X4: escribió en la tabla temporal'; end if;
  raise notice 'OK X4 tabla temporal «jobs» y pg_temp.gen_random_uuid() sin efecto: el guardado escribe en public.jobs con un id aleatorio';
end $$;
do $$ begin
  execute 'create function public.create_job_with_quote(p jsonb, q text) returns int language sql as $b$ select 1 $b$';
  raise exception 'FALLA X4b: authenticated creó una sobrecarga en public';
exception when insufficient_privilege then raise notice 'OK X4b authenticated no puede crear sobrecargas ni objetos en public (42501)';
end $$;
rollback;

-- X5 · service_role (BYPASSRLS) no tiene EXECUTE sobre la función de guardado, y aunque lo tuviera,
--      sin auth.uid() el guardado se niega. Los scripts de administración no pueden «guardar como nadie».
do $$ begin
  if has_function_privilege('service_role', 'public.create_job_with_quote(jsonb, jsonb)', 'execute') then raise exception 'FALLA X5: service_role tiene EXECUTE'; end if;
  raise notice 'OK X5 service_role sin EXECUTE sobre create_job_with_quote';
end $$;

-- X6 · Mensajes de error: el choque con el id de un trabajo ajeno solo informa el nombre de la
--      restricción, sin datos del otro trabajo.
do $$ declare ajeno uuid := (select id from public.jobs where owner_id = '00000000-0000-0000-0000-000000000010' order by number limit 1); msg text; det text; begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
  begin
    perform public.create_job_with_quote(prueba.job(null, null, ajeno), prueba.quote());
    raise exception 'FALLA X6: aceptó el id ajeno';
  exception when unique_violation then
    get stacked diagnostics msg = message_text, det = pg_exception_detail;
  end;
  if det ilike '%Importada%' or det ilike '%' || '00000000-0000-0000-0000-000000000010' || '%' then raise exception 'FALLA X6: el detalle expone datos ajenos: %', det; end if;
  raise notice 'INFO X6 mensaje: «%»; detalle: «%». Solo repite el id que envió el propio usuario (no expone dueño ni contenido)', msg, det;
end $$;

-- X7 · Disparadores que se ejecutarían como el dueño dentro del DEFINER: se listan los de jobs y
--      client_quotes con su función, para revisarlos en el plan.
do $$ declare t record; n int := 0; begin
  for t in select c.relname as tabla, g.tgname as disparador, p.proname as funcion, p.prosecdef as definer,
                  coalesce(array_to_string(p.proconfig, ','), '(sin search_path)') as cfg,
                  (g.tgtype & 4) <> 0 as en_insert
           from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_proc p on p.oid = g.tgfoid
           where c.relname in ('jobs', 'client_quotes') and not g.tgisinternal loop
    n := n + 1;
    raise notice 'INFO X7 disparador %.% → %() · definer=% · % · se dispara en INSERT=%', t.tabla, t.disparador, t.funcion, t.definer, t.cfg, t.en_insert;
  end loop;
  if exists (select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
             where c.relname in ('jobs', 'client_quotes') and not g.tgisinternal and (g.tgtype & 4) <> 0) then
    raise exception 'FALLA X7: hay disparadores en INSERT que correrían como el dueño; revisarlos antes de migrar';
  end if;
  raise notice 'OK X7 % disparadores en jobs/client_quotes, ninguno en INSERT (solo updated_at en UPDATE)', n;
end $$;
