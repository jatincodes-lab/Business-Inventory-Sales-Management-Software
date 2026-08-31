insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.role_key = 'owner'
  and permission.permission_key in ('receipts.view', 'receipts.create', 'receipts.post')
on conflict (role_id, permission_id) do nothing;
