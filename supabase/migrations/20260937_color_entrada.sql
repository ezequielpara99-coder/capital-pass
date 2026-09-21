-- Color de la entrada digital: el organizador elige el color de acento del
-- diseño de vidrio de Capital Pass (null = el color estandar).
begin;

alter table public.events add column if not exists ticket_accent_color text;

alter table public.events drop constraint if exists events_ticket_accent_color_check;
alter table public.events add constraint events_ticket_accent_color_check
  check (ticket_accent_color is null or ticket_accent_color ~ '^#[0-9a-fA-F]{6}$');

commit;

notify pgrst, 'reload schema';
