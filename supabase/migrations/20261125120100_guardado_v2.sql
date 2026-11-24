-- I-2 · M4′ · Guardado atómico v2 (`create_job_with_quote_v2`). Implementación LOCAL autorizada por A-81
-- (paso 1 de docs/22 §17.5), desde el borrador scripts/diseno/borradores/M4_guardado_v2.sql ajustado a
-- #52 (D-52-3). Requiere 20261122120000 (#52) y 20261125120000 (M3′).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ NO APLICAR EN SUPABASE NI EN STAGING sin: #52 aplicada y verificada (A-59), M3′ aplicada,    ║
-- ║ auditoría independiente, respaldo real previo y autorización INDIVIDUAL del propietario.    ║
-- ║ Ensayada SOLO en PostgreSQL local desechable (scripts/diseno/i2/ensayar-i2.sh).              ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- Guardado v1 SIN CAMBIOS + líneas, en UNA transacción. Reutiliza public.create_job_with_quote (que con
-- #52 ya es SECURITY DEFINER) para conservar sus invariantes (A-47 y N1): número asignado por el
-- contador, número emitido conservado al importar, idempotencia por (owner_id, local_id) (devuelve NULL
-- y no toca las líneas) e identidad por auth.uid(). Si falla CUALQUIER línea se revierte todo, incluido
-- el avance del contador.
--
-- Cambio respecto del borrador (D-52-3): SECURITY DEFINER, porque con #52 authenticated ya no tiene
-- acceso a `private` (D-52-2) y la v2 debe llamar a private.insert_cargo_items. auth.uid() sigue
-- leyendo la identidad de la solicitud (claims de la Data API), igual que la v1 DEFINER de #52.
-- Privilegios explícitos: EXECUTE solo para authenticated.
-- Idempotente (CREATE OR REPLACE + privilegios fijados después). Reversión: scripts/diseno/i2/reversion-i2.sql.

create or replace function public.create_job_with_quote_v2(p_job jsonb, p_quote jsonb, p_cargo_items jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Se requiere iniciar sesión' using errcode = '42501';
  end if;
  if p_cargo_items is null or jsonb_typeof(p_cargo_items) <> 'array' then
    raise exception 'Las líneas deben ser un arreglo' using errcode = '22023';
  end if;
  if jsonb_array_length(p_cargo_items) > 200 then
    raise exception 'Máximo 200 líneas por cotización' using errcode = '22023';
  end if;

  v_result := public.create_job_with_quote(p_job, p_quote);

  -- Importación repetida: la v1 devolvió NULL sin escribir nada; tampoco se tocan las líneas.
  if v_result is null then
    return null;
  end if;

  if jsonb_array_length(p_cargo_items) > 0 then
    -- Marca local a ESTA transacción: habilita la inserción solo para este trabajo.
    perform set_config('cotizador.guardado_v2_job', v_result ->> 'id', true);
    perform private.insert_cargo_items((v_result ->> 'id')::uuid, p_cargo_items);
  end if;

  return v_result;
end;
$$;
revoke all on function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) to authenticated;
