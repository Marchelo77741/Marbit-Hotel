-- Marbit-Hotel · 004 · lo que ve el público (sitio por dominio), solicitudes de informes y fotos
-- Nada de reservaciones ni de huéspedes sale por aquí: solo lo que la posada marca como público.

create function private.tenant_for_key(p_key text) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.tenants t
  where t.status = 'activo' and t.deleted_at is null
    and (t.nickname = lower(trim(p_key))
         or t.id = (select d.tenant_id from public.tenant_domains d
                    where d.status = 'activo' and (d.domain = regexp_replace(lower(trim(p_key)), '^www\.', '')
                       or d.domain = lower(trim(p_key))) limit 1))
  limit 1
$$;

-- Datos del sitio de una posada. p_key = dominio (casaelagave.com) o nickname.
create function public.public_site(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tid uuid := private.tenant_for_key(p_key); s jsonb; res jsonb;
begin
  if tid is null then return null; end if;
  select coalesce(data, '{}') into s from public.tenant_settings where tenant_id = tid;
  s := coalesce(s, '{}');
  select jsonb_build_object(
    'tenant', jsonb_build_object('id', t.id, 'name', t.name, 'nickname', t.nickname),
    'info', jsonb_build_object(
      'businessName', coalesce(s->>'businessName', t.name), 'address', s->>'address', 'phone', s->>'phone',
      'checkInTime', s->>'checkInTime', 'checkOutTime', s->>'checkOutTime', 'policyNote', s->>'policyNote'),
    'site', coalesce((select c.data from public.site_content c where c.tenant_id = tid), '{}'),
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'type', r.type, 'capacity', r.capacity, 'description', r.description,
        'status', r.status, 'photos', r.photos,
        'price', case when r.show_price then coalesce(r.public_price,
                   case r.type when 'doble' then nullif(s->>'rateDoble','')::numeric else nullif(s->>'rateSencilla','')::numeric end)
                 end) order by r.sort, r.name)
      from public.rooms r where r.tenant_id = tid and r.active and r.deleted_at is null and r.status <> 'oculta'), '[]')
  ) into res from public.tenants t where t.id = tid;
  return res;
end $$;
revoke all on function public.public_site(text) from public;
grant execute on function public.public_site(text) to anon, authenticated;

-- Control de envíos por visitante (se guarda un hash, no la dirección IP).
create table private.inquiry_hits (tenant_id uuid not null, who text not null, at timestamptz not null default now());
create index inquiry_hits_idx on private.inquiry_hits(tenant_id, who, at);

-- Solicitud de informes desde el sitio. Devuelve {ok:true} o {error:"texto para mostrar al visitante"}.
create function public.submit_inquiry(p_key text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tid uuid := private.tenant_for_key(p_key);
  ip text := coalesce(nullif(split_part(coalesce((current_setting('request.headers', true))::jsonb ->> 'cf-connecting-ip',
                       (current_setting('request.headers', true))::jsonb ->> 'x-forwarded-for', ''), ',', 1), ''), 'desconocido');
  v_who text := encode(extensions.digest(ip || coalesce(tid::text, ''), 'sha256'), 'hex');
  ch text := case when p_payload->>'channel' = 'email' then 'email' else 'whatsapp' end;
  nm text := left(trim(coalesce(p_payload->>'name', '')), 80);
  ph text := left(trim(coalesce(p_payload->>'phone', '')), 30);
  em text := left(trim(coalesce(p_payload->>'email', '')), 120);
  rid uuid; rname text;
  d1 date; d2 date;
begin
  if tid is null then return jsonb_build_object('error', 'Este sitio no está disponible.'); end if;
  if coalesce(trim(p_payload->>'website'), '') <> '' then return jsonb_build_object('ok', true); end if; -- campo trampa de robots
  if length(nm) < 2 then return jsonb_build_object('error', 'Escribe tu nombre.'); end if;
  if ch = 'whatsapp' and length(regexp_replace(ph, '\D', '', 'g')) < 10 then
    return jsonb_build_object('error', 'Escribe tu número de WhatsApp a 10 dígitos para poder enviarte la información.'); end if;
  if ch = 'email' and em !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    return jsonb_build_object('error', 'Escribe un correo válido para poder enviarte la información.'); end if;
  delete from private.inquiry_hits h where h.at < now() - interval '2 hours';
  if (select count(*) from private.inquiry_hits h where h.tenant_id = tid and h.who = v_who and h.at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('error', 'Has enviado varias solicitudes; intenta de nuevo en un rato.'); end if;
  if (select count(*) from public.inquiries where tenant_id = tid and status = 'nueva' and deleted_at is null) >= 300 then
    return jsonb_build_object('error', 'No pudimos recibir tu solicitud ahora; escríbenos por WhatsApp.'); end if;
  begin d1 := nullif(p_payload->>'checkIn', '')::date; d2 := nullif(p_payload->>'checkOut', '')::date;
  exception when others then d1 := null; d2 := null; end;
  if d1 is not null and d2 is not null and d2 <= d1 then d1 := null; d2 := null; end if;
  begin rid := nullif(p_payload->>'roomId', '')::uuid; exception when others then rid := null; end;
  select r.name into rname from public.rooms r where r.id = rid and r.tenant_id = tid and r.deleted_at is null;
  if rname is null then rid := null; end if;
  insert into public.inquiries(tenant_id, room_id, room_name, name, channel, phone, email, check_in, check_out, guests, message)
  values (tid, rid, coalesce(rname, ''), nm, ch, case when ch = 'whatsapp' then ph else left(ph, 30) end, case when ch = 'email' then em else '' end,
          d1, d2, least(30, greatest(0, coalesce(nullif(p_payload->>'guests', '')::int, 0))), left(coalesce(p_payload->>'message', ''), 800));
  insert into private.inquiry_hits(tenant_id, who) values (tid, v_who);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.submit_inquiry(text, jsonb) from public;
grant execute on function public.submit_inquiry(text, jsonb) to anon, authenticated;

-- ---------- fotos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-photos', 'tenant-photos', true, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ruta: <tenant_id>/<archivo>. Solo el equipo con permiso de escritura de esa posada puede subir o quitar fotos.
create policy tenant_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'tenant-photos' and private.can_read(((storage.foldername(name))[1])::uuid));
create policy tenant_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tenant-photos' and private.can_write(((storage.foldername(name))[1])::uuid));
create policy tenant_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'tenant-photos' and private.can_write(((storage.foldername(name))[1])::uuid));
create policy tenant_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tenant-photos' and private.can_write(((storage.foldername(name))[1])::uuid));
