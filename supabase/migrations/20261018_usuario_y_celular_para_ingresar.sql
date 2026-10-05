-- Ingreso con usuario o celular, ademas del email.
--
-- El organizador crea a su equipo (RRPP, controladores, puerta, bartenders)
-- y les manda los datos por WhatsApp. Para que no dependan de acordarse el
-- email, ahora cada uno tiene un nombre de usuario (se genera solo al
-- crearlo, ver lib/staff/credentials.ts) y tambien puede entrar con su
-- celular.
--
-- cp_login_email traduce lo que la persona escribio en el login (email,
-- usuario o celular) al email de su cuenta. Solo la llama el servidor
-- (service_role) desde /api/auth/ingresar, que hace el inicio de sesion ahi
-- mismo: el email nunca vuelve al navegador, asi que no sirve para averiguar
-- el email de otro a partir de su celular o usuario.
begin;

alter table public.profiles add column if not exists username text;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z][a-z0-9._]{2,29}$') not valid;
alter table public.profiles validate constraint profiles_username_format;

create unique index if not exists profiles_username_lower_uq
  on public.profiles (lower(username)) where username is not null;

create or replace function public.cp_login_email(p_identifier text)
returns text
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_input text := btrim(coalesce(p_identifier, ''));
  v_email text;
  v_digits text;
  v_key text;
  v_count integer;
begin
  if v_input = '' then
    return null;
  end if;

  if position('@' in v_input) > 0 then
    return lower(v_input);
  end if;

  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username is not null and lower(p.username) = lower(v_input)
  limit 1;
  if v_email is not null then
    return v_email;
  end if;

  -- Celular: se comparan los ultimos 10 digitos (codigo de area + numero),
  -- asi da igual si se cargo con +54 9, con 0 adelante o sin nada. Si el
  -- mismo celular esta en mas de una cuenta, no se adivina: hay que entrar
  -- con usuario o email.
  v_digits := regexp_replace(v_input, '\D', '', 'g');
  if length(v_digits) < 10 then
    return null;
  end if;
  v_key := right(v_digits, 10);

  select count(*), min(x.email) into v_count, v_email
  from (
    select distinct u.id, u.email
    from auth.users u
    left join public.profiles p on p.id = u.id
    where right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10) = v_key
       or right(regexp_replace(coalesce(u.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), 10) = v_key
  ) x;

  if v_count = 1 then
    return v_email;
  end if;
  return null;
end;
$function$;

revoke all on function public.cp_login_email(text) from public, anon, authenticated;
grant execute on function public.cp_login_email(text) to service_role;

commit;

notify pgrst, 'reload schema';
