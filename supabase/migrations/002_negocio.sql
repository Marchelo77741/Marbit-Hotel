-- Marbit-Hotel · 002 · datos de cada posada (habitaciones, reservas, pagos, cotizaciones, solicitudes, sitio y dominios)
-- Todas las filas llevan tenant_id. Los ids los genera el dispositivo (uuid) para poder trabajar sin señal.
-- client_updated_at = cuándo se editó en el dispositivo (para que gane el cambio más reciente al sincronizar);
-- updated_at = cuándo llegó al servidor. Lo borrado se marca con deleted_at.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  type text not null default 'sencilla' check (type in ('sencilla','doble')),
  capacity int not null default 1 check (capacity between 1 and 30),
  active boolean not null default true,
  description text not null default '' check (length(description) <= 2000),
  status text not null default 'disponible' check (status in ('disponible','no-disponible','oculta')),
  show_price boolean not null default false,
  public_price numeric(10,2) check (public_price is null or public_price >= 0),
  photos jsonb not null default '[]' check (jsonb_typeof(photos) = 'array'),
  sort int not null default 0,
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index rooms_name_uq on public.rooms(tenant_id, lower(name)) where deleted_at is null;

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  folio int,
  guest text not null default '' check (length(guest) <= 200),
  phone text not null default '' check (length(phone) <= 40),
  guests int not null default 1 check (guests between 0 and 100),
  check_in date not null,
  check_out date not null,
  arrival_time text not null default '' check (arrival_time = '' or arrival_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  total numeric(12,2) not null default 0 check (total >= 0),
  status text not null default 'pendiente' check (status in ('pendiente','confirmada','cancelada')),
  notes text not null default '' check (length(notes) <= 4000),
  client_reminders jsonb not null default '{}' check (jsonb_typeof(client_reminders) = 'object'),
  quote_id uuid,
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (check_out > check_in)
);
create unique index reservations_folio_uq on public.reservations(tenant_id, folio) where folio is not null;
create index reservations_in_idx on public.reservations(tenant_id, check_in);
create index reservations_out_idx on public.reservations(tenant_id, check_out);

create table public.reservation_rooms (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nightly_rate numeric(10,2) not null default 0 check (nightly_rate >= 0),
  primary key (reservation_id, room_id)
);
create index reservation_rooms_room_idx on public.reservation_rooms(room_id);
create index reservation_rooms_tenant_idx on public.reservation_rooms(tenant_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  receipt_no int,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'efectivo' check (method in ('efectivo','transferencia','tarjeta')),
  paid_at timestamptz not null default now(),
  note text not null default '' check (length(note) <= 500),
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index payments_receipt_uq on public.payments(tenant_id, receipt_no) where receipt_no is not null;
create index payments_res_idx on public.payments(reservation_id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number int,
  folio text not null default '',
  quote_date date not null default current_date,
  client text not null default '',
  phone text not null default '',
  email text not null default '',
  guests int not null default 1,
  arrival date,
  departure date,
  nights int not null default 1,
  check_in_time text not null default '',
  check_out_time text not null default '',
  rooms_text text not null default '',
  note text not null default '',
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  status text not null default 'abierta' check (status in ('abierta','reservada','descartada')),
  reservation_id uuid references public.reservations(id) on delete set null,
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index quotes_number_uq on public.quotes(tenant_id, number) where number is not null;
create index quotes_tenant_idx on public.quotes(tenant_id);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null check (type in ('Hospedaje','Servicio','Alimento')),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  price numeric(10,2) not null default 0 check (price >= 0),
  cap int not null default 0,
  sort int not null default 0,
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index catalog_tenant_idx on public.catalog_items(tenant_id);

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  room_name text not null default '',
  name text not null check (length(trim(name)) between 2 and 80),
  channel text not null check (channel in ('whatsapp','email')),
  phone text not null default '',
  email text not null default '',
  check_in date,
  check_out date,
  guests int not null default 0 check (guests between 0 and 30),
  message text not null default '' check (length(message) <= 800),
  status text not null default 'nueva' check (status in ('nueva','atendida','descartada')),
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- el visitante debe dejar el dato del canal que eligió
  check ((channel = 'whatsapp' and length(regexp_replace(phone, '\D', '', 'g')) >= 10) or (channel = 'email' and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'))
);
create index inquiries_tenant_idx on public.inquiries(tenant_id, status);

-- Ajustes de la posada (todo lo de Settings menos los contadores). field_updated_at permite unir campo por campo.
create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  field_updated_at jsonb not null default '{}' check (jsonb_typeof(field_updated_at) = 'object'),
  updated_at timestamptz not null default now()
);

-- Contenido del sitio web de la posada (portada, galería, comentarios, contacto, secciones, tema).
create table public.site_content (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 200000),
  updated_at timestamptz not null default now()
);

-- Dominios propios: los contrata y enlaza la plataforma (Marbit-Hotel).
create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  domain text not null unique check (domain = lower(domain) and domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'),
  is_primary boolean not null default false,
  status text not null default 'pendiente' check (status in ('pendiente','activo','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tenant_domains_primary_uq on public.tenant_domains(tenant_id) where is_primary;
create index tenant_domains_tenant_idx on public.tenant_domains(tenant_id);

-- ---------- triggers ----------
do $$
declare t text;
begin
  foreach t in array array['rooms','reservations','payments','quotes','catalog_items','inquiries','tenant_settings','site_content','tenant_domains'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- Una fila nunca cambia de posada.
create function private.lock_tenant() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.tenant_id is distinct from old.tenant_id then raise exception 'No se puede mover un registro a otra posada'; end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['rooms','reservations','reservation_rooms','payments','quotes','catalog_items','inquiries','tenant_settings','site_content','tenant_domains'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.lock_tenant()', t || '_lock', t);
  end loop;
end $$;

-- Folios, recibos y números de cotización los asigna el servidor (sin repetirse entre dispositivos).
create function private.assign_numbers() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'reservations' then new.folio := private.take_counter(new.tenant_id, 'folio', new.folio);
  elsif tg_table_name = 'payments' then new.receipt_no := private.take_counter(new.tenant_id, 'receipt', new.receipt_no);
  elsif tg_table_name = 'quotes' then new.number := private.take_counter(new.tenant_id, 'quote', new.number);
  end if;
  return new;
end $$;
create trigger reservations_numbers before insert on public.reservations for each row execute function private.assign_numbers();
create trigger payments_numbers before insert on public.payments for each row execute function private.assign_numbers();
create trigger quotes_numbers before insert on public.quotes for each row execute function private.assign_numbers();

-- Una reservación, un pago o una asignación solo pueden ligarse a datos de la misma posada.
create function private.same_tenant_children() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'reservation_rooms' then
    if not exists (select 1 from public.reservations r where r.id = new.reservation_id and r.tenant_id = new.tenant_id)
       or not exists (select 1 from public.rooms r where r.id = new.room_id and r.tenant_id = new.tenant_id) then
      raise exception 'La habitación o la reservación no pertenecen a esta posada';
    end if;
  elsif tg_table_name = 'payments' then
    if not exists (select 1 from public.reservations r where r.id = new.reservation_id and r.tenant_id = new.tenant_id) then
      raise exception 'La reservación no pertenece a esta posada';
    end if;
  end if;
  return new;
end $$;
create trigger reservation_rooms_same before insert or update on public.reservation_rooms for each row execute function private.same_tenant_children();
create trigger payments_same before insert or update on public.payments for each row execute function private.same_tenant_children();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['rooms','reservations','reservation_rooms','payments','quotes','catalog_items','inquiries','tenant_settings','site_content'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.can_read(tenant_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.can_write(tenant_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.can_write(tenant_id)) with check (private.can_write(tenant_id))', t || '_update', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete on public.%I from authenticated', t);
  end loop;
end $$;
-- las asignaciones de habitación se reemplazan al guardar una reservación
create policy reservation_rooms_delete on public.reservation_rooms for delete to authenticated using (private.can_write(tenant_id));
grant delete on public.reservation_rooms to authenticated;

alter table public.tenant_domains enable row level security;
create policy tenant_domains_select on public.tenant_domains for select to authenticated
  using (private.can_read(tenant_id) or private.is_admin());
create policy tenant_domains_admin on public.tenant_domains for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
revoke all on public.tenant_domains from anon;
