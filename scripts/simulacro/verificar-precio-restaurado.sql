-- Solo en el clúster local temporal. Estas sondas deben fallar ANTES de comprobar
-- las demás columnas obligatorias. Sirven también para respaldos sin cotizaciones.
begin;
do $$
declare
  prueba text;
begin
  foreach prueba in array array[
    'insert into public.jobs (net_price) values (123.5)',
    'insert into public.client_quotes (net_price, tax_amount, total) values (123.5, 0, 124)',
    'insert into public.client_quotes (net_price, tax_amount, total) values (123, 0.5, 124)',
    'insert into public.client_quotes (net_price, tax_amount, total) values (123, 0, 123.5)'
  ] loop
    begin
      execute prueba;
      raise exception 'La restauración aceptó un precio nuevo con fracción';
    exception when check_violation then
      if sqlerrm <> 'El precio final debe ser en pesos enteros (sin decimales)' then
        raise exception 'Restricción de precio distinta de A-83 en la restauración local';
      end if;
    end;
  end loop;
end $$;
rollback;
