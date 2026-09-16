-- =============================================================
-- Bucket publico para fotos/logos de bebidas del catalogo. Las subidas
-- se hacen siempre desde una API route con el cliente de service_role
-- (igual que el resto de escrituras sobre public.products), asi que no
-- hace falta ninguna policy sobre storage.objects.
--
-- El bloque "do" evita romper el entorno de test (PGlite), que no
-- tiene el esquema storage.
-- =============================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('product-assets', 'product-assets', true)
    on conflict (id) do nothing;
  end if;
end $$;
