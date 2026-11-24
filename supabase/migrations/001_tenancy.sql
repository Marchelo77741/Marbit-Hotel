-- Marbit-Hotel · 001 · inquilinos (posadas), equipo, contadores y funciones de acceso
create extension if not exists btree_gist;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  nickname text not null unique
    check (nickname ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
       and nickname not in ('www','app','api','admin','master','soporte','ayuda','mail','static','cdn','demo-admin')),
  name text not null check (length(trim(name)) between 2 and 120),
  plan text not null default 'prueba',
  status text not null default 'activo' check (status in ('activo','suspendido','cancelado')),
  trial_ends_at timestamptz default (now() + interval '30 days'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger tenants_touch before update on public.tenants for each row execute function private.touch_updated_at();

create table public.memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','reception','viewer')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);

create table public.platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);

create table public.tenant_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (name in ('folio','receipt','quote')),
  value int not null default 0,
  primary key (tenant_id, name)
);

-- ---------- funciones de acceso (no expuestas por la API: viven en "private") ----------
create function private.my_role(t uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m where m.tenant_id = t and m.user_id = (select auth.uid())
$$;
create function private.can_read(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.tenant_id = t and m.user_id = (select auth.uid()))
$$;
create function private.can_write(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.tenants x on x.id = m.tenant_id
    where m.tenant_id = t and m.user_id = (select auth.uid())
      and m.role in ('owner','reception') and x.status = 'activo' and x.deleted_at is null)
$$;
create function private.is_owner(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.tenant_id = t and m.user_id = (select auth.uid()) and m.role = 'owner')
$$;
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
$$;

-- Toma el siguiente número del contador de una posada (o registra uno que ya trae el dato importado).
create function private.take_counter(p_tenant uuid, p_name text, p_explicit int) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  if p_explicit is not null then
    insert into public.tenant_counters(tenant_id, name, value) values (p_tenant, p_name, p_explicit)
    on conflict (tenant_id, name) do update set value = greatest(public.tenant_counters.value, excluded.value);
    return p_explicit;
  end if;
  insert into public.tenant_counters(tenant_id, name, value) values (p_tenant, p_name, 1)
  on conflict (tenant_id, name) do update set value = public.tenant_counters.value + 1
  returning value into v;
  return v;
end $$;

-- Siempre debe quedar al menos un dueño en cada posada.
create function private.keep_one_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'DELETE' or new.role <> 'owner') and old.role = 'owner' then
    if not exists (select 1 from public.memberships where tenant_id = old.tenant_id and role = 'owner' and user_id <> old.user_id)
       and exists (select 1 from public.tenants where id = old.tenant_id) then
      raise exception 'La posada debe tener al menos un dueño';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger memberships_keep_owner before update of role or delete on public.memberships
  for each row execute function private.keep_one_owner();

-- Crear una posada: la persona que la crea queda como dueña.
create function public.create_tenant(p_nickname text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); tid uuid;
begin
  if uid is null then raise exception 'Inicia sesión primero'; end if;
  if (select count(*) from public.tenants where created_by = uid and deleted_at is null) >= 5 then
    raise exception 'Llegaste al máximo de posadas por cuenta';
  end if;
  insert into public.tenants(nickname, name, created_by) values (lower(trim(p_nickname)), trim(p_name), uid) returning id into tid;
  insert into public.memberships(tenant_id, user_id, role) values (tid, uid, 'owner');
  return tid;
end $$;
revoke all on function public.create_tenant(text, text) from public, anon;
grant execute on function public.create_tenant(text, text) to authenticated;

-- ---------- RLS ----------
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.platform_admins enable row level security;
alter table public.tenant_counters enable row level security;

create policy tenants_select on public.tenants for select to authenticated
  using (private.can_read(id) or private.is_admin());
create policy tenants_update on public.tenants for update to authenticated
  using (private.is_owner(id)) with check (private.is_owner(id));

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or private.can_read(tenant_id));
create policy memberships_owner_write on public.memberships for all to authenticated
  using (private.is_owner(tenant_id)) with check (private.is_owner(tenant_id));

create policy counters_select on public.tenant_counters for select to authenticated
  using (private.can_read(tenant_id));

revoke all on public.tenants, public.memberships, public.platform_admins, public.tenant_counters from anon;
revoke insert, delete on public.tenants from authenticated;
revoke all on public.platform_admins, public.tenant_counters from authenticated;
grant select on public.tenant_counters to authenticated;
-- El dueño solo puede cambiar el nombre; el plan y el estado los maneja la plataforma.
revoke update on public.tenants from authenticated;
grant update (name) on public.tenants to authenticated;
