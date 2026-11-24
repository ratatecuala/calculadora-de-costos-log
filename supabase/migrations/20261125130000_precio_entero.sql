-- Precio final en pesos enteros en la BASE (A-83; complementa la regla del cliente de A-81, H1).
-- Implementación LOCAL. ╔══ NO APLICAR EN SUPABASE sin auditoría, respaldo real y autorización individual. ══╗
-- Ensayada solo en PostgreSQL local desechable (scripts/diseno/precio-entero/ensayar-precio.sh).
--
-- Qué impide: un precio final NUEVO con decimales en jobs.net_price, client_quotes.net_price o
-- client_quotes.total (error 23514, nada se guarda; la transacción del RPC se revierte entera).
-- Qué conserva:
--   * las filas históricas con decimales no se tocan ni se revalidan;
--   * cambiar estado o pago de cualquier cotización funciona (el trigger de jobs solo mira net_price);
--   * copiar a la cuenta una cotización LOCAL histórica (local_id no nulo) con decimales: se acepta,
--     porque no es un precio nuevo sino un registro existente (A-81: los históricos se preservan).
-- Por qué triggers y no CHECK: un CHECK (incluso NOT VALID) se vuelve a evaluar en CUALQUIER UPDATE de la
-- fila, así que cambiar el estado de una cotización histórica con decimales fallaría; y client_quotes no
-- puede consultar jobs.local_id desde un CHECK. Los triggers no se ejecutan al cargar un respaldo con
-- session_replication_role = replica. Comparación y controles: scripts/diseno/precio-entero/.
-- Idempotente. Reversión: scripts/diseno/precio-entero/reversion-precio.sql.

create or replace function private.exigir_precio_entero_jobs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.net_price is not null and new.net_price <> trunc(new.net_price) then
    if tg_op = 'INSERT' and new.local_id is not null then
      return new; -- copia de una cotización local histórica: se conserva tal cual
    end if;
    raise exception 'El precio final debe ser en pesos enteros (sin decimales)' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.exigir_precio_entero_client_quotes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.net_price <> trunc(new.net_price)) or (new.total <> trunc(new.total))
     or (new.tax_amount is not null and new.tax_amount <> trunc(new.tax_amount)) then
    if exists (select 1 from public.jobs j where j.id = new.job_id and j.owner_id = new.owner_id and j.local_id is not null) then
      return new; -- documento de una cotización local histórica copiada a la cuenta
    end if;
    raise exception 'El precio final debe ser en pesos enteros (sin decimales)' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.exigir_precio_entero_jobs() from public, anon, authenticated, service_role;
revoke all on function private.exigir_precio_entero_client_quotes() from public, anon, authenticated, service_role;

drop trigger if exists jobs_precio_entero on public.jobs;
create trigger jobs_precio_entero before insert or update of net_price on public.jobs
  for each row execute function private.exigir_precio_entero_jobs();

drop trigger if exists client_quotes_precio_entero on public.client_quotes;
create trigger client_quotes_precio_entero before insert or update of net_price, total, tax_amount on public.client_quotes
  for each row execute function private.exigir_precio_entero_client_quotes();
