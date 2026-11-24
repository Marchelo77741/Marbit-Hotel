-- Marbit-Hotel · 009 · invitar al equipo por correo
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  role text not null check (role in ('owner','reception','viewer')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index invitations_pending_uq on public.invitations(tenant_id, email) where accepted_at is null;
create index invitations_email_idx on public.invitations(email) where accepted_at is null;
alter table public.invitations enable row level security;
create policy invitations_owner on public.invitations for all to authenticated
  using (private.is_owner(tenant_id)) with check (private.is_owner(tenant_id));
revoke all on public.invitations from anon, authenticated;
grant select, insert, delete on public.invitations to authenticated;

-- Al iniciar sesión, el usuario reclama las invitaciones dirigidas a su correo (confirmado).
create function public.claim_invitations() returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; em text;
begin
  select lower(u.email) into em from auth.users u
   where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
  if em is null then return 0; end if;
  insert into public.memberships(tenant_id, user_id, role)
    select i.tenant_id, (select auth.uid()), i.role from public.invitations i
    join public.tenants t on t.id = i.tenant_id and t.deleted_at is null
    where i.email = em and i.accepted_at is null
  on conflict (tenant_id, user_id) do nothing;
  get diagnostics n = row_count;
  update public.invitations set accepted_at = now() where email = em and accepted_at is null;
  return n;
end $$;
revoke all on function public.claim_invitations() from public, anon;
grant execute on function public.claim_invitations() to authenticated;

-- Equipo de una posada con correos (solo el dueño).
create function public.team_members(p_tenant uuid) returns table(user_id uuid, email text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner(p_tenant) then raise exception 'sin permiso'; end if;
  return query select m.user_id, u.email::text, m.role from public.memberships m
    join auth.users u on u.id = m.user_id where m.tenant_id = p_tenant order by m.created_at;
end $$;
revoke all on function public.team_members(uuid) from public, anon;
grant execute on function public.team_members(uuid) to authenticated;
