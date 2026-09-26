-- Billetera del socio premium: saldo que el organizador carga (efectivo/
-- transferencia recibidos por fuera, igual que el traslado pago) y que se
-- puede usar para pagar consumiciones -- por ahora como registro manual del
-- organizador (no esta integrado a la venta de barra/stock todavia, eso
-- queda para una vuelta aparte). balance_minor es un espejo rapido; la
-- fuente de verdad real es wallet_transactions (para poder auditar cada
-- movimiento) y un trigger lo mantiene sincronizado siempre.
begin;

alter table public.premium_members add column if not exists balance_minor bigint not null default 0;

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.premium_members(id) on delete cascade,
  amount_minor bigint not null check (amount_minor <> 0),
  kind text not null check (kind in ('topup', 'spend', 'adjustment')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists wallet_transactions_member_idx on public.wallet_transactions (member_id, created_at desc);

alter table public.wallet_transactions enable row level security;
revoke all on public.wallet_transactions from anon, authenticated;
grant all on public.wallet_transactions to service_role;

-- Mueve saldo (carga/consumo/ajuste) de forma atomica: bloquea la fila del
-- socio, valida que no quede negativo, actualiza balance_minor y deja el
-- registro en wallet_transactions en la MISMA transaccion -- balance_minor
-- nunca puede desincronizarse de la suma de sus movimientos.
create or replace function public.wallet_move(
  p_member_id uuid,
  p_amount_minor bigint,
  p_kind text,
  p_note text default null
)
returns table(new_balance_minor bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org_id uuid;
  v_balance bigint;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if p_kind not in ('topup', 'spend', 'adjustment') then
    raise exception 'Tipo de movimiento invalido.';
  end if;

  if p_amount_minor = 0 then
    raise exception 'El monto no puede ser cero.';
  end if;

  select organization_id, balance_minor into v_org_id, v_balance
  from public.premium_members
  where id = p_member_id
  for update;

  if v_org_id is null then
    raise exception 'El socio no existe.';
  end if;

  if not (public.is_platform_admin() or exists (
    select 1 from public.organization_members om
    where om.organization_id = v_org_id and om.user_id = auth.uid()
      and om.role = 'organizer' and om.status = 'active'
  )) then
    raise exception 'No tenes permiso sobre este socio.';
  end if;

  if v_balance + p_amount_minor < 0 then
    raise exception 'Saldo insuficiente.';
  end if;

  update public.premium_members set balance_minor = balance_minor + p_amount_minor, updated_at = now()
  where id = p_member_id;

  insert into public.wallet_transactions(member_id, amount_minor, kind, note, created_by)
  values (p_member_id, p_amount_minor, p_kind, nullif(trim(coalesce(p_note, '')), ''), auth.uid());

  return query select v_balance + p_amount_minor;
end;
$function$;

grant execute on function public.wallet_move(uuid, bigint, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
