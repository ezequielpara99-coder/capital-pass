-- Recarga de saldo con Mercado Pago: el socio se carga plata desde su app y
-- el pago va DIRECTO a la cuenta de Mercado Pago del organizador (la misma
-- que ya usa para vender entradas online). Cuando Mercado Pago confirma el
-- pago, el webhook llama a member_wallet_topup_apply, que acredita el saldo
-- en la MISMA transaccion en que marca la recarga como aprobada -- asi un
-- reintento del webhook (o el "verificar mi pago" del socio) nunca acredita
-- dos veces. mp_payment_id es unico: un mismo pago no puede acreditarse en
-- dos recargas distintas.
begin;

create table if not exists public.wallet_topups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_id uuid not null references public.premium_members(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'refunded')),
  mp_payment_id text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wallet_topups_member_idx on public.wallet_topups (member_id, created_at desc);
create index if not exists wallet_topups_org_idx on public.wallet_topups (organization_id, created_at desc);
create unique index if not exists wallet_topups_payment_uq on public.wallet_topups (mp_payment_id) where mp_payment_id is not null;

alter table public.wallet_topups enable row level security;
revoke all on public.wallet_topups from anon, authenticated;
grant all on public.wallet_topups to service_role;

-- p_status es el estado que informa Mercado Pago (approved, rejected,
-- cancelled, refunded, charged_back, pending, in_process...). El monto, la
-- cuenta cobradora y el modo (live/sandbox) los verifica el codigo ANTES de
-- llamar a esta funcion.
create or replace function public.member_wallet_topup_apply(p_topup_id uuid, p_payment_id text, p_status text)
returns table(applied boolean, new_status text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_topup public.wallet_topups%rowtype;
  v_target text;
  v_balance bigint;
  v_debit bigint;
begin
  select * into v_topup from public.wallet_topups where id = p_topup_id for update;
  if not found then
    raise exception 'La recarga no existe.';
  end if;

  v_target := case
    when p_status = 'approved' then 'approved'
    when p_status in ('refunded', 'charged_back') then 'refunded'
    when p_status in ('rejected', 'cancelled') then 'rejected'
    else 'pending'
  end;

  if v_target = 'pending' then
    return query select false, v_topup.status;
    return;
  end if;

  -- Un intento rechazado puede reintentarse con la misma preferencia y
  -- terminar aprobado, por eso 'rejected' tambien puede pasar a 'approved'.
  if v_target = 'approved' and v_topup.status in ('pending', 'rejected') then
    update public.premium_members set balance_minor = balance_minor + v_topup.amount_minor, updated_at = now()
    where id = v_topup.member_id;

    insert into public.wallet_transactions (member_id, amount_minor, kind, note)
    values (v_topup.member_id, v_topup.amount_minor, 'topup', 'Recarga con Mercado Pago');

    update public.wallet_topups set status = 'approved', mp_payment_id = p_payment_id, approved_at = now() where id = v_topup.id;
    return query select true, 'approved'::text;
    return;
  end if;

  if v_target = 'rejected' and v_topup.status = 'pending' then
    update public.wallet_topups set status = 'rejected' where id = v_topup.id;
    return query select false, 'rejected'::text;
    return;
  end if;

  -- Pago devuelto despues de acreditar: se descuenta lo que todavia quede
  -- (no se puede quitar lo que el socio ya consumio).
  if v_target = 'refunded' and v_topup.status = 'approved' then
    select balance_minor into v_balance from public.premium_members where id = v_topup.member_id for update;
    v_debit := least(coalesce(v_balance, 0), v_topup.amount_minor);
    if v_debit > 0 then
      update public.premium_members set balance_minor = balance_minor - v_debit, updated_at = now() where id = v_topup.member_id;
      insert into public.wallet_transactions (member_id, amount_minor, kind, note)
      values (v_topup.member_id, -v_debit, 'adjustment', 'Recarga reembolsada por Mercado Pago');
    end if;
    update public.wallet_topups set status = 'refunded' where id = v_topup.id;
    return query select true, 'refunded'::text;
    return;
  end if;

  return query select false, v_topup.status;
end;
$function$;

revoke all on function public.member_wallet_topup_apply(uuid, text, text) from public, anon, authenticated;
grant execute on function public.member_wallet_topup_apply(uuid, text, text) to service_role;

commit;

notify pgrst, 'reload schema';
