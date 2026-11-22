-- SIMULACRO DE RESTAURACIÓN LOCAL (docs/25, A-77). Base mínima tipo Supabase para una base LOCAL y
-- desechable. Nunca se aplica a Supabase.
--
-- Reproduce lo que las migraciones del proyecto necesitan de Supabase:
--   * roles anon, authenticated y service_role;
--   * esquema auth con auth.uid() (lee el claim `sub`, como Supabase);
--   * esquema extensions con pgcrypto (gen_random_bytes y digest);
--   * los privilegios por defecto de Supabase en public (docs/17 §2, fila 10): ALL para anon,
--     authenticated y service_role sobre tablas, funciones y secuencias nuevas. Las migraciones los
--     revocan de forma explícita, igual que en Supabase.
-- Las tablas auth.users y auth.identities NO se crean aquí: las crea procesar-respaldo.py con las
-- MISMAS columnas que trae el respaldo (así sus datos se pueden cargar tal cual).
\set ON_ERROR_STOP 1
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
