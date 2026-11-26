-- HERRAMIENTA DE DISEÑO (#45, fase 0 · C3). Ejecuta las MISMAS fixtures que
-- tests/contratos.cargo.test.ts (Zod) contra el CHECK del borrador M3, a través de
-- create_job_with_quote_v2, en el PostgreSQL LOCAL desechable de probar-borradores.sh.
-- Requiere las funciones de apoyo del esquema `prueba` (pruebas-borradores.sql).
-- La variable psql :fixtures trae el contenido de tests/fixtures/cargo-items.json.

\set ON_ERROR_STOP 1
select set_config('prueba.c3', :'fixtures', false) \g /dev/null

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true) \g /dev/null
do $$
declare
  c jsonb;
  obtenido text;
  estado text;
  total int := 0;
  fallas text := '';
begin
  for c in select jsonb_array_elements(current_setting('prueba.c3')::jsonb -> 'casos') loop
    total := total + 1;
    estado := null;
    begin
      perform public.create_job_with_quote_v2(prueba.job(), prueba.quote(), jsonb_build_array(c -> 'item'));
      obtenido := 'acepta';
    exception when others then
      obtenido := 'rechaza';
      estado := sqlstate;
    end;
    -- Un rechazo debe venir de la validación de datos, no de permisos ni de otra causa.
    if obtenido = 'rechaza' and estado not in ('23514', '22P02', '23502', '22003', '22023') then
      fallas := fallas || format(' [%s: SQLSTATE inesperado %s]', c ->> 'nombre', estado);
    end if;
    if obtenido <> c ->> 'servidor' then
      fallas := fallas || format(' [%s: esperado %s, obtenido %s]', c ->> 'nombre', c ->> 'servidor', obtenido);
    end if;
  end loop;
  if fallas <> '' then
    raise exception 'FALLA C3:%', fallas;
  end if;
  raise notice 'OK C3 % fixtures compartidas con Zod: el servidor acepta y rechaza lo esperado', total;
end $$;
rollback;
