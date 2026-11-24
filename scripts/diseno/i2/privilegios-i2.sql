-- I-2 (A-81): privilegios y propiedades de M3′/M4′ REALES. Cada aserción imprime «OK …» o detiene con
-- «FALLA …». Solo PostgreSQL local desechable.
\set ON_ERROR_STOP 1
do $$
declare
  r record;
  v text;
begin
  -- P1 · v2 es SECURITY DEFINER con search_path vacío; la función privada también.
  for r in select n.nspname || '.' || p.proname as f, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname, p.proname) in (('public', 'create_job_with_quote_v2'), ('private', 'insert_cargo_items')) loop
    if not r.prosecdef then raise exception 'FALLA P1: % no es SECURITY DEFINER', r.f; end if;
    if not ('search_path=""' = any(r.proconfig)) then raise exception 'FALLA P1: % sin search_path vacío (%)', r.f, r.proconfig; end if;
  end loop;
  raise notice 'OK P1 create_job_with_quote_v2 y private.insert_cargo_items: SECURITY DEFINER y search_path vacío';

  -- P2 · EXECUTE de la v2: solo authenticated (ni anon, ni service_role, ni PUBLIC).
  if not has_function_privilege('authenticated', 'public.create_job_with_quote_v2(jsonb,jsonb,jsonb)', 'execute') then raise exception 'FALLA P2: authenticated sin EXECUTE en la v2'; end if;
  foreach v in array array['anon', 'service_role'] loop
    if has_function_privilege(v, 'public.create_job_with_quote_v2(jsonb,jsonb,jsonb)', 'execute') then raise exception 'FALLA P2: % puede ejecutar la v2', v; end if;
  end loop;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where p.oid = 'public.create_job_with_quote_v2(jsonb,jsonb,jsonb)'::regprocedure and a.grantee = 0) then
    raise exception 'FALLA P2: PUBLIC puede ejecutar la v2'; end if;
  raise notice 'OK P2 la v2 solo la ejecuta authenticated (no anon, service_role ni PUBLIC)';

  -- P3 · Nadie fuera del dueño llega a la función privada (D-52-3), ni al esquema private (D-52-2).
  foreach v in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v, 'private.insert_cargo_items(uuid,jsonb)', 'execute') then raise exception 'FALLA P3: % puede ejecutar private.insert_cargo_items', v; end if;
  end loop;
  if has_schema_privilege('authenticated', 'private', 'usage') then raise exception 'FALLA P3: authenticated tiene USAGE en private'; end if;
  raise notice 'OK P3 anon, authenticated y service_role no ejecutan private.insert_cargo_items; authenticated sin USAGE en private';

  -- P4 · Tabla: RLS activa; authenticated solo SELECT; anon y service_role nada; una sola política de lectura.
  if not (select relrowsecurity from pg_class where oid = 'public.job_cargo_items'::regclass) then raise exception 'FALLA P4: sin RLS'; end if;
  select string_agg(privilege_type, ',' order by privilege_type) into v from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'job_cargo_items' and grantee = 'authenticated';
  if v is distinct from 'SELECT' then raise exception 'FALLA P4: authenticated tiene %', v; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'job_cargo_items' and grantee in ('anon', 'service_role', 'PUBLIC')) then
    raise exception 'FALLA P4: anon, service_role o PUBLIC tienen privilegios en job_cargo_items'; end if;
  select string_agg(policyname || ':' || cmd, ' ') into v from pg_policies where schemaname = 'public' and tablename = 'job_cargo_items';
  if v is distinct from 'job_cargo_items_select:SELECT' then raise exception 'FALLA P4: políticas %', v; end if;
  raise notice 'OK P4 job_cargo_items: RLS activa, authenticated solo SELECT con la política del dueño, anon y service_role sin privilegios';

  -- P5 · #52 intacta: la v1 sigue DEFINER y sin INSERT directo en jobs.
  if not (select prosecdef from pg_proc where oid = 'public.create_job_with_quote(jsonb,jsonb)'::regprocedure) then raise exception 'FALLA P5: la v1 dejó de ser DEFINER'; end if;
  if has_table_privilege('authenticated', 'public.jobs', 'insert') then raise exception 'FALLA P5: INSERT directo en jobs'; end if;
  raise notice 'OK P5 #52 intacta: v1 SECURITY DEFINER y sin INSERT directo en jobs';
end $$;
