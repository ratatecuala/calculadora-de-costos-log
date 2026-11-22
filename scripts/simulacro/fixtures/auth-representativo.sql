-- PRUEBA DEL SIMULACRO (A-77): un esquema auth REPRESENTATIVO del de Supabase para el ORIGEN ficticio.
-- No es una copia de staging ni de Supabase: reproduce, de la estructura pública de Supabase Auth, lo
-- que hace incompatible al stub mínimo (muchas columnas, columnas generadas, jsonb, timestamptz,
-- booleanos, varchar). Solo para ensayos locales con datos ficticios.
create table auth.users (
  instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255), email varchar(255),
  encrypted_password varchar(255), email_confirmed_at timestamptz, invited_at timestamptz,
  confirmation_token varchar(255), confirmation_sent_at timestamptz, recovery_token varchar(255),
  recovery_sent_at timestamptz, email_change_token_new varchar(255), email_change varchar(255),
  email_change_sent_at timestamptz, last_sign_in_at timestamptz, raw_app_meta_data jsonb,
  raw_user_meta_data jsonb, is_super_admin boolean, created_at timestamptz, updated_at timestamptz,
  phone text unique default null, phone_confirmed_at timestamptz, phone_change text default '',
  phone_change_token varchar(255) default '', phone_change_sent_at timestamptz,
  confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
  email_change_token_current varchar(255) default '', email_change_confirm_status smallint default 0,
  banned_until timestamptz, reauthentication_token varchar(255) default '', reauthentication_sent_at timestamptz,
  is_sso_user boolean not null default false, deleted_at timestamptz, is_anonymous boolean not null default false
);
create table auth.identities (
  provider_id text not null, user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null, provider text not null, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  email text generated always as (lower(identity_data ->> 'email')) stored,
  id uuid not null default gen_random_uuid() primary key
);
-- Tablas internas que el modo `cli` (supabase db dump) también vuelca y la app no usa.
create table auth.sessions (id uuid primary key, user_id uuid not null, created_at timestamptz, aal text);
create table auth.refresh_tokens (id bigserial primary key, token varchar(255), user_id varchar(255), revoked boolean, session_id uuid);
create schema if not exists storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false);
