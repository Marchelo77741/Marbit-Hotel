-- Marbit-Hotel · 005 · una habitación no puede estar en dos reservaciones activas las mismas noches
-- (lo garantiza la base de datos, incluso si dos dispositivos reservan a la vez o sin señal).
alter table public.reservation_rooms
  add column check_in date not null,
  add column check_out date not null,
  add column blocking boolean not null default true;

alter table public.reservation_rooms
  add constraint reservation_rooms_no_overlap
  exclude using gist (room_id with =, daterange(check_in, check_out, '[)') with &&) where (blocking);

-- Las fechas y si bloquea siempre salen de la reservación (el dispositivo no las decide).
create function private.fill_room_dates() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select r.check_in, r.check_out, (r.status <> 'cancelada' and r.deleted_at is null)
    into new.check_in, new.check_out, new.blocking
  from public.reservations r where r.id = new.reservation_id;
  return new;
end $$;
create trigger reservation_rooms_fill before insert on public.reservation_rooms
  for each row execute function private.fill_room_dates();

create function private.sync_room_dates() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.reservation_rooms
     set check_in = new.check_in, check_out = new.check_out,
         blocking = (new.status <> 'cancelada' and new.deleted_at is null)
   where reservation_id = new.id;
  return new;
end $$;
create trigger reservations_sync_rooms after update of check_in, check_out, status, deleted_at on public.reservations
  for each row execute function private.sync_room_dates();
