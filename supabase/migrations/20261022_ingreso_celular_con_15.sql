-- Ingreso con celular (cp_login_email): comparaba los ultimos 10 digitos,
-- asi que un celular cargado con el "15" ("3462 15 555666") no coincidia
-- con el mismo numero tipeado sin el 15 (o al reves) y la persona no podia
-- entrar con su celular.
--
-- cp_phone_key pasa cualquier formato argentino a la misma clave de 10
-- digitos (caracteristica + numero, sin 0, sin 54 9 y sin 15) -- misma
-- logica que lib/whatsapp/phone.ts -- y se aplica tanto al numero guardado
-- como al tipeado. Si el numero no tiene forma de celular argentino,
-- devuelve null y no matchea nada.
begin;

create or replace function public.cp_phone_key(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
  v_national text;
  v_area integer;
begin
  if v_digits = '' then
    return null;
  end if;

  if left(v_digits, 2) = '54' then
    v_national := substr(v_digits, 3);
    if left(v_national, 1) = '9' then
      v_national := substr(v_national, 2);
    end if;
  elsif left(v_digits, 1) = '0' then
    v_national := substr(v_digits, 2);
  else
    v_national := v_digits;
  end if;

  -- El "15" va despues de la caracteristica: con el, son 12 digitos.
  if length(v_national) = 12 then
    v_area := case
      when left(v_national, 2) = '11' then 2
      when left(v_national, 3) in (
        '220', '221', '223', '230', '236', '237', '249', '260', '261', '263', '264',
        '266', '280', '291', '294', '297', '298', '299', '341', '342', '343', '345',
        '348', '351', '353', '358', '362', '364', '370', '376', '379', '380', '381',
        '383', '385', '387', '388'
      ) then 3
      else 4
    end;
    if substr(v_national, v_area + 1, 2) = '15' then
      v_national := left(v_national, v_area) || substr(v_national, v_area + 3);
    end if;
  end if;

  if length(v_national) = 10 then
    return v_national;
  end if;
  return null;
end;
$$;

create or replace function public.cp_login_email(p_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_input text := btrim(coalesce(p_identifier, ''));
  v_email text;
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

  -- Celular: misma clave sin importar si se cargo con +54 9, con 0, con 15
  -- o sin nada. Si el mismo celular esta en mas de una cuenta, no se
  -- adivina: hay que entrar con usuario o email.
  v_key := public.cp_phone_key(v_input);
  if v_key is null then
    return null;
  end if;

  select count(*), min(x.email) into v_count, v_email
  from (
    select distinct u.id, u.email
    from auth.users u
    left join public.profiles p on p.id = u.id
    where public.cp_phone_key(p.phone) = v_key
       or public.cp_phone_key(u.raw_user_meta_data->>'phone') = v_key
  ) x;

  if v_count = 1 then
    return v_email;
  end if;
  return null;
end;
$$;

revoke all on function public.cp_login_email(text) from public, anon, authenticated;
grant execute on function public.cp_login_email(text) to service_role;

commit;

notify pgrst, 'reload schema';
