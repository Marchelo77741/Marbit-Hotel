create schema if not exists extensions;
alter extension btree_gist set schema extensions;
comment on table public.platform_admins is 'Sin políticas a propósito: solo se lee mediante funciones private.is_admin (security definer).';
