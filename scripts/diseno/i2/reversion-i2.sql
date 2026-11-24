-- REVERSIÓN de I-2 (M4′ y M3′). Fuera de supabase/migrations a propósito.
-- ⚠ BORRA las líneas de inventario guardadas en la nube (las cotizaciones y sus resúmenes v2 quedan).
-- Solo con respaldo real previo y autorización del propietario. Ensayada en local (ensayar-i2.sh).
drop function if exists public.create_job_with_quote_v2(jsonb, jsonb, jsonb);
drop function if exists private.insert_cargo_items(uuid, jsonb);
drop table if exists public.job_cargo_items;
