-- PRUEBA DEL SIMULACRO (A-77): datos FICTICIOS para el origen (dominio .invalid, contraseñas falsas).
-- Se crean como lo haría la app: usuarios en auth y, como `authenticated`, perfiles, vehículos,
-- cotizaciones (nuevas, importada con número ocupado e importada con número alto) y enlaces.
\set ON_ERROR_STOP 1
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, last_sign_in_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'ana@prueba.invalid',
   '$2a$10$FICTICIOFICTICIOFICTICIOFICTICIOFICTICIOFICTICIOFICTI', '2026-11-18 10:00:00+00',
   '{"provider":"email","providers":["email"]}', '{"nombre":"Ána Ñandú \"comillas\" y \\barra\\"}', false, '2026-11-18 10:00:00+00', '2026-11-20 12:00:00+00', '2026-11-21 08:30:00+00'),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'beto@prueba.invalid',
   '$2a$10$OTROFICTICIOOTROFICTICIOOTROFICTICIOOTROFICTICIOOTROFI', null,
   '{"provider":"email"}', '{}', false, '2026-11-19 09:00:00+00', '2026-11-19 09:00:00+00', null);
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, id)
values
  ('a0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', '{"sub":"a0000000-0000-4000-8000-00000000000a","email":"ana@prueba.invalid","email_verified":true}', 'email', '2026-11-18 10:00:00+00', '2026-11-18 10:00:00+00', 'c0000000-0000-4000-8000-00000000000a'),
  ('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', '{"sub":"b0000000-0000-4000-8000-00000000000b","email":"beto@prueba.invalid"}', 'email', '2026-11-19 09:00:00+00', '2026-11-19 09:00:00+00', 'c0000000-0000-4000-8000-00000000000b');
insert into auth.sessions values ('d0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', now(), 'aal1');
insert into auth.refresh_tokens (token, user_id, revoked, session_id) values ('tokenficticio', 'a0000000-0000-4000-8000-00000000000a', false, 'd0000000-0000-4000-8000-00000000000a');
insert into storage.buckets values ('vacio', 'vacio', false);

create function pg_temp.guardar(p_uid uuid, p_job jsonb) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
  r := public.create_job_with_quote(p_job, jsonb_build_object('issued_at', '2026-11-21', 'client_name', p_job ->> 'client_name', 'net_price', 50000, 'total', 50000));
  execute 'reset role';
  return r;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-00000000000a', true);
insert into public.profiles (id, business_name) values ('a0000000-0000-4000-8000-00000000000a', 'Fletes Ficticios Ñuñoa');
insert into public.vehicles (name, type, fuel, km_per_l, wear_per_km) values ('Camioneta ficticia', 'camioneta', 'diesel', 11, 40), ('Furgón ficticio', 'furgon', 'gasolina', 9, null);
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-00000000000b', true);
insert into public.vehicles (name, type, fuel, km_per_l, wear_per_km) values ('Camión ficticio', 'camionLiviano', 'diesel', 6.5, 55);
commit;
-- Cotizaciones de A: 4 nuevas, una importada con número ocupado (3) y una importada con número alto (900).
select pg_temp.guardar('a0000000-0000-4000-8000-00000000000a', jsonb_build_object('quote_date', '2026-11-21', 'client_name', 'Cliente ficticio ' || g, 'net_price', 50000 + g, 'internal', jsonb_build_object('engineVersion', 'x')))
  from generate_series(1, 4) g;
select pg_temp.guardar('a0000000-0000-4000-8000-00000000000a', '{"local_id":"e0000000-0000-4000-8000-000000000001","issued_number":3,"quote_date":"2026-11-21","client_name":"Importada ocupada","net_price":50000,"internal":{"engineVersion":"x"}}');
select pg_temp.guardar('a0000000-0000-4000-8000-00000000000a', '{"local_id":"e0000000-0000-4000-8000-000000000002","issued_number":900,"quote_date":"2026-11-21","client_name":"Importada alta","net_price":50000,"internal":{"engineVersion":"x"}}');
-- Cotizaciones de B: 2 nuevas; se borra la última (su número no se reutiliza).
select pg_temp.guardar('b0000000-0000-4000-8000-00000000000b', jsonb_build_object('quote_date', '2026-11-21', 'client_name', 'Cliente B ' || g, 'net_price', 70000, 'internal', jsonb_build_object('engineVersion', 'x')))
  from generate_series(1, 2) g;
delete from public.jobs where owner_id = 'b0000000-0000-4000-8000-00000000000b' and number = 2;
-- Dos enlaces públicos (uno revocado), con hash de token ficticio.
insert into public.quote_shares (owner_id, quote_id, token_hash, revoked_at)
select q.owner_id, q.id, extensions.digest('token-ficticio-' || q.number, 'sha256'), case when q.number = 2 then now() end
  from public.client_quotes q where q.owner_id = 'a0000000-0000-4000-8000-00000000000a' and q.number in (1, 2);
