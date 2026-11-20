-- Numeración de cotizaciones (decisión APROBADA del propietario, A-47, 17-11-2026).
--
-- * Cada cuenta tiene una secuencia propia, única y correlativa, asignada ATÓMICAMENTE en la
--   base (no «máximo + 1» en el navegador). Segura ante dos pestañas, dos dispositivos o
--   llamadas simultáneas: un contador por cuenta bloqueado con FOR UPDATE dentro de la misma
--   transacción que inserta la cotización, más unicidad (owner_id, number) como defensa.
-- * `jobs.number` = número INTERNO único. `jobs.issued_number` = número EMITIDO, el que figura
--   en el documento del cliente. Para cotizaciones nuevas son iguales.
-- * Importación del historial local: se conserva `local_id` (idempotencia) y el número emitido;
--   si ese número ya está ocupado en la cuenta, se asigna un número interno nuevo y el documento
--   sigue mostrando el emitido.
-- * NO destructiva: no se borra nada ni se cambia el número de un documento ya emitido
--   (`client_quotes.number` queda igual). Solo los duplicados existentes reciben un número
--   interno nuevo, conservando su número emitido.

-- 1. Número emitido (lo que vio el cliente). Para lo existente, el número actual.
alter table public.jobs add column issued_number integer check (issued_number is null or issued_number > 0);
update public.jobs set issued_number = number where issued_number is null;

-- 2. Duplicados existentes (p. ej., importaciones previas): el más antiguo conserva su número;
--    los demás reciben un número interno nuevo al final de la secuencia de su cuenta.
with dup as (
  select id, owner_id,
         row_number() over (partition by owner_id, number order by created_at, id) as rn
  from public.jobs
), to_fix as (
  select d.id, d.owner_id,
         row_number() over (partition by d.owner_id order by j.created_at, j.id) as k
  from dup d join public.jobs j on j.id = d.id
  where d.rn > 1
), maxes as (
  select owner_id, max(number) as m from public.jobs group by owner_id
)
update public.jobs j
   set number = m.m + f.k
  from to_fix f join maxes m on m.owner_id = f.owner_id
 where j.id = f.id;

alter table public.jobs alter column issued_number set not null;
alter table public.jobs add constraint jobs_owner_number_unique unique (owner_id, number);

-- 3. Contador por cuenta. Nadie lo lee ni escribe directamente: solo la función de asignación.
create table public.quote_counters (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  last_number integer not null check (last_number >= 0)
);
alter table public.quote_counters enable row level security;
revoke all on table public.quote_counters from public, anon, authenticated;
insert into public.quote_counters (owner_id, last_number)
  select owner_id, max(number) from public.jobs group by owner_id;

-- 4. Asignación atómica, en un esquema NO expuesto por la API (no se puede llamar por REST).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.allocate_quote_number(p_preferred integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_last integer;
  v_num integer;
begin
  if v_uid is null then
    raise exception 'Se requiere iniciar sesión' using errcode = '42501';
  end if;
  -- Crea el contador de la cuenta si no existe (desde su máximo actual).
  insert into public.quote_counters (owner_id, last_number)
    values (v_uid, (select coalesce(max(number), 0) from public.jobs where owner_id = v_uid))
    on conflict (owner_id) do nothing;
  -- Bloquea el contador hasta el fin de la transacción: las asignaciones de una cuenta se serializan.
  select last_number into v_last from public.quote_counters where owner_id = v_uid for update;

  if p_preferred is not null and p_preferred > 0
     and not exists (select 1 from public.jobs where owner_id = v_uid and number = p_preferred) then
    v_num := p_preferred; -- importación: se conserva el número emitido si está libre
  else
    v_num := v_last + 1;
    while exists (select 1 from public.jobs where owner_id = v_uid and number = v_num) loop
      v_num := v_num + 1; -- defensa: nunca repetir un número ocupado
    end loop;
  end if;

  update public.quote_counters set last_number = greatest(v_last, v_num) where owner_id = v_uid;
  return v_num;
end;
$$;
revoke all on function private.allocate_quote_number(integer) from public, anon;
grant execute on function private.allocate_quote_number(integer) to authenticated;

-- 5. Guardado atómico con número asignado por la base. Cambia el tipo de retorno, por eso se
--    reemplaza la función (no hay datos en ella). Devuelve {id, number, issued_number} o NULL si
--    la importación ya existía (idempotencia por local_id).
drop function if exists public.create_job_with_quote(jsonb, jsonb);

create function public.create_job_with_quote(p_job jsonb, p_quote jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_local uuid := (p_job ->> 'local_id')::uuid;
  v_preferred integer := case when v_local is null then null else (p_job ->> 'issued_number')::integer end;
  v_number integer;
  v_issued integer;
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere iniciar sesión' using errcode = '42501';
  end if;
  -- Importación repetida: no se duplica ni se gasta un número.
  if v_local is not null and exists (select 1 from public.jobs where owner_id = v_uid and local_id = v_local) then
    return null;
  end if;

  -- Asignación + inserción en un subbloque: si otra pestaña importó lo mismo al mismo tiempo,
  -- el choque por local_id deshace TAMBIÉN el avance del contador (no quedan huecos).
  begin
  v_number := private.allocate_quote_number(v_preferred);
  -- Número del documento: el emitido original al importar; el asignado para una cotización nueva.
  v_issued := coalesce(v_preferred, v_number);

  insert into public.jobs (
    id, owner_id, local_id, number, issued_number, quote_date, client_name, service_description,
    includes, conditions, valid_until, service_date, origin_label, destination_label, net_price,
    tax, status, payment, issuer, waypoints, internal
  ) values (
    coalesce((p_job ->> 'id')::uuid, gen_random_uuid()),
    v_uid,
    v_local,
    v_number,
    v_issued,
    (p_job ->> 'quote_date')::date,
    p_job ->> 'client_name',
    coalesce(p_job ->> 'service_description', ''),
    coalesce(p_job ->> 'includes', ''),
    coalesce(p_job ->> 'conditions', ''),
    coalesce(p_job ->> 'valid_until', ''),
    coalesce(p_job ->> 'service_date', ''),
    coalesce(p_job ->> 'origin_label', ''),
    coalesce(p_job ->> 'destination_label', ''),
    (p_job ->> 'net_price')::numeric,
    nullif(p_job -> 'tax', 'null'::jsonb),
    coalesce(p_job ->> 'status', 'borrador'),
    coalesce(p_job ->> 'payment', 'pendiente'),
    nullif(p_job -> 'issuer', 'null'::jsonb),
    coalesce(p_job -> 'waypoints', '[]'::jsonb),
    p_job -> 'internal'
  )
  returning id into v_job_id;
  exception when unique_violation then
    if v_local is not null and exists (select 1 from public.jobs where owner_id = v_uid and local_id = v_local) then
      return null; -- otra pestaña importó lo mismo al mismo tiempo
    end if;
    raise;
  end;

  insert into public.client_quotes (
    owner_id, job_id, number, issued_at, business_name, business_phone, business_email,
    client_name, service_description, includes, conditions, valid_until, service_date,
    origin_label, destination_label, net_price, tax_amount, total
  ) values (
    v_uid,
    v_job_id,
    v_issued, -- el documento del cliente muestra SIEMPRE el número emitido
    (p_quote ->> 'issued_at')::date,
    coalesce(p_quote ->> 'business_name', ''),
    coalesce(p_quote ->> 'business_phone', ''),
    coalesce(p_quote ->> 'business_email', ''),
    p_quote ->> 'client_name',
    coalesce(p_quote ->> 'service_description', ''),
    coalesce(p_quote ->> 'includes', ''),
    coalesce(p_quote ->> 'conditions', ''),
    coalesce(p_quote ->> 'valid_until', ''),
    coalesce(p_quote ->> 'service_date', ''),
    coalesce(p_quote ->> 'origin_label', ''),
    coalesce(p_quote ->> 'destination_label', ''),
    (p_quote ->> 'net_price')::numeric,
    (p_quote ->> 'tax_amount')::numeric,
    (p_quote ->> 'total')::numeric
  );

  return jsonb_build_object('id', v_job_id, 'number', v_number, 'issued_number', v_issued);
end;
$$;
revoke all on function public.create_job_with_quote(jsonb, jsonb) from public, anon;
grant execute on function public.create_job_with_quote(jsonb, jsonb) to authenticated;

-- 6. Documentos emitidos inalterables: el dueño solo puede cambiar el ESTADO y el PAGO de sus
--    trabajos (lo único que la app modifica). Número, número emitido y contenido de la
--    cotización al cliente no se pueden reescribir por la API.
revoke update on table public.jobs from authenticated;
grant update (status, payment) on table public.jobs to authenticated;
revoke update on table public.client_quotes from authenticated;
