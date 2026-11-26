-- BORRADOR DE DISEÑO M3 (#45, docs/21 §8). NO es una migración: no está en supabase/migrations y no
-- se aplica a Supabase. Se ensaya solo en un PostgreSQL local desechable (probar-borradores.sh).
-- Aplica solo si el propietario elige D-4 = (b). Ejecutarla en staging requiere autorización
-- individual y respaldo real previo (A-59).
--
-- Líneas de inventario de una cotización. INALTERABLES (A-47):
--  - el dueño solo puede LEERLAS (sin INSERT, UPDATE ni DELETE por la API);
--  - se escriben una sola vez, dentro de la misma transacción que crea el trabajo
--    (private.insert_cargo_items, invocada por create_job_with_quote_v2);
--  - desaparecen únicamente en cascada si el dueño elimina el trabajo completo, que hoy está
--    permitido por el GRANT DELETE sobre jobs y la POLÍTICA RLS jobs_delete del esquema inicial
--    (borrar un trabajo borra también su cotización y sus enlaces).
--
-- SUPUESTO DE SEGURIDAD (P2-1 de la reauditoría): authenticated conserva EXECUTE sobre la función
-- privada porque create_job_with_quote_v2 es SECURITY INVOKER. Por eso NO se afirma que «solo M4
-- puede llamarla» a nivel SQL. La protección real son cuatro capas, todas probadas:
--   1. el esquema private NO está expuesto por la Data API (verificar antes de migrar: panel
--      Data API → Exposed schemas, y `select rolconfig from pg_roles where rolname = 'authenticator'`);
--   2. marca de transacción `cotizador.guardado_v2_job` = id del trabajo, que solo pone M4 (T6c);
--   3. trabajo del usuario creado en ESTA transacción (created_at = now()) (T6b);
--   4. trabajo sin líneas previas (T6).

create table public.job_cargo_items (
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
  -- Las tres dimensiones o ninguna. Los IS NOT NULL son necesarios: con una medida nula,
  -- `between` da NULL y un CHECK con resultado NULL se considera CUMPLIDO (lo detectó C3).
  constraint job_cargo_items_dims check (
    (dim_l_cm is null and dim_w_cm is null and dim_h_cm is null)
    or (dim_l_cm is not null and dim_w_cm is not null and dim_h_cm is not null
        and dim_l_cm between 1 and 2000 and dim_w_cm between 1 and 2000 and dim_h_cm between 1 and 2000)
  ),
  constraint job_cargo_items_volume_source check ((volume_m3 is null) = (volume_source is null)),
  -- P2-4: un volumen «calculado» DEBE coincidir con las dimensiones (cm enteros → m³ con 3
  -- decimales, mitad hacia arriba). El cliente usa la misma regla: Math.round(l*w*h/1000)/1000.
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
revoke all on table public.job_cargo_items from public, anon, authenticated;
grant select on table public.job_cargo_items to authenticated;
create policy job_cargo_items_select on public.job_cargo_items for select to authenticated
  using ((select auth.uid()) = owner_id);

-- Inserta TODAS las líneas de un trabajo, una sola vez. Defensa en profundidad (ver el supuesto
-- de seguridad arriba):
--  1. solo trabajos del usuario autenticado;
--  2. marca de transacción puesta por create_job_with_quote_v2 para ESTE trabajo;
--  3. solo un trabajo creado en ESTA transacción (created_at = now(), hora de inicio de la
--     transacción): no sirve para agregar líneas a una cotización ya emitida;
--  4. solo si el trabajo aún no tiene líneas;
--  5. máximo 200 líneas (T-1, también validado en la interfaz y en M4).
create function private.insert_cargo_items(p_job_id uuid, p_items jsonb)
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
revoke all on function private.insert_cargo_items(uuid, jsonb) from public, anon;
-- create_job_with_quote_v2 es SECURITY INVOKER (como la v1): el rol authenticated necesita EXECUTE.
-- Ver «SUPUESTO DE SEGURIDAD» al inicio: la protección son las capas 1–4, no la falta de EXECUTE.
grant execute on function private.insert_cargo_items(uuid, jsonb) to authenticated;
