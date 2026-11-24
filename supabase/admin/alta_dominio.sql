-- Marbit-Hotel · alta de dominio para una posada (lo corre Marbit; no se aplica solo)
-- Pasos: 1) tu usuario debe ser administrador de la plataforma, 2) enlazas el dominio a la posada.
-- Reemplaza los valores entre <>.

-- 1) Hacerte administrador (una sola vez). El correo es el de tu cuenta de Marbit-Hotel.
insert into public.platform_admins(user_id)
select id from auth.users where email = '<tu-correo>'
on conflict do nothing;

-- 2) Enlazar dominios a la posada (nickname = el nombre corto que eligió al crearla).
insert into public.tenant_domains(tenant_id, domain, is_primary, status)
select t.id, d.domain, d.is_primary, 'activo'
from public.tenants t,
     (values ('<casaelagave.com>', true), ('<www.casaelagave.com>', false)) as d(domain, is_primary)
where t.nickname = '<casa-el-agave>'
on conflict (domain) do nothing;

-- 3) Comprobar: debe regresar el nombre de la posada.
select public.public_site('<casaelagave.com>')->'tenant'->>'name' as posada;
