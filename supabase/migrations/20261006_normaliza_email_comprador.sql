-- Bug real de la ronda de auditoria de "/mi" (portal del comprador): el
-- email del comprador se guarda con el casing que tipeo (create_sale,
-- create_online_sale, create_online_table_sale y el resto de las funciones
-- que insertan en buyers solo hacen btrim(), nunca lower()), pero para
-- entrar a /mi el login normaliza el email a minusculas antes de firmar el
-- token de sesion (app/api/mi/solicitar/route.ts). La consulta de /mi
-- compara ese email en minusculas contra buyers.email con un "eq" comun,
-- sensible a mayusculas en Postgres -- si el comprador tipeo
-- "Juan.Perez@Gmail.com" al comprar y despues pide el link con
-- "juan.perez@gmail.com" (autocompletado, o simplemente lo escribe en
-- minuscula), /mi le dice "no tenes entradas" aunque compro de verdad.
--
-- En vez de tocar cada funcion que inserta en buyers (son mas de diez,
-- repartidas en muchas migraciones, con alto riesgo de olvidarse una), un
-- trigger normaliza el email SIEMPRE que se guarda o edita un comprador,
-- sin importar por donde entre.
begin;

create or replace function public.cp_normalize_buyer_email()
returns trigger
language plpgsql
as $function$
begin
  if new.email is not null then
    new.email := nullif(lower(btrim(new.email)), '');
  end if;
  return new;
end;
$function$;

drop trigger if exists buyers_normalize_email on public.buyers;
create trigger buyers_normalize_email
  before insert or update on public.buyers
  for each row execute function public.cp_normalize_buyer_email();

-- Filas ya existentes con email en mayusculas/mezclado: se normalizan una
-- sola vez para que tambien puedan entrar a /mi.
update public.buyers set email = lower(btrim(email)) where email is not null and email <> lower(btrim(email));

commit;

notify pgrst, 'reload schema';
