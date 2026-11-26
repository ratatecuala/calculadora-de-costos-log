-- Precio final en pesos enteros en la BASE (A-83; complementa la regla del cliente de A-81, H1).
-- Implementación LOCAL. ╔══ NO APLICAR EN SUPABASE sin auditoría, respaldo real y autorización individual. ══╗
-- Ensayo previsto en PostgreSQL local desechable (scripts/diseno/precio-entero/ensayar-precio.sh).
--
-- Qué impide: un precio final NUEVO con decimales en jobs.net_price, client_quotes.net_price o
-- client_quotes.tax_amount o client_quotes.total (error 23514, nada se guarda; la transacción del RPC se revierte entera).
-- Qué conserva:
--   * las filas históricas con decimales no se tocan ni se revalidan;
--   * cambiar estado o pago de cualquier cotización funciona (el trigger de jobs solo mira net_price);
--   * los registros fraccionarios del navegador permanecen allí, pendientes de importación.
-- Por qué triggers y no CHECK: un CHECK (incluso NOT VALID) se vuelve a evaluar en CUALQUIER UPDATE de la
-- fila, así que cambiar el estado de una cotización histórica con decimales fallaría. Los triggers no se ejecutan al cargar un respaldo con
-- session_replication_role = replica. Comparación y controles: scripts/diseno/precio-entero/.
-- Idempotente. Reversión: scripts/diseno/precio-entero/reversion-precio.sql.

create or replace function private.exigir_precio_entero_jobs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.net_price is not null and new.net_price <> trunc(new.net_price) then
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
