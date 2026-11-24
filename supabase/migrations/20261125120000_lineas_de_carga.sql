-- I-2 · M3′ · Líneas de inventario de una cotización (`job_cargo_items`). Implementación LOCAL autorizada
-- por A-81 (paso 1 de docs/22 §17.5), desde el borrador scripts/diseno/borradores/M3_job_cargo_items.sql
-- con las correcciones de seguridad de #52 (D-52-2, D-52-3).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ NO APLICAR EN SUPABASE NI EN STAGING sin:                                                    ║
-- ║   1) la migración de #52 (20261122120000) ya aplicada y verificada (A-59);                   ║
-- ║   2) auditoría independiente de este archivo y de 20261125120100;                            ║
-- ║   3) un respaldo real previo (docs/25) y la autorización INDIVIDUAL del propietario.         ║
-- ║ Ensayada SOLO en PostgreSQL local desechable (scripts/diseno/i2/ensayar-i2.sh).              ║
-- ║ Ojo: un `supabase db push` la aplicaría junto con las anteriores. No ejecutarlo.             ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- Líneas INALTERABLES (A-47): el dueño solo puede LEERLAS. Se escriben una sola vez, en la misma
-- transacción que crea el trabajo, con private.insert_cargo_items, a la que SOLO llega
-- public.create_job_with_quote_v2 (SECURITY DEFINER, 20261125120100). Desaparecen únicamente en cascada
-- si el dueño borra el trabajo completo (D-52-5, provisional).
--
-- Cambios respecto del borrador (D-52-3):
--   * authenticated NO recibe EXECUTE sobre private.insert_cargo_items (ni USAGE en private, D-52-2):
--     la única puerta es la v2. Las capas internas se conservan como defensa en profundidad:
--     identidad (auth.uid()), marca de transacción puesta por la v2, trabajo creado en ESTA
--     transacción, trabajo sin líneas previas y máximo 200 líneas.
--   * Privilegios explícitos, sin depender de los privilegios por defecto (#52, X3).
-- Idempotente: aplicarla dos veces no falla ni cambia el resultado.
-- Reversión (BORRA las líneas guardadas; exige respaldo previo): scripts/diseno/i2/reversion-i2.sql.

create table if not exists public.job_cargo_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null,
  position smallint not null check (position between 0 and 199),
  kind text not null check (char_length(kind) between 1 and 30),
  description text not null check (char_length(btrim(description)) between 1 and 80),
  qty integer not null check (qty between 1 and 999),
  unit_weight_kg numeric check (unit_weight_kg is null or (unit_weight_kg > 0 and unit_weight_kg <= 5000)),
  dim_l_cm integer,
  dim_w_cm integer,
  dim_h_cm integer,
  volume_m3 numeric check (volume_m3 is null or (volume_m3 > 0 and volume_m3 <= 100)),
  volume_source text check (volume_source in ('calculado', 'declarado')),
  fragile boolean not null default false,
  handling text not null default 'normal' check (handling in ('normal', 'pesado', 'voluminoso', 'requiere2')),
  created_at timestamptz not null default now(),
  -- Las tres medidas o ninguna (los IS NOT NULL evitan que un CHECK con NULL se dé por cumplido: C3).
  constraint job_cargo_items_dims check (
    (dim_l_cm is null and dim_w_cm is null and dim_h_cm is null)
    or (dim_l_cm is not null and dim_w_cm is not null and dim_h_cm is not null
        and dim_l_cm between 1 and 2000 and dim_w_cm between 1 and 2000 and dim_h_cm between 1 and 2000)
  ),
  constraint job_cargo_items_volume_source check ((volume_m3 is null) = (volume_source is null)),
  -- Un volumen «calculado» coincide con las medidas: misma regla que el cliente (volumeFromDims).
  constraint job_cargo_items_volume_calculado check (
    volume_source is distinct from 'calculado'
    or (dim_l_cm is not null and dim_w_cm is not null and dim_h_cm is not null
        and volume_m3 is not null
        and volume_m3 = round(dim_l_cm::numeric * dim_w_cm * dim_h_cm / 1000000, 3))
  ),
  constraint job_cargo_items_job_fk foreign key (owner_id, job_id)
    references public.jobs (owner_id, id) on delete cascade,
  constraint job_cargo_items_position_unique unique (job_id, position)
);

alter table public.job_cargo_items enable row level security;
revoke all on table public.job_cargo_items from public, anon, authenticated, service_role;
grant select on table public.job_cargo_items to authenticated;
drop policy if exists job_cargo_items_select on public.job_cargo_items;
create policy job_cargo_items_select on public.job_cargo_items for select to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function private.insert_cargo_items(p_job_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Se requiere iniciar sesión' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Las líneas deben ser un arreglo' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'Máximo 200 líneas por cotización' using errcode = '22023';
  end if;
  if current_setting('cotizador.guardado_v2_job', true) is distinct from p_job_id::text then
    raise exception 'Las líneas solo se guardan con create_job_with_quote_v2' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.jobs j
    where j.id = p_job_id and j.owner_id = v_uid and j.created_at = now()
  ) then
    raise exception 'Las líneas solo se guardan junto con la cotización nueva' using errcode = '42501';
  end if;
  if exists (select 1 from public.job_cargo_items c where c.job_id = p_job_id) then
    raise exception 'La cotización ya tiene sus líneas guardadas' using errcode = '42501';
  end if;

  insert into public.job_cargo_items (
    owner_id, job_id, position, kind, description, qty, unit_weight_kg,
    dim_l_cm, dim_w_cm, dim_h_cm, volume_m3, volume_source, fragile, handling
  )
  select
    v_uid,
    p_job_id,
    (e.ord - 1)::smallint,
    e.item ->> 'kind',
    e.item ->> 'description',
    coalesce((e.item ->> 'qty')::integer, 1),
    (e.item ->> 'unitWeightKg')::numeric,
    (e.item -> 'dimsCm' ->> 'l')::integer,
    (e.item -> 'dimsCm' ->> 'w')::integer,
    (e.item -> 'dimsCm' ->> 'h')::integer,
    (e.item ->> 'volumeM3')::numeric,
    e.item ->> 'volumeSource',
    coalesce((e.item ->> 'fragile')::boolean, false),
    coalesce(e.item ->> 'handling', 'normal')
  from jsonb_array_elements(p_items) with ordinality as e(item, ord);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
-- D-52-3: nadie la llama directamente; solo la v2 (DEFINER, mismo dueño).
revoke all on function private.insert_cargo_items(uuid, jsonb) from public, anon, authenticated, service_role;
