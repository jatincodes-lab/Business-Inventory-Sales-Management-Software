insert into public.permissions (permission_key, description)
values ('sales.edit', 'Edit sales')
on conflict (permission_key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.role_key = 'owner'
  and p.permission_key = 'sales.edit'
on conflict (role_id, permission_id) do nothing;
