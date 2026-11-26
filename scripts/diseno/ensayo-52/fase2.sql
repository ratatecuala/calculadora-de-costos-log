-- HERRAMIENTA DE DISEÑO (#52, docs/23 §11). FASE 2: comprobaciones S0–S7 sobre la migración REAL
-- supabase/migrations/20261122120000_guardado_unico_y_contador.sql, ya aplicada por ensayar.sh.
-- Solo PostgreSQL local desechable. Requiere los datos de fase1.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
\echo '--- FASE 2 (migración real 20261122120000 aplicada) ---'
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
  -- N1 (A-72): la importación del N° 40 no movió el contador (va en 1), así que el conflicto recibe el
  -- interno 2 (contador + 1) y conserva el emitido 40. Con la función anterior habría sido el 41.
  if (r3 ->> 'number')::int <> 2 or (r3 ->> 'issued_number')::int <> 40 then raise exception 'FALLA S4 conflicto: %', r3; end if;
  raise notice 'OK S4 importación: N° 40 conservado; repetida → NULL; conflicto → interno 2 (contador + 1, N1) y emitido 40';
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
