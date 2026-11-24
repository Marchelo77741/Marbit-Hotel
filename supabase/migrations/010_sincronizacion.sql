-- Marbit-Hotel · 010 · funciones de sincronización (se ejecutan con los permisos de quien llama, así RLS sigue aplicando)

-- Guarda una reservación completa (datos + habitaciones + pagos) de forma atómica.
-- Si una habitación se traslapa, TODO se rechaza (error 23P01) y no queda nada a medias.
create function public.push_reservation(p_tenant uuid, p jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  rid uuid := (p->>'id')::uuid;
  stamp timestamptz := coalesce((p->>'client_updated_at')::timestamptz, now());
  cur timestamptz; ex boolean; fol int; rn int; pr jsonb; pid uuid; rc jsonb := '{}'::jsonb;
begin
  select r.client_updated_at into cur from public.reservations r where r.id = rid and r.tenant_id = p_tenant;
  ex := found;
  if ex and cur is not null and cur > stamp then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  if ex then
    update public.reservations set guest = coalesce(p->>'guest',''), phone = coalesce(p->>'phone',''),
      guests = coalesce((p->>'guests')::int, 1), check_in = (p->>'check_in')::date, check_out = (p->>'check_out')::date,
      arrival_time = coalesce(p->>'arrival_time',''), total = coalesce((p->>'total')::numeric, 0),
      status = coalesce(p->>'status','pendiente'), notes = coalesce(p->>'notes',''),
      client_reminders = coalesce(p->'client_reminders','{}'::jsonb), quote_id = nullif(p->>'quote_id','')::uuid,
      client_updated_at = stamp, deleted_at = null
    where id = rid and tenant_id = p_tenant returning folio into fol;
  else
    begin
      insert into public.reservations(id, tenant_id, folio, guest, phone, guests, check_in, check_out, arrival_time, total, status, notes, client_reminders, quote_id, client_updated_at, created_at)
      values (rid, p_tenant, nullif(p->>'folio','')::int, coalesce(p->>'guest',''), coalesce(p->>'phone',''), coalesce((p->>'guests')::int,1),
        (p->>'check_in')::date, (p->>'check_out')::date, coalesce(p->>'arrival_time',''), coalesce((p->>'total')::numeric,0),
        coalesce(p->>'status','pendiente'), coalesce(p->>'notes',''), coalesce(p->'client_reminders','{}'::jsonb),
        nullif(p->>'quote_id','')::uuid, stamp, coalesce((p->>'created_at')::timestamptz, now()))
      returning folio into fol;
    exception when unique_violation then
      -- folio repetido por otro dispositivo: el servidor asigna el siguiente
      insert into public.reservations(id, tenant_id, folio, guest, phone, guests, check_in, check_out, arrival_time, total, status, notes, client_reminders, quote_id, client_updated_at, created_at)
      values (rid, p_tenant, null, coalesce(p->>'guest',''), coalesce(p->>'phone',''), coalesce((p->>'guests')::int,1),
        (p->>'check_in')::date, (p->>'check_out')::date, coalesce(p->>'arrival_time',''), coalesce((p->>'total')::numeric,0),
        coalesce(p->>'status','pendiente'), coalesce(p->>'notes',''), coalesce(p->'client_reminders','{}'::jsonb),
        nullif(p->>'quote_id','')::uuid, stamp, coalesce((p->>'created_at')::timestamptz, now()))
      returning folio into fol;
    end;
  end if;

  delete from public.reservation_rooms where reservation_id = rid and tenant_id = p_tenant;
  insert into public.reservation_rooms(reservation_id, room_id, tenant_id, nightly_rate)
    select rid, (x->>'room_id')::uuid, p_tenant, coalesce((x->>'nightly_rate')::numeric, 0)
    from jsonb_array_elements(coalesce(p->'rooms','[]'::jsonb)) x;

  for pr in select * from jsonb_array_elements(coalesce(p->'payments','[]'::jsonb)) loop
    pid := (pr->>'id')::uuid;
    if exists (select 1 from public.payments where id = pid and tenant_id = p_tenant) then
      update public.payments set amount = (pr->>'amount')::numeric, method = coalesce(pr->>'method','efectivo'),
        paid_at = coalesce((pr->>'paid_at')::timestamptz, now()), note = coalesce(pr->>'note',''),
        client_updated_at = stamp, deleted_at = null
      where id = pid and tenant_id = p_tenant returning receipt_no into rn;
    else
      begin
        insert into public.payments(id, tenant_id, reservation_id, receipt_no, amount, method, paid_at, note, client_updated_at)
        values (pid, p_tenant, rid, nullif(pr->>'receipt_no','')::int, (pr->>'amount')::numeric, coalesce(pr->>'method','efectivo'),
          coalesce((pr->>'paid_at')::timestamptz, now()), coalesce(pr->>'note',''), stamp) returning receipt_no into rn;
      exception when unique_violation then
        insert into public.payments(id, tenant_id, reservation_id, receipt_no, amount, method, paid_at, note, client_updated_at)
        values (pid, p_tenant, rid, null, (pr->>'amount')::numeric, coalesce(pr->>'method','efectivo'),
          coalesce((pr->>'paid_at')::timestamptz, now()), coalesce(pr->>'note',''), stamp) returning receipt_no into rn;
      end;
    end if;
    rc := rc || jsonb_build_object(pr->>'id', rn);
  end loop;

  return jsonb_build_object('ok', true, 'folio', fol, 'receipts', rc);
end $$;
revoke all on function public.push_reservation(uuid, jsonb) from public, anon;
grant execute on function public.push_reservation(uuid, jsonb) to authenticated;

-- Marca como borrados (sin eliminar) los registros indicados, salvo que alguien los haya editado después.
create function public.soft_delete(p_tenant uuid, p_ids uuid[], p_at timestamptz) returns int
language plpgsql set search_path = '' as $$
declare n int := 0; c int;
begin
  update public.rooms set deleted_at = p_at, client_updated_at = p_at where tenant_id = p_tenant and id = any(p_ids) and deleted_at is null and coalesce(client_updated_at, '-infinity') <= p_at;
  get diagnostics c = row_count; n := n + c;
  update public.reservations set deleted_at = p_at, client_updated_at = p_at where tenant_id = p_tenant and id = any(p_ids) and deleted_at is null and coalesce(client_updated_at, '-infinity') <= p_at;
  get diagnostics c = row_count; n := n + c;
  update public.payments set deleted_at = p_at, client_updated_at = p_at where tenant_id = p_tenant and id = any(p_ids) and deleted_at is null and coalesce(client_updated_at, '-infinity') <= p_at;
  get diagnostics c = row_count; n := n + c;
  update public.quotes set deleted_at = p_at, client_updated_at = p_at where tenant_id = p_tenant and id = any(p_ids) and deleted_at is null and coalesce(client_updated_at, '-infinity') <= p_at;
  get diagnostics c = row_count; n := n + c;
  update public.catalog_items set deleted_at = p_at, client_updated_at = p_at where tenant_id = p_tenant and id = any(p_ids) and deleted_at is null and coalesce(client_updated_at, '-infinity') <= p_at;
  get diagnostics c = row_count; n := n + c;
  update public.inquiries set deleted_at = p_at, client_updated_at = p_at where tenant_id = p_tenant and id = any(p_ids) and deleted_at is null and coalesce(client_updated_at, '-infinity') <= p_at;
  get diagnostics c = row_count; n := n + c;
  return n;
end $$;
revoke all on function public.soft_delete(uuid, uuid[], timestamptz) from public, anon;
grant execute on function public.soft_delete(uuid, uuid[], timestamptz) to authenticated;
