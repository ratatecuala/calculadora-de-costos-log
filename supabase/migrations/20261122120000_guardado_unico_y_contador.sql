-- #52 · Guardado como única puerta de escritura y contador N1 (diseño aprobado A-72; implementación
-- LOCAL autorizada por A-74, docs/23 §11).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ NO APLICAR EN SUPABASE NI EN STAGING sin:                                                    ║
-- ║   1) auditoría independiente de este archivo;                                                ║
-- ║   2) el primer respaldo real (A-52), hecho por el propietario;                               ║
-- ║   3) las verificaciones de solo lectura (scripts/diseno/verificaciones-52) y su revisión;    ║
-- ║   4) la autorización INDIVIDUAL del propietario para esta migración (A-59).                  ║
-- ║ Ensayada SOLO en PostgreSQL local desechable (scripts/diseno/ensayo-52/ensayar.sh).          ║
-- ║ Ojo: un `supabase db push` la aplicaría. No ejecutarlo hasta cumplir los 4 puntos.           ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- Qué hace (no borra ni modifica datos, ni contadores existentes; nunca repara contadores: D-52-4b):
--   D-52-1  create_job_with_quote pasa a SECURITY DEFINER (mismo cuerpo, firma y search_path vacío) y
--           se revoca la escritura directa: INSERT en jobs; INSERT y DELETE en client_quotes. Se quitan
--           las políticas que dejan de corresponder. Se conservan SELECT, UPDATE (status, payment) y el
--           DELETE del trabajo completo (D-52-5, provisional), cuya cascada borra el documento.
--   D-52-2  authenticated pierde el acceso al esquema private (ya no lo necesita).
--   N1      el contador avanza solo con los números que asigna él mismo (D-52-4 v2).
-- Reversión: scripts/diseno/ensayo-52/reversion-52.sql (fuera de supabase/migrations a propósito).
-- Idempotente: aplicarla dos veces no falla ni cambia el resultado (ensayo S9).

-- [D52-1:definer] ---------------------------------------------------------------------------------
alter function public.create_job_with_quote(jsonb, jsonb) security definer;
-- Privilegios explícitos (no depender de privilegios por defecto; docs/23 §5, X3).
revoke all on function public.create_job_with_quote(jsonb, jsonb) from public, anon, service_role;
grant execute on function public.create_job_with_quote(jsonb, jsonb) to authenticated;

-- [D52-1:jobs] ------------------------------------------------------------------------------------
revoke insert on table public.jobs from authenticated;
drop policy if exists jobs_insert on public.jobs;

-- [D52-1:client_quotes] ---------------------------------------------------------------------------
revoke insert, delete on table public.client_quotes from authenticated;
drop policy if exists client_quotes_insert on public.client_quotes;
drop policy if exists client_quotes_update on public.client_quotes; -- sin GRANT UPDATE desde 20261118022422
drop policy if exists client_quotes_delete on public.client_quotes;

-- [N1:inicio] -------------------------------------------------------------------------------------
-- Regla: el contador avanza SOLO con los números que asigna él mismo.
--  * Importación con número emitido libre: se conserva como interno y emitido, SIN mover el contador.
--  * Cotización nueva (o importación con número ocupado): contador + 1, saltando los números ya usados
--    como interno o como emitido por la cuenta (nunca repite un número que el cliente ya vio).
--  * Aritmética en bigint: si se agotara el rango de INTEGER, error 22003 claro y nada se escribe.
--  * El contador nunca baja; un contador nuevo empieza en 0 (el bucle salta lo ocupado).
--  CREATE OR REPLACE conserva los privilegios existentes; se fijan explícitamente después.
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
create index if not exists jobs_owner_issued_idx on public.jobs (owner_id, issued_number);
-- [N1:fin] ----------------------------------------------------------------------------------------

-- [D52-2:private] ---------------------------------------------------------------------------------
-- Solo create_job_with_quote (DEFINER, ejecutada como su dueño) llama a la asignación.
revoke all on function private.allocate_quote_number(integer) from public, anon, authenticated, service_role;
revoke usage on schema private from authenticated;
