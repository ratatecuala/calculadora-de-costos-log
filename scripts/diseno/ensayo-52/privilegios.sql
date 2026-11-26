-- HERRAMIENTA DE DISEÑO (#52, docs/23 §11). Comprobación de privilegios tras la migración REAL
-- 20261122120000 (S0c). ensayar.sh la corre tras aplicarla y otra vez tras aplicarla de nuevo (S9).
\set ON_ERROR_STOP 1
\set QUIET 1
-- S0c · D-52-2 y privilegios explícitos: authenticated sin USAGE en private ni EXECUTE sobre la
--       asignación; anon y service_role sin EXECUTE sobre el guardado ni sobre la asignación; PUBLIC
--       sin EXECUTE; authenticated conserva EXECUTE sobre el guardado; las tablas sin INSERT directo.
do $$ begin
  if has_schema_privilege('authenticated', 'private', 'usage') then raise exception 'FALLA S0c: authenticated conserva USAGE en private'; end if;
  if has_function_privilege('authenticated', 'private.allocate_quote_number(integer)', 'execute') then raise exception 'FALLA S0c: authenticated puede ejecutar la asignación'; end if;
  if has_function_privilege('anon', 'private.allocate_quote_number(integer)', 'execute')
     or has_function_privilege('service_role', 'private.allocate_quote_number(integer)', 'execute') then raise exception 'FALLA S0c: anon o service_role pueden ejecutar la asignación'; end if;
  if has_function_privilege('service_role', 'public.create_job_with_quote(jsonb, jsonb)', 'execute') then raise exception 'FALLA S0c: service_role puede ejecutar el guardado'; end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where p.oid in ('public.create_job_with_quote(jsonb, jsonb)'::regprocedure, 'private.allocate_quote_number(integer)'::regprocedure)
               and a.grantee = 0 and a.privilege_type = 'EXECUTE') then raise exception 'FALLA S0c: PUBLIC tiene EXECUTE'; end if;
  if not has_function_privilege('authenticated', 'public.create_job_with_quote(jsonb, jsonb)', 'execute') then raise exception 'FALLA S0c: authenticated perdió el guardado'; end if;
  if has_table_privilege('authenticated', 'public.jobs', 'insert') or has_table_privilege('authenticated', 'public.client_quotes', 'insert')
     or has_table_privilege('authenticated', 'public.client_quotes', 'delete') then raise exception 'FALLA S0c: queda escritura directa'; end if;
  if not has_table_privilege('authenticated', 'public.jobs', 'delete') or not has_column_privilege('authenticated', 'public.jobs', 'status', 'update') then raise exception 'FALLA S0c: se perdió el borrado del trabajo o el cambio de estado'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and policyname in ('jobs_insert', 'client_quotes_insert', 'client_quotes_update', 'client_quotes_delete')) then raise exception 'FALLA S0c: quedan políticas sobrantes'; end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'jobs_owner_issued_idx') then raise exception 'FALLA S0c: falta el índice jobs_owner_issued_idx'; end if;
  raise notice 'OK S0c privilegios: authenticated sin private; anon, service_role y PUBLIC sin EXECUTE; sin escritura directa; se conservan borrado y estado; sin políticas sobrantes; índice presente';
end $$;

