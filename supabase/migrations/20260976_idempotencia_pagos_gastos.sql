-- quote_payments y expenses no tenian ninguna proteccion contra un insert
-- duplicado por reintento de red (la unica proteccion era el front-end
-- deshabilitando el boton mientras guarda, que no cubre un reintento real
-- del fetch). Mismo patron ya usado en packs mensuales: columna de
-- idempotencia opcional + indice unico parcial.
begin;

alter table public.quote_payments add column if not exists idempotency_key uuid;
alter table public.expenses add column if not exists idempotency_key uuid;

create unique index if not exists quote_payments_idempotency_uq on public.quote_payments (idempotency_key) where idempotency_key is not null;
create unique index if not exists expenses_idempotency_uq on public.expenses (idempotency_key) where idempotency_key is not null;

commit;

notify pgrst, 'reload schema';
