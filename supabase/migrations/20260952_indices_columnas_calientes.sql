-- Capital Pass: indices en columnas que se filtran constantemente
-- (event_id, sale_id, organization_id, etc.) pero que nunca tuvieron un
-- indice propio -- Postgres NO indexa automaticamente las columnas que
-- son claves foraneas (solo el lado que referencian). A medida que crecen
-- las tablas, cada consulta sin indice hace un sequential scan completo.
-- "if not exists" hace que sea seguro correrlo aunque alguna ya exista.
begin;

-- Entradas y ventas
create index if not exists sales_event_id_idx on public.sales (event_id);
create index if not exists sales_buyer_id_idx on public.sales (buyer_id) where buyer_id is not null;
create index if not exists sales_table_id_idx on public.sales (table_id) where table_id is not null;
create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_ticket_type_id_idx on public.sale_items (ticket_type_id);
create index if not exists sale_items_pack_id_idx on public.sale_items (pack_id) where pack_id is not null;
create index if not exists tickets_sale_id_idx on public.tickets (sale_id);
create index if not exists tickets_ticket_type_id_idx on public.tickets (ticket_type_id);
create index if not exists ticket_types_event_id_idx on public.ticket_types (event_id);

-- Membresias y staff
create index if not exists organization_members_organization_id_idx on public.organization_members (organization_id);
create index if not exists organization_members_user_id_idx on public.organization_members (user_id);
create index if not exists event_staff_event_id_idx on public.event_staff (event_id);
create index if not exists event_staff_organization_member_id_idx on public.event_staff (organization_member_id);

-- Reclamos
create index if not exists complaints_organization_id_idx on public.complaints (organization_id);

-- Packs
create index if not exists ticket_packs_event_id_idx on public.ticket_packs (event_id);
create index if not exists ticket_packs_ticket_type_id_idx on public.ticket_packs (ticket_type_id);

-- Modulo de stock (barras, bartenders, mesas)
create index if not exists event_products_product_id_idx on public.event_products (product_id);
create index if not exists bars_event_id_idx on public.bars (event_id);
create index if not exists bar_tables_event_id_idx on public.bar_tables (event_id);
create index if not exists bar_sales_event_id_idx on public.bar_sales (event_id);
create index if not exists bar_sales_bar_id_idx on public.bar_sales (bar_id);
create index if not exists bar_sales_event_product_id_idx on public.bar_sales (event_product_id);
create index if not exists bar_sales_bartender_member_id_idx on public.bar_sales (bartender_member_id);
create index if not exists bar_sales_table_id_idx on public.bar_sales (table_id) where table_id is not null;
create index if not exists bar_sales_ticket_id_idx on public.bar_sales (ticket_id) where ticket_id is not null;
create index if not exists stock_movements_event_id_idx on public.stock_movements (event_id);
create index if not exists stock_movements_event_product_id_idx on public.stock_movements (event_product_id);
create index if not exists stock_movements_bar_id_idx on public.stock_movements (bar_id) where bar_id is not null;

commit;
