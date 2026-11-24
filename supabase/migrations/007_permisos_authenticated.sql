-- Sin esto RLS no sirve de nada: authenticated no tenía SELECT/INSERT/UPDATE y sí TRUNCATE (que se salta RLS).
revoke truncate, references, trigger on all tables in schema public from authenticated, anon;
grant select, insert, update on public.rooms, public.reservations, public.payments, public.quotes,
  public.catalog_items, public.inquiries, public.tenant_settings, public.site_content to authenticated;
grant select, insert, update, delete on public.memberships, public.tenant_domains to authenticated;
grant select on public.tenants to authenticated;
grant update (name) on public.tenants to authenticated;
grant select, insert, update on public.reservation_rooms to authenticated;
