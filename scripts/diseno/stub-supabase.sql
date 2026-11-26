-- HERRAMIENTA DE DISEÑO (#45). Stub mínimo de Supabase para ensayar migraciones en un PostgreSQL
-- LOCAL y desechable. Nunca se aplica a Supabase.
--
-- Simula: roles anon/authenticated/service_role, esquema auth con users y auth.uid() (lee el
-- claim `sub` como lo hace Supabase), esquema extensions y los permisos básicos de public.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists extensions;
create table if not exists auth.users (id uuid primary key, email text);

create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
