-- A-83 · Pruebas del precio entero en la base. Requiere: stub + todas las migraciones previas, los datos
-- HISTÓRICOS cargados por ensayar-precio.sh ANTES de la migración, y luego la migración aplicada.
\set ON_ERROR_STOP 1
begin;
create or replace function pg_temp.guardar(p_uid uuid, p_job jsonb, p_quote jsonb, p_items jsonb default null) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
  if p_items is null then r := public.create_job_with_quote(p_job, p_quote);
  else r := public.create_job_with_quote_v2(p_job, p_quote, p_items); end if;
  execute 'reset role';
  return r;
exception when others then execute 'reset role'; raise;
end $;
create or replace function pg_temp.job(p_price numeric, p_local uuid default null) returns jsonb language sql as $$
  select jsonb_build_object('local_id', p_local, 'quote_date', '2026-11-25', 'client_name', 'Cliente ficticio', 'net_price', p_price, 'internal', jsonb_build_object('engineVersion', 'x')) $$;
create or replace function pg_temp.quote(p_price numeric) returns jsonb language sql as $$
  select jsonb_build_object('issued_at', '2026-11-25', 'client_name', 'Cliente ficticio', 'net_price', p_price, 'total', p_price) $$;

create or replace function pg_temp.estado() returns jsonb language sql as $$
  select jsonb_build_array((select count(*) from public.jobs), (select count(*) from public.client_quotes),
                           (select count(*) from public.job_cargo_items), (select max(last_number) from public.quote_counters))
$$;

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  local_id_prueba constant uuid := 'f0000000-0000-4000-8000-000000000099';
  lineas constant jsonb := '[{"kind":"cajas","description":"Caja","qty":1}]';
  caso record; estado_antes jsonb;
  r jsonb; n_antes int; n_despues int; c_antes int; c_despues int; msg text;
begin
  -- E1 · RPC v1 con precio nuevo fraccionario: rechazado (23514), nada escrito, contador intacto.
  select count(*) into n_antes from public.jobs; select coalesce(max(last_number), 0) into c_antes from public.quote_counters where owner_id = a;
  begin
    r := pg_temp.guardar(a, pg_temp.job(87000.5), pg_temp.quote(87000.5));
    raise exception 'FALLA E1: aceptó 87000.5';
  exception when check_violation then
    msg := sqlerrm;
    if msg <> 'El precio final debe ser en pesos enteros (sin decimales)' then raise; end if;
  end;
  select count(*) into n_despues from public.jobs; select coalesce(max(last_number), 0) into c_despues from public.quote_counters where owner_id = a;
  if n_despues <> n_antes or c_despues <> c_antes then raise exception 'FALLA E1: quedó algo escrito'; end if;
  raise notice 'OK E1 RPC v1 con 87000,5 rechazado («%»), sin escribir ni mover el contador', msg;

  -- E2 · precio entero: se guarda.
  r := pg_temp.guardar(a, pg_temp.job(87000), pg_temp.quote(87000));
  if not exists (select from public.jobs j join public.client_quotes q on q.job_id = j.id
    where j.id = (r ->> 'id')::uuid and j.net_price = 87000 and q.net_price = 87000 and q.total = 87000)
  then raise exception 'FALLA E2'; end if;
  raise notice 'OK E2 RPC v1 con 87000 guardado (N° %)', r ->> 'number';

  -- E3 · documento fraccionario con trabajo entero (descuadre): rechazado por el trigger de client_quotes.
  begin
    r := pg_temp.guardar(a, pg_temp.job(87000), jsonb_build_object('issued_at', '2026-11-25', 'client_name', 'X', 'net_price', 87000.5, 'total', 87000.5));
    raise exception 'FALLA E3: aceptó un documento con decimales';
  exception when check_violation then
    if sqlerrm <> 'El precio final debe ser en pesos enteros (sin decimales)' then raise; end if;
  end;
  raise notice 'OK E3 documento del cliente con 87000,5 y trabajo entero: rechazado';

  -- E4 · RPC v2 fraccionario con líneas: rechazado y sin líneas huérfanas.
  select count(*) into n_antes from public.job_cargo_items;
  begin
    r := pg_temp.guardar(a, pg_temp.job(1500.25), pg_temp.quote(1500.25), '[{"kind":"cajas","description":"Caja","qty":1}]'::jsonb);
    raise exception 'FALLA E4';
  exception when check_violation then
    if sqlerrm <> 'El precio final debe ser en pesos enteros (sin decimales)' then raise; end if;
  end;
  select count(*) into n_despues from public.job_cargo_items;
  if n_despues <> n_antes then raise exception 'FALLA E4: quedaron líneas'; end if;
  raise notice 'OK E4 RPC v2 con 1500,25 y una línea: rechazado, sin líneas ni trabajo';

  estado_antes := pg_temp.estado();
  -- E5 · Rechazo independiente de trabajo y documento en ambas rutas de copia.
  for caso in select * from (values
    ('v1 trabajo', 10.5, 10, null::jsonb),
    ('v1 documento', 10, 10.5, null::jsonb),
    ('v2 trabajo', 10.5, 10, lineas),
    ('v2 documento', 10, 10.5, lineas)
  ) as casos(nombre, trabajo, documento, items) loop
    begin
      perform pg_temp.guardar(a, pg_temp.job(caso.trabajo, local_id_prueba),
                              pg_temp.quote(caso.documento), caso.items);
      raise exception 'FALLA E5: se aceptó %', caso.nombre;
    exception when check_violation then
      if sqlerrm <> 'El precio final debe ser en pesos enteros (sin decimales)' then raise; end if;
    end;
  end loop;
  if estado_antes is distinct from pg_temp.estado() then raise exception 'FALLA E5: escritura parcial'; end if;
  raise notice 'OK E5 importaciones v1/v2, trabajo y documento, sin escrituras parciales';

  -- E5b · Una copia entera v2 se guarda una sola vez y conserva el número emitido.
  r := pg_temp.guardar(a, pg_temp.job(5000, local_id_prueba) || '{"issued_number":99}',
                        pg_temp.quote(5000), lineas);
  if not exists (select from public.jobs j join public.client_quotes q on q.job_id = j.id
      where j.id = (r ->> 'id')::uuid and j.local_id = local_id_prueba and j.issued_number = 99
        and q.number = 99 and j.net_price = 5000 and q.net_price = 5000 and q.total = 5000
        and (select count(*) from public.job_cargo_items where job_id = j.id) = 1)
  then raise exception 'FALLA E5b: copia entera incompleta'; end if;
  estado_antes := pg_temp.estado();
  if pg_temp.guardar(a, pg_temp.job(5000, local_id_prueba), pg_temp.quote(5000), lineas) is not null
  then raise exception 'FALLA E5b: duplicado'; end if;
  if estado_antes is distinct from pg_temp.estado() then raise exception 'FALLA E5b: repetición con escrituras'; end if;
  raise notice 'OK E5b copia entera e idempotencia con M3′/M4′ y #52';

  -- E6 · históricos (cargados antes de la migración): estado y pago cambian sin error; el precio no cambia.
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  update public.jobs set status = 'aceptada', payment = 'recibido' where client_name = 'Histórico ficticio';
  get diagnostics n_despues = row_count;
  execute 'reset role';
  if n_despues <> 1 or (select net_price from public.jobs where client_name = 'Histórico ficticio') <> 123456.78 then raise exception 'FALLA E6 (% filas)', n_despues; end if;
  if not exists (select from public.jobs j join public.client_quotes q on q.job_id = j.id
    where j.id = 'd0000000-0000-4000-8000-000000000001' and j.net_price = 123456.78
      and q.net_price = 123456.78 and q.total = 123456.78 and j.status = 'aceptada' and j.payment = 'recibido')
  then raise exception 'FALLA E6: histórico alterado'; end if;
  raise notice 'OK E6 cotización histórica con 123456,78: estado y pago actualizados por el dueño, precio intacto';

  -- E7 · cambiar el precio a un valor con decimales (rol con privilegio, p. ej. mantenimiento): rechazado.
  begin
    update public.jobs set net_price = 100.5 where client_name = 'Histórico ficticio';
    raise exception 'FALLA E7';
  exception when check_violation then
    if sqlerrm <> 'El precio final debe ser en pesos enteros (sin decimales)' then raise; end if;
  end;
  begin
    update public.client_quotes set net_price = 100, tax_amount = 0.5, total = 100.5
      where job_id = 'd0000000-0000-4000-8000-000000000001';
    raise exception 'FALLA E7: cambio fraccionario del documento';
  exception when check_violation then
    if sqlerrm <> 'El precio final debe ser en pesos enteros (sin decimales)' then raise; end if;
  end;
  raise notice 'OK E7 actualizar net_price a 100,5 (aun con privilegios): rechazado';
end $$;
rollback;
select 'PRECIO_SQL_COMPLETO';
