-- VERIFICACIONES DE SOLO LECTURA para #52 · VERSIÓN PARA EL EDITOR SQL DE SUPABASE (SQL puro).
-- PREPARADAS, NO EJECUTADAS EN SUPABASE (A-74). Solo cuando el propietario lo autorice y DESPUÉS del
-- respaldo real (A-52, A-59).
--
-- Cómo usarla: pegar el archivo COMPLETO en el editor SQL de Supabase y ejecutarlo una vez. No contiene
-- metaórdenes de psql (\set, \pset, \echo).
--   * Está pensada para enviarse como UNA sola consulta, que es como se entiende que el editor ejecuta el
--     texto (esto no se pudo comprobar en el editor real porque no se tocó Supabase): la primera
--     sentencia fija la transacción implícita en SOLO LECTURA y la segunda es UNA única consulta que
--     devuelve todas las verificaciones como filas (verificacion, resultado). Así el editor, que muestra
--     el resultado de la última sentencia, las muestra todas juntas.
--   * SOLO INFORMATIVA (A-77). No se sabe si el editor ejecuta la primera línea en la misma transacción,
--     así que V17 puede salir `off`. La VERIFICACIÓN FORMAL es la vía psql (solo-lectura.sql, docs/25
--     paso 3.1), con V17 = `on`. Si el editor rechaza `set transaction read only` o V17 no es `on`, usa la
--     vía psql: NO borres esa línea. Las consultas solo leen catálogos y cuentan filas.
--   * Devuelve CONTEOS, máximos y configuración: nunca ids de cuentas ni correos. Pegar el resultado en #52.
--   * Ningún hallazgo se repara automáticamente (D-52-4b, A-72).
-- Probada en local con `psql -c "$(cat …)"` (una sola consulta, como el editor) y con la versión psql
-- (solo-lectura.sql, que incluye este mismo archivo): mismos resultados y una escritura en la misma
-- transacción falla (scripts/diseno/verificaciones-52/probar.sh).
set transaction read only;
select verificacion, resultado
from (
  select 1 as orden, 'V1 · Dueños de las tablas (el dueño de la función DEFINER debe ser el dueño de las tablas)' as verificacion, row_to_json(x)::text as resultado
  from (
select c.relname as tabla, pg_get_userbyid(c.relowner) as dueno, c.relrowsecurity as rls, c.relforcerowsecurity as rls_forzada
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('jobs', 'client_quotes', 'quote_counters', 'quote_shares')
order by 1
  ) x
  union all
  select 2 as orden, 'V2 · Funciones de guardado y numeración: dueño, DEFINER, search_path y sobrecargas' as verificacion, row_to_json(x)::text as resultado
  from (
select n.nspname || '.' || p.proname as funcion, pg_get_function_identity_arguments(p.oid) as argumentos,
       pg_get_userbyid(p.proowner) as dueno, p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '(sin configuración)') as config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (('public', 'create_job_with_quote'), ('public', 'create_job_with_quote_v2'),
                                 ('private', 'allocate_quote_number'), ('private', 'insert_cargo_items'))
order by 1, 2
  ) x
  union all
  select 3 as orden, 'V3 · ¿El dueño de las tablas puede saltarse RLS? (dueño de tabla o BYPASSRLS)' as verificacion, row_to_json(x)::text as resultado
  from (
select r.rolname as rol, r.rolsuper as superusuario, r.rolbypassrls as bypassrls
from pg_roles r
where r.rolname in (select distinct pg_get_userbyid(relowner) from pg_class
                    where relnamespace = 'public'::regnamespace and relname in ('jobs', 'client_quotes'))
order by 1
  ) x
  union all
  select 4 as orden, 'V4 · Privilegios de anon, authenticated y service_role sobre las tablas' as verificacion, row_to_json(x)::text as resultado
  from (
select t.tabla, r.rol,
       has_table_privilege(r.rol, 'public.' || t.tabla, 'SELECT') as sel,
       has_table_privilege(r.rol, 'public.' || t.tabla, 'INSERT') as ins,
       has_table_privilege(r.rol, 'public.' || t.tabla, 'UPDATE') as upd,
       has_table_privilege(r.rol, 'public.' || t.tabla, 'DELETE') as del
from (values ('jobs'), ('client_quotes'), ('quote_counters')) t(tabla)
cross join (values ('anon'), ('authenticated'), ('service_role')) r(rol)
order by 1, 2
  ) x
  union all
  select 5 as orden, 'V5a · EXECUTE sobre las funciones y USAGE del esquema private' as verificacion, row_to_json(x)::text as resultado
  from (
select p.oid::regprocedure as funcion, r.rol, has_function_privilege(r.rol, p.oid, 'EXECUTE') as execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated'), ('service_role')) r(rol)
where (n.nspname, p.proname) in (('public', 'create_job_with_quote'), ('public', 'create_job_with_quote_v2'),
                                 ('private', 'allocate_quote_number'), ('private', 'insert_cargo_items'))
order by 1, 2
  ) x
  union all
  select 6 as orden, 'V5b · EXECUTE sobre las funciones y USAGE del esquema private' as verificacion, row_to_json(x)::text as resultado
  from (
select r.rol, has_schema_privilege(r.rol, 'private', 'USAGE') as usage_private
from (values ('anon'), ('authenticated'), ('service_role')) r(rol)
where exists (select 1 from pg_namespace where nspname = 'private')
order by 1
  ) x
  union all
  select 7 as orden, 'V6 · Privilegios por defecto que darían EXECUTE a funciones NUEVAS (revocar explícitamente en la migración)' as verificacion, row_to_json(x)::text as resultado
  from (
select pg_get_userbyid(d.defaclrole) as rol_creador, coalesce(n.nspname, '(todos)') as esquema,
       case d.defaclobjtype when 'f' then 'funciones' when 'r' then 'tablas' else d.defaclobjtype::text end as objetos,
       d.defaclacl::text as privilegios
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
where d.defaclobjtype in ('f', 'r')
order by 1, 2, 3
  ) x
  union all
  select 8 as orden, 'V7 · Políticas RLS existentes en jobs y client_quotes' as verificacion, row_to_json(x)::text as resultado
  from (
select tablename as tabla, policyname as politica, cmd as operacion, roles::text as roles
from pg_policies where schemaname = 'public' and tablename in ('jobs', 'client_quotes')
order by 1, 3, 2
  ) x
  union all
  select 9 as orden, 'V8 · Esquemas expuestos por la Data API (no debe aparecer private). Sin fila: revisar el panel' as verificacion, row_to_json(x)::text as resultado
  from (
select r.rolname as rol, cfg as configuracion
from pg_roles r, unnest(coalesce(r.rolconfig, '{}')) as cfg
where r.rolname = 'authenticator' and cfg ilike 'pgrst.db_schemas%'
  ) x
  union all
  select 10 as orden, 'V9 · Disparadores de jobs y client_quotes (correrían como el dueño dentro del DEFINER)' as verificacion, row_to_json(x)::text as resultado
  from (
select c.relname as tabla, g.tgname as disparador, p.oid::regprocedure as funcion, p.prosecdef as definer,
       (g.tgtype & 4) <> 0 as en_insert, (g.tgtype & 16) <> 0 as en_update
from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_proc p on p.oid = g.tgfoid
where c.relname in ('jobs', 'client_quotes') and c.relnamespace = 'public'::regnamespace and not g.tgisinternal
order by 1, 2
  ) x
  union all
  select 11 as orden, 'V10 · Contadores: inflados (≥ 2.000.000.000), en el máximo, máximo y total (CONTEOS, sin ids)' as verificacion, row_to_json(x)::text as resultado
  from (
select count(*) filter (where last_number >= 2000000000) as contadores_inflados,
       count(*) filter (where last_number = 2147483647) as contadores_en_el_maximo,
       max(last_number) as contador_maximo, count(*) as contadores
from public.quote_counters
  ) x
  union all
  select 12 as orden, 'V11 · Cuentas con trabajos y SIN contador (deberían ser 0)' as verificacion, row_to_json(x)::text as resultado
  from (
select count(distinct j.owner_id) as cuentas_sin_contador
from public.jobs j where not exists (select 1 from public.quote_counters c where c.owner_id = j.owner_id)
  ) x
  union all
  select 13 as orden, 'V12 · Contadores por debajo del mayor número interno de su cuenta (con N1 es normal tras importar; hoy no debería ocurrir)' as verificacion, row_to_json(x)::text as resultado
  from (
select count(*) as contadores_bajo_su_maximo
from public.quote_counters c
join (select owner_id, max(number) as m from public.jobs group by owner_id) j using (owner_id)
where c.last_number < j.m
  ) x
  union all
  select 14 as orden, 'V13 · Números internos o emitidos ≥ 2.000.000.000 (posibles importaciones anómalas)' as verificacion, row_to_json(x)::text as resultado
  from (
select count(*) filter (where number >= 2000000000) as internos_altos,
       count(*) filter (where issued_number >= 2000000000) as emitidos_altos
from public.jobs
  ) x
  union all
  select 15 as orden, 'V14 · Trabajos sin cotización al cliente (huérfanos, p. ej., restos de INSERT directo; H2)' as verificacion, row_to_json(x)::text as resultado
  from (
select count(*) as trabajos_sin_cotizacion
from public.jobs j where not exists (select 1 from public.client_quotes q where q.job_id = j.id and q.owner_id = j.owner_id)
  ) x
  union all
  select 16 as orden, 'V15 · Cotización al cliente con un número distinto del emitido del trabajo (posible H3)' as verificacion, row_to_json(x)::text as resultado
  from (
select count(*) as documentos_con_numero_distinto
from public.jobs j join public.client_quotes q on q.job_id = j.id and q.owner_id = j.owner_id
where q.number <> j.issued_number
  ) x
  union all
  select 17 as orden, 'V16 · Números emitidos repetidos dentro de una cuenta (A-47 los permite SOLO por importación)' as verificacion, row_to_json(x)::text as resultado
  from (
select count(*) as grupos_repetidos,
       coalesce(sum(n), 0) as trabajos_involucrados,
       count(*) filter (where nuevas > 1) as grupos_con_mas_de_una_nueva
from (select owner_id, issued_number, count(*) as n, count(*) filter (where local_id is null) as nuevas
      from public.jobs group by owner_id, issued_number having count(*) > 1) g
  ) x
  union all
  select 18 as orden, 'V17 · Comprobación de modo solo lectura (debe decir «on»)' as verificacion, row_to_json(x)::text as resultado
  from (
select current_setting('transaction_read_only') as transaction_read_only
  ) x
) t
order by orden, resultado;
