-- HERRAMIENTA DE DISEÑO (#52, docs/23 §11). REVERSIÓN de supabase/migrations/20261122120000_guardado_unico_y_contador.sql.
-- Ensayada solo en PostgreSQL local desechable (ensayar.sh, fase R). NO aplicar en Supabase sin la
-- autorización individual del propietario (A-59). No borra ni modifica datos ni contadores: solo
-- devuelve permisos, políticas y la definición anterior de la asignación de números.
-- Idempotente: se puede ejecutar dos veces.

-- D-52-1: la función de guardado vuelve a SECURITY INVOKER y la escritura directa vuelve a permitirse.
alter function public.create_job_with_quote(jsonb, jsonb) security invoker;
revoke all on function public.create_job_with_quote(jsonb, jsonb) from public, anon;
grant execute on function public.create_job_with_quote(jsonb, jsonb) to authenticated;
grant insert on table public.jobs to authenticated;
grant insert, delete on table public.client_quotes to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'jobs' and policyname = 'jobs_insert') then
    create policy jobs_insert on public.jobs for insert to authenticated
      with check ((select auth.uid()) = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_quotes' and policyname = 'client_quotes_insert') then
    create policy client_quotes_insert on public.client_quotes for insert to authenticated
      with check ((select auth.uid()) = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_quotes' and policyname = 'client_quotes_update') then
    create policy client_quotes_update on public.client_quotes for update to authenticated
      using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_quotes' and policyname = 'client_quotes_delete') then
    create policy client_quotes_delete on public.client_quotes for delete to authenticated
      using ((select auth.uid()) = owner_id);
  end if;
end $$;

-- D-52-2: authenticated recupera el acceso al esquema private (como en 20261118022422).
grant usage on schema private to authenticated;

-- N1: vuelve la definición de 20261118022422_numeracion_atomica.sql (copiada sin cambios).
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
drop index if exists public.jobs_owner_issued_idx;
