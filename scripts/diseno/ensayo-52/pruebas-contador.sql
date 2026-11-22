-- HERRAMIENTA DE DISEÑO (#52, docs/23 §10). Pruebas del rediseño del contador (N1) sobre la propuesta
-- de #52, en un PostgreSQL LOCAL desechable. Cada prueba imprime «OK …» o se detiene con «FALLA …».
-- Usuarios ficticios nuevos: D = …0d, E = …0e (contadores limpios).
\set ON_ERROR_STOP 1
\set QUIET 1
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000d', 'd@prueba.invalid'),
  ('00000000-0000-0000-0000-00000000000e', 'e@prueba.invalid');

create function prueba.contador(p uuid) returns integer language sql security definer set search_path = '' as
  $$ select last_number from public.quote_counters where owner_id = p $$;
grant execute on function prueba.contador(uuid) to authenticated;

-- L0 · Documentos históricos intactos: la huella de todos los trabajos y cotizaciones existentes no
--      cambia al reemplazar la función (se compara con la tomada antes, en prueba.memo).
do $$ begin
  if (select v from prueba.memo where k = 'huella_antes') <>
     (select md5(coalesce(string_agg(j.id::text || ':' || j.number || ':' || j.issued_number || ':' || coalesce(q.number::text, '-'), ',' order by j.id), ''))
        from public.jobs j left join public.client_quotes q on q.job_id = j.id)
  then raise exception 'FALLA L0: cambiaron trabajos o documentos existentes'; end if;
  raise notice 'OK L0 trabajos y documentos existentes idénticos tras reemplazar la función';
end $$;

-- L1 · Importar el máximo de INTEGER (libre) ya no bloquea: se conserva interno y emitido, el contador
--      no salta, y las cotizaciones nuevas siguen su secuencia.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ declare r jsonb; n1 jsonb; n2 jsonb; begin
  n1 := public.create_job_with_quote(prueba.job(), prueba.quote());
  r := public.create_job_with_quote(prueba.job('d0000000-0000-4000-8000-000000000001', 2147483647), prueba.quote());
  if (r ->> 'number')::int <> 2147483647 or (r ->> 'issued_number')::int <> 2147483647 then raise exception 'FALLA L1 importación: %', r; end if;
  if prueba.contador('00000000-0000-0000-0000-00000000000d') <> 1 then raise exception 'FALLA L1: el contador saltó a %', prueba.contador('00000000-0000-0000-0000-00000000000d'); end if;
  n2 := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (n1 ->> 'number')::int <> 1 or (n2 ->> 'number')::int <> 2 or (n2 ->> 'issued_number')::int <> 2 then raise exception 'FALLA L1 secuencia: % %', n1, n2; end if;
  if (select number from public.client_quotes where job_id = (r ->> 'id')::uuid) <> 2147483647 then raise exception 'FALLA L1 documento'; end if;
  raise notice 'OK L1 importar N° 2.147.483.647: se conserva (interno y emitido, documento incluido), el contador no salta y la siguiente cotización es la N° 2';
end $$;
commit;

-- L2 · 2.147.483.646 y 2.147.483.647 importados, más cotizaciones nuevas: sin errores ni duplicados.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ declare r jsonb; n jsonb; begin
  r := public.create_job_with_quote(prueba.job('d0000000-0000-4000-8000-000000000002', 2147483646), prueba.quote());
  if (r ->> 'number')::int <> 2147483646 then raise exception 'FALLA L2: %', r; end if;
  n := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (n ->> 'number')::int <> 3 then raise exception 'FALLA L2 siguiente: %', n; end if;
  if exists (select 1 from public.jobs where owner_id = '00000000-0000-0000-0000-00000000000d' group by number having count(*) > 1) then raise exception 'FALLA L2 duplicados'; end if;
  raise notice 'OK L2 importar 2.147.483.646 junto a 2.147.483.647: la siguiente cotización es la N° 3, sin duplicados';
end $$;
commit;

-- L3 · Número emitido fuera de INTEGER (2.147.483.648) o no positivo: error limpio, nada se escribe,
--      el contador no cambia y un reintento válido funciona.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ declare antes int := prueba.contador('00000000-0000-0000-0000-00000000000d'); jobs_antes int; r jsonb; begin
  select count(*) into jobs_antes from public.jobs;
  begin
    perform public.create_job_with_quote(prueba.job('d0000000-0000-4000-8000-000000000003') || '{"issued_number": 2147483648}', prueba.quote());
    raise exception 'FALLA L3: aceptó 2.147.483.648';
  exception when numeric_value_out_of_range then null;
  end;
  begin
    perform public.create_job_with_quote(prueba.job('d0000000-0000-4000-8000-000000000003') || '{"issued_number": 1e20}', prueba.quote());
    raise exception 'FALLA L3: aceptó 1e20';
  exception when numeric_value_out_of_range or invalid_text_representation then null;
  end;
  begin
    perform public.create_job_with_quote(prueba.job('d0000000-0000-4000-8000-000000000003', -1), prueba.quote());
    raise exception 'FALLA L3: aceptó -1';
  exception when check_violation then null;
  end;
  if (select count(*) from public.jobs) <> jobs_antes or prueba.contador('00000000-0000-0000-0000-00000000000d') <> antes then raise exception 'FALLA L3: quedó algo escrito'; end if;
  r := public.create_job_with_quote(prueba.job('d0000000-0000-4000-8000-000000000003', 500), prueba.quote());
  if (r ->> 'issued_number')::int <> 500 then raise exception 'FALLA L3 reintento: %', r; end if;
  raise notice 'OK L3 emitido 2.147.483.648, 1e20 o −1: error limpio, nada escrito ni contador movido; el reintento válido (N° 500) funciona';
end $$;
commit;

-- L4 · Importación repetida del máximo (mismo local_id): NULL, sin duplicar ni gastar número.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ declare antes int := prueba.contador('00000000-0000-0000-0000-00000000000d'); r jsonb; begin
  r := public.create_job_with_quote(prueba.job('d0000000-0000-4000-8000-000000000001', 2147483647), prueba.quote());
  if r is not null then raise exception 'FALLA L4: %', r; end if;
  if prueba.contador('00000000-0000-0000-0000-00000000000d') <> antes then raise exception 'FALLA L4 contador'; end if;
  if (select count(*) from public.jobs where owner_id = '00000000-0000-0000-0000-00000000000d' and local_id = 'd0000000-0000-4000-8000-000000000001') <> 1 then raise exception 'FALLA L4 copias'; end if;
  raise notice 'OK L4 importación repetida del N° 2.147.483.647: NULL, una sola copia, contador igual';
end $$;
commit;

-- L5 · Importación con número ocupado: interno nuevo del contador, emitido conservado (como hoy).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', true);
do $$ declare r jsonb; begin
  r := public.create_job_with_quote(prueba.job('d0000000-0000-4000-8000-000000000005', 2147483647), prueba.quote());
  if (r ->> 'issued_number')::int <> 2147483647 or (r ->> 'number')::int = 2147483647 or (r ->> 'number')::int > 1000 then raise exception 'FALLA L5: %', r; end if;
  if (select number from public.client_quotes where job_id = (r ->> 'id')::uuid) <> 2147483647 then raise exception 'FALLA L5 documento'; end if;
  raise notice 'OK L5 importar un N° ocupado (2.147.483.647): interno % del contador, documento con el emitido original', r ->> 'number';
end $$;
commit;

-- L6 · Un guardado que falla DESPUÉS de asignar el número (dato inválido de la cotización) no gasta
--      número ni mueve el contador; el reintento recibe el número esperado.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);
do $$ declare r jsonb; begin
  r := public.create_job_with_quote(prueba.job(), prueba.quote());          -- E: N° 1
  begin
    perform public.create_job_with_quote(prueba.job(), prueba.quote() || '{"net_price": -5, "total": -5}');
    raise exception 'FALLA L6: aceptó un precio negativo';
  exception when check_violation then null;
  end;
  if prueba.contador('00000000-0000-0000-0000-00000000000e') <> 1 then raise exception 'FALLA L6: el contador avanzó'; end if;
  r := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (r ->> 'number')::int <> 2 then raise exception 'FALLA L6 reintento: %', r; end if;
  raise notice 'OK L6 guardado fallido tras asignar número: no deja hueco; el reintento recibe el N° 2';
end $$;
commit;

-- L7 · Nunca se repite un número que el cliente ya vio: si un número quedó libre como interno pero sigue
--      usado como EMITIDO por otra importación, la cotización nueva lo salta.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);
do $$ declare a jsonb; b jsonb; n jsonb; begin
  a := public.create_job_with_quote(prueba.job('e0000000-0000-4000-8000-000000000001', 4), prueba.quote());   -- interno 4 libre
  b := public.create_job_with_quote(prueba.job('e0000000-0000-4000-8000-000000000002', 4), prueba.quote());   -- 4 ocupado: interno 3, emitido 4
  if (b ->> 'number')::int <> 3 or (b ->> 'issued_number')::int <> 4 then raise exception 'FALLA L7 preparación: %', b; end if;
  delete from public.jobs where id = (a ->> 'id')::uuid;   -- el interno 4 queda libre; el emitido 4 sigue en «b»
  n := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (n ->> 'number')::int = 4 then raise exception 'FALLA L7: la cotización nueva repitió el N° 4 que el cliente ya vio'; end if;
  if (n ->> 'number')::int <> 5 then raise exception 'FALLA L7: %', n; end if;
  raise notice 'OK L7 la cotización nueva salta el N° 4 (usado como emitido por otra importación) y recibe el N° 5';
end $$;
commit;

-- L8 · Los números de cotizaciones borradas no se reutilizan en guardados nuevos (el contador no baja).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);
do $$ declare u jsonb; n jsonb; begin
  u := public.create_job_with_quote(prueba.job(), prueba.quote());
  delete from public.jobs where id = (u ->> 'id')::uuid;
  n := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (n ->> 'number')::int <> (u ->> 'number')::int + 1 then raise exception 'FALLA L8: % tras borrar %', n, u; end if;
  raise notice 'OK L8 tras borrar el N° %, la siguiente es la N° % (sin reutilizar)', u ->> 'number', n ->> 'number';
end $$;
commit;

-- L9 · Agotamiento del rango (solo alcanzable con 2.147.483.647 asignaciones; aquí se simula poniendo el
--      contador cerca del final): la última asignación funciona y la siguiente da un error claro, sin
--      escribir nada. Las importaciones con número libre siguen funcionando.
reset role;
update public.quote_counters set last_number = 2147483645 where owner_id = '00000000-0000-0000-0000-00000000000e';
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', true);
do $$ declare n jsonb; jobs_antes int; r jsonb; begin
  n := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (n ->> 'number')::int <> 2147483646 then raise exception 'FALLA L9 penúltima: %', n; end if;
  n := public.create_job_with_quote(prueba.job(), prueba.quote());
  if (n ->> 'number')::int <> 2147483647 then raise exception 'FALLA L9 última: %', n; end if;
  select count(*) into jobs_antes from public.jobs;
  begin
    perform public.create_job_with_quote(prueba.job(), prueba.quote());
    raise exception 'FALLA L9: asignó más allá del máximo';
  exception when numeric_value_out_of_range then null;
  end;
  if (select count(*) from public.jobs) <> jobs_antes or prueba.contador('00000000-0000-0000-0000-00000000000e') <> 2147483647 then raise exception 'FALLA L9: quedó algo escrito'; end if;
  r := public.create_job_with_quote(prueba.job('e0000000-0000-4000-8000-000000000009', 77), prueba.quote());
  if (r ->> 'number')::int <> 77 then raise exception 'FALLA L9 importación: %', r; end if;
  raise notice 'OK L9 rango agotado (simulado): última N° 2.147.483.647; la siguiente da error claro sin escribir nada; una importación libre sigue funcionando';
end $$;
commit;
