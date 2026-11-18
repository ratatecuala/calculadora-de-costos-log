-- Guarda un trabajo y su cotización al cliente en UNA transacción (o ninguno).
-- SECURITY INVOKER: corre con los permisos del usuario, así que RLS y los GRANT se aplican.
-- `p_quote` llega armado por `toClientQuote()` (lista blanca); la tabla client_quotes,
-- además, no tiene columnas de costos.
-- Migración del historial local: si (owner_id, local_id) ya existe, no duplica y devuelve NULL.
create or replace function public.create_job_with_quote(p_job jsonb, p_quote jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere iniciar sesión' using errcode = '42501';
  end if;

  insert into public.jobs (
    id, owner_id, local_id, number, quote_date, client_name, service_description, includes,
    conditions, valid_until, service_date, origin_label, destination_label, net_price, tax,
    status, payment, issuer, waypoints, internal
  ) values (
    coalesce((p_job ->> 'id')::uuid, gen_random_uuid()),
    v_uid,
    (p_job ->> 'local_id')::uuid,
    (p_job ->> 'number')::integer,
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
  on conflict (owner_id, local_id) do nothing
  returning id into v_job_id;

  if v_job_id is null then
    return null; -- ya existía (migración repetida): no se duplica
  end if;

  insert into public.client_quotes (
    owner_id, job_id, number, issued_at, business_name, business_phone, business_email,
    client_name, service_description, includes, conditions, valid_until, service_date,
    origin_label, destination_label, net_price, tax_amount, total
  ) values (
    v_uid,
    v_job_id,
    (p_quote ->> 'number')::integer,
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

  return v_job_id;
end;
$$;
revoke all on function public.create_job_with_quote(jsonb, jsonb) from public, anon;
grant execute on function public.create_job_with_quote(jsonb, jsonb) to authenticated;
