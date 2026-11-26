-- Reversión de 20261125130000_precio_entero.sql (A-83). No borra datos.
drop trigger if exists jobs_precio_entero on public.jobs;
drop trigger if exists client_quotes_precio_entero on public.client_quotes;
drop function if exists private.exigir_precio_entero_jobs();
drop function if exists private.exigir_precio_entero_client_quotes();
