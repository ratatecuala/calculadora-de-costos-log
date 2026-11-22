-- HERRAMIENTA DE DISEÑO (#52, docs/23 §10). PROPUESTA de rediseño del contador (opción N1), pendiente
-- de aprobación. NO es una migración y nunca se aplica a Supabase: solo se ensaya en local.
--
-- Regla: el contador avanza SOLO con los números que asigna él mismo.
--  * Importación con número emitido libre: se conserva como número interno y emitido (como hoy), pero
--    el contador NO salta hasta él. Así un número importado enorme no bloquea las cotizaciones futuras.
--  * Cotización nueva (o importación con número ocupado): contador + 1, saltando los números ya usados
--    como interno O como emitido por la cuenta (nunca repite un número que el cliente ya vio).
--  * Aritmética en bigint: nunca hay desbordamiento silencioso; si se agotara el rango de INTEGER
--    (2.147.483.647 asignaciones de la misma cuenta), error claro 22003 y nada se escribe.
--  * El contador nunca baja: los números de cotizaciones borradas no se reutilizan en guardados nuevos.
--  * Un contador nuevo empieza en 0: tras #52 todo trabajo nace en esta función, que crea el contador
--    antes del primer trabajo; el bucle salta lo ocupado.
create or replace function private.allocate_quote_number(p_preferred integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_last integer;
  v_next bigint;
begin
  if v_uid is null then
    raise exception 'Se requiere iniciar sesión' using errcode = '42501';
  end if;
  insert into public.quote_counters (owner_id, last_number) values (v_uid, 0)
    on conflict (owner_id) do nothing;
  -- Bloqueo hasta el fin de la transacción: importaciones y guardados de una cuenta se serializan.
  select last_number into v_last from public.quote_counters where owner_id = v_uid for update;

  if p_preferred is not null and p_preferred > 0
     and not exists (select 1 from public.jobs where owner_id = v_uid and number = p_preferred) then
    return p_preferred; -- importación: se conserva el número libre SIN mover el contador
  end if;

  v_next := v_last::bigint + 1;
  while v_next <= 2147483647
        and exists (select 1 from public.jobs where owner_id = v_uid and (number = v_next or issued_number = v_next)) loop
    v_next := v_next + 1;
  end loop;
  if v_next > 2147483647 then
    raise exception 'Se agotó la numeración de cotizaciones de esta cuenta' using errcode = '22003';
  end if;
  update public.quote_counters set last_number = v_next::integer where owner_id = v_uid;
  return v_next::integer;
end;
$$;
revoke all on function private.allocate_quote_number(integer) from public, anon;
-- Sin GRANT a authenticated: con #52 (D-52-1) la llama solo create_job_with_quote (SECURITY DEFINER).
-- Índice para la comprobación del número emitido dentro del bucle.
create index if not exists jobs_owner_issued_idx on public.jobs (owner_id, issued_number);
