-- T6c reescrita para #52 (docs/23 §5). Reemplaza a la T6c de pruebas-borradores.sql SOLO en este
-- ensayo: con la propuesta, la precondición original (INSERT directo en jobs) ya no es posible.
-- (1) el INSERT directo se rechaza; (2) la capa «marca de transacción» de M3 sigue: un trabajo creado
-- SIN el guardado v2 (aquí por el superusuario, en la misma transacción) no puede recibir líneas.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  insert into public.jobs (owner_id, number, issued_number, quote_date, client_name, net_price, internal)
    values ('00000000-0000-0000-0000-00000000000a', 999999, 999999, '2026-11-20', 'Directo', 1000, '{}'::jsonb);
  raise exception 'FALLA T6c-1: INSERT directo aceptado';
exception when insufficient_privilege then raise notice 'OK T6c-1 INSERT directo en jobs rechazado (#52)';
end $$;
reset role;
insert into public.jobs (id, owner_id, number, issued_number, quote_date, client_name, net_price, internal)
  values ('99999999-9999-4999-8999-999999999999', '00000000-0000-0000-0000-00000000000a', 999999, 999999, '2026-11-20', 'Sin v2', 1000, '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  perform private.insert_cargo_items('99999999-9999-4999-8999-999999999999', prueba.items(1));
  raise exception 'FALLA T6c-2: líneas insertadas sin pasar por el guardado v2';
exception when insufficient_privilege then raise notice 'OK T6c-2 sin la marca del guardado v2 (o sin acceso a private, con B+) no se insertan líneas';
end $$;
rollback;

