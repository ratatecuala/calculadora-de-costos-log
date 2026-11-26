-- BORRADOR DE DISEÑO M4 (#45, docs/21 §8). NO es una migración: no se aplica a Supabase.
-- Requiere M3. Ensayo solo en un PostgreSQL local desechable (probar-borradores.sh).
--
-- Guardado atómico v2 = guardado v1 SIN CAMBIOS + líneas de inventario, en UNA transacción.
-- Reutiliza public.create_job_with_quote (v1) en vez de copiar su cuerpo, para conservar
-- exactamente sus invariantes (A-47):
--  - número interno asignado por private.allocate_quote_number (contador por dueño, FOR UPDATE);
--  - número emitido (issued_number) conservado al importar;
--  - idempotencia por (owner_id, local_id): una importación repetida devuelve NULL, no duplica y
--    no gasta número;
--  - identidad por auth.uid() y RLS de la v1;
--  - devuelve {id, number, issued_number} o NULL.
-- Si falla CUALQUIER línea, se revierte todo (trabajo, cotización, avance del contador): no quedan
-- huecos ni cotizaciones sin sus líneas. La v1 sigue disponible para clientes anteriores.

create function public.create_job_with_quote_v2(p_job jsonb, p_quote jsonb, p_cargo_items jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
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
    -- Marca local a ESTA transacción (is_local = true): habilita la inserción solo para este trabajo.
    perform set_config('cotizador.guardado_v2_job', v_result ->> 'id', true);
    perform private.insert_cargo_items((v_result ->> 'id')::uuid, p_cargo_items);
  end if;

  return v_result;
end;
$$;
revoke all on function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_job_with_quote_v2(jsonb, jsonb, jsonb) to authenticated;
