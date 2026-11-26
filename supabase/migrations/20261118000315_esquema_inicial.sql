-- Calculadora de fletes — esquema inicial (issue #35, docs/02 §8.4).
--
-- Principios:
-- * Cada fila tiene dueño (`owner_id` = auth.uid()). RLS en TODAS las tablas.
-- * `jobs` guarda los costos internos; `client_quotes` SOLO los campos que ve el cliente
--   (misma lista blanca que `CLIENT_QUOTE_KEYS` en src/shared/clientQuote.ts).
-- * El público nunca lee tablas: solo la función `get_public_quote(token)`.
-- * GRANT mínimos y explícitos: `anon` no tiene acceso a ninguna tabla.
-- * Ningún dato de combustible, rendimiento, desgaste, margen ni costo en `client_quotes`.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilidad: fecha de actualización
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles: datos comerciales del transportista (emisor) y preferencias
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_name text not null default '' check (char_length(business_name) <= 80),
  business_phone text not null default '' check (char_length(business_phone) <= 30),
  business_email text not null default '' check (char_length(business_email) <= 120),
  preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preferences) = 'object' and pg_column_size(preferences) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- vehicles: vehículos del transportista (mismas reglas que vehicleInputSchema)
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Id del vehículo en el navegador, para migrar el historial local sin duplicados.
  local_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  type text not null check (type in ('camioneta', 'furgon', 'camionLiviano')),
  fuel text not null check (fuel in ('gasolina', 'diesel', 'otro')),
  km_per_l numeric check (km_per_l is null or (km_per_l > 0 and km_per_l <= 100)),
  wear_per_km numeric check (wear_per_km is null or (wear_per_km >= 0 and wear_per_km <= 10000)),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_owner_local_unique unique (owner_id, local_id)
);
create index vehicles_owner_idx on public.vehicles (owner_id);
-- Un solo predeterminado por dueño.
create unique index vehicles_one_default_idx on public.vehicles (owner_id) where is_default;
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- jobs: historial de trabajos y cotizaciones, CON costos internos (solo el dueño)
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id uuid,
  number integer not null check (number > 0),
  quote_date date not null,
  client_name text not null check (char_length(client_name) between 1 and 120),
  service_description text not null default '' check (char_length(service_description) <= 300),
  includes text not null default '' check (char_length(includes) <= 300),
  conditions text not null default '' check (char_length(conditions) <= 600),
  valid_until text not null default '' check (char_length(valid_until) <= 10),
  service_date text not null default '' check (char_length(service_date) <= 10),
  origin_label text not null default '' check (char_length(origin_label) <= 120),
  destination_label text not null default '' check (char_length(destination_label) <= 120),
  net_price numeric not null check (net_price >= 0 and net_price < 10000000000),
  tax jsonb,
  status text not null default 'borrador'
    check (status in ('borrador', 'enviada', 'aceptada', 'rechazada', 'realizada')),
  payment text not null default 'pendiente' check (payment in ('pendiente', 'recibido')),
  -- Copia de los datos del emisor al emitir.
  issuer jsonb,
  -- Direcciones escritas por el usuario (dato propio).
  waypoints jsonb not null default '[]'::jsonb check (jsonb_typeof(waypoints) = 'array'),
  -- Costos internos, versión del motor, vehículo usado. Nunca sale de esta tabla.
  internal jsonb not null check (jsonb_typeof(internal) = 'object' and pg_column_size(internal) <= 16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_owner_id_unique unique (owner_id, id),
  constraint jobs_owner_local_unique unique (owner_id, local_id)
);
create index jobs_owner_number_idx on public.jobs (owner_id, number desc);
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_quotes: SOLO lo que ve el cliente (lista blanca CLIENT_QUOTE_KEYS)
-- ---------------------------------------------------------------------------
create table public.client_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null,
  number integer not null check (number > 0),
  issued_at date not null,
  business_name text not null default '' check (char_length(business_name) <= 80),
  business_phone text not null default '' check (char_length(business_phone) <= 30),
  business_email text not null default '' check (char_length(business_email) <= 120),
  client_name text not null check (char_length(client_name) between 1 and 120),
  service_description text not null default '' check (char_length(service_description) <= 300),
  includes text not null default '' check (char_length(includes) <= 300),
  conditions text not null default '' check (char_length(conditions) <= 600),
  valid_until text not null default '' check (char_length(valid_until) <= 10),
  service_date text not null default '' check (char_length(service_date) <= 10),
  origin_label text not null default '' check (char_length(origin_label) <= 120),
  destination_label text not null default '' check (char_length(destination_label) <= 120),
  net_price numeric not null check (net_price >= 0 and net_price < 10000000000),
  tax_amount numeric check (tax_amount is null or tax_amount >= 0),
  total numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_quotes_total_check check (total = net_price + coalesce(tax_amount, 0)),
  constraint client_quotes_one_per_job unique (owner_id, job_id),
  constraint client_quotes_owner_id_unique unique (owner_id, id),
  -- La cotización y su trabajo tienen SIEMPRE el mismo dueño.
  constraint client_quotes_job_fk foreign key (owner_id, job_id)
    references public.jobs (owner_id, id) on delete cascade
);
create trigger client_quotes_updated_at before update on public.client_quotes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- quote_shares: enlaces públicos. Solo se guarda el HASH del token (256 bits).
-- ---------------------------------------------------------------------------
create table public.quote_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_id uuid not null,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint quote_shares_quote_fk foreign key (owner_id, quote_id)
    references public.client_quotes (owner_id, id) on delete cascade
);
create index quote_shares_quote_idx on public.quote_shares (owner_id, quote_id);

-- ---------------------------------------------------------------------------
-- RLS: habilitada en todas las tablas; políticas por dueño para cada operación
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.jobs enable row level security;
alter table public.client_quotes enable row level security;
alter table public.quote_shares enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_insert on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_delete on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

create policy vehicles_select on public.vehicles for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy vehicles_update on public.vehicles for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy vehicles_delete on public.vehicles for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy jobs_select on public.jobs for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy jobs_insert on public.jobs for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy jobs_update on public.jobs for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy jobs_delete on public.jobs for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy client_quotes_select on public.client_quotes for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy client_quotes_insert on public.client_quotes for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy client_quotes_update on public.client_quotes for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy client_quotes_delete on public.client_quotes for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- Enlaces: el dueño solo los LEE (sin el hash: ver GRANT por columna). Crear y revocar,
-- solo mediante funciones que validan el dueño.
create policy quote_shares_select on public.quote_shares for select to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- GRANT mínimos (Supabase exige GRANT explícitos; RLS se aplica además)
-- ---------------------------------------------------------------------------
revoke all on table public.profiles, public.vehicles, public.jobs, public.client_quotes, public.quote_shares
  from public, anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.vehicles to authenticated;
grant select, insert, update, delete on table public.jobs to authenticated;
grant select, insert, update, delete on table public.client_quotes to authenticated;
-- Sin token_hash: el dueño ve sus enlaces, pero nunca el hash.
grant select (id, owner_id, quote_id, created_at, expires_at, revoked_at) on table public.quote_shares to authenticated;

-- ---------------------------------------------------------------------------
-- Funciones
-- ---------------------------------------------------------------------------

-- Cambia el vehículo predeterminado del usuario (o lo quita con NULL). Respeta RLS.
create or replace function public.set_default_vehicle(p_vehicle_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Se requiere iniciar sesión' using errcode = '42501';
  end if;
  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles where id = p_vehicle_id and owner_id = v_uid
  ) then
    raise exception 'Vehículo no encontrado' using errcode = 'P0002';
  end if;
  update public.vehicles set is_default = false
    where owner_id = v_uid and is_default and id is distinct from p_vehicle_id;
  if p_vehicle_id is not null then
    update public.vehicles set is_default = true where id = p_vehicle_id and owner_id = v_uid;
  end if;
end;
$$;
revoke all on function public.set_default_vehicle(uuid) from public, anon;
grant execute on function public.set_default_vehicle(uuid) to authenticated;

-- Crea un enlace público para UNA cotización propia. Devuelve el token UNA sola vez;
-- en la base queda solo su hash SHA-256. Expiración opcional (máximo 1 año).
create or replace function public.create_quote_share(p_quote_id uuid, p_expires_at timestamptz default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  if v_uid is null then
    raise exception 'Se requiere iniciar sesión' using errcode = '42501';
  end if;
  if not exists (select 1 from public.client_quotes where id = p_quote_id and owner_id = v_uid) then
    raise exception 'Cotización no encontrada' using errcode = 'P0002';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '366 days') then
    raise exception 'Expiración inválida' using errcode = '22023';
  end if;
  -- 32 bytes aleatorios (256 bits), en base64url sin relleno (43 caracteres).
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.quote_shares (owner_id, quote_id, token_hash, expires_at)
    values (v_uid, p_quote_id, extensions.digest(v_token, 'sha256'), p_expires_at);
  return v_token;
end;
$$;
revoke all on function public.create_quote_share(uuid, timestamptz) from public, anon;
grant execute on function public.create_quote_share(uuid, timestamptz) to authenticated;

-- Revoca un enlace propio. Una revocación no se puede deshacer (se crea otro enlace).
create or replace function public.revoke_quote_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Se requiere iniciar sesión' using errcode = '42501';
  end if;
  update public.quote_shares set revoked_at = now()
    where id = p_share_id and owner_id = v_uid and revoked_at is null;
  if not found and not exists (select 1 from public.quote_shares where id = p_share_id and owner_id = v_uid) then
    raise exception 'Enlace no encontrado' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.revoke_quote_share(uuid) from public, anon;
grant execute on function public.revoke_quote_share(uuid) to authenticated;

-- Lectura pública: SOLO columnas de client_quotes, SOLO con un token vigente.
-- Nunca toca `jobs`. Un token inválido, revocado o vencido devuelve cero filas.
create or replace function public.get_public_quote(p_token text)
returns table (
  number integer,
  issued_at date,
  business_name text,
  business_phone text,
  business_email text,
  client_name text,
  service_description text,
  includes text,
  conditions text,
  valid_until text,
  service_date text,
  origin_label text,
  destination_label text,
  net_price numeric,
  tax_amount numeric,
  total numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.number, q.issued_at, q.business_name, q.business_phone, q.business_email,
         q.client_name, q.service_description, q.includes, q.conditions, q.valid_until,
         q.service_date, q.origin_label, q.destination_label, q.net_price, q.tax_amount, q.total
  from public.quote_shares s
  join public.client_quotes q on q.id = s.quote_id and q.owner_id = s.owner_id
  where p_token ~ '^[A-Za-z0-9_-]{43}$'
    and s.token_hash = extensions.digest(p_token, 'sha256')
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;
revoke all on function public.get_public_quote(text) from public;
grant execute on function public.get_public_quote(text) to anon, authenticated;
