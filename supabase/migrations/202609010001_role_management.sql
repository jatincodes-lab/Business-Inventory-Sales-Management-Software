-- Keep role changes atomic and enforce them at the database boundary.
-- ponytail: one business-scoped advisory lock serializes admin changes; split lock keys only if admin throughput matters.

create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.profile_roles profile_role on profile_role.user_id = profile.user_id
    join public.roles role_record on role_record.id = profile_role.role_id and role_record.business_id = profile.business_id
    join public.role_permissions role_permission on role_permission.role_id = role_record.id
    join public.permissions permission on permission.id = role_permission.permission_id
    where profile.user_id = auth.uid()
      and permission.permission_key = required_permission
  );
$$;

create or replace function public.get_role_management_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_business_id uuid := public.current_business_id();
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then
    raise exception 'Not authorized';
  end if;

  return jsonb_build_object(
    'roles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', role_record.id,
          'name', role_record.name,
          'role_key', role_record.role_key,
          'user_count', (select count(*) from public.profile_roles assigned_user where assigned_user.role_id = role_record.id),
          'permission_keys', coalesce((
            select jsonb_agg(permission.permission_key order by permission.permission_key)
            from public.role_permissions role_permission
            join public.permissions permission on permission.id = role_permission.permission_id
            where role_permission.role_id = role_record.id
          ), '[]'::jsonb)
        ) order by role_record.name
      )
      from public.roles role_record
      where role_record.business_id = v_business_id
    ), '[]'::jsonb),
    'permissions', coalesce((
      select jsonb_agg(
        jsonb_build_object('key', permission.permission_key, 'description', permission.description)
        order by permission.permission_key
      )
      from public.permissions permission
    ), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', profile.user_id,
          'name', coalesce(nullif(trim(profile.full_name), ''), nullif(split_part(coalesce(auth_user.email, ''), '@', 1), ''), 'Workspace user'),
          'email', coalesce(auth_user.email, ''),
          'role_ids', coalesce((
            select jsonb_agg(profile_role.role_id order by profile_role.role_id)
            from public.profile_roles profile_role
            join public.roles role_record on role_record.id = profile_role.role_id
            where profile_role.user_id = profile.user_id and role_record.business_id = v_business_id
          ), '[]'::jsonb)
        ) order by coalesce(nullif(trim(profile.full_name), ''), auth_user.email)
      )
      from public.profiles profile
      left join auth.users auth_user on auth_user.id = profile.user_id
      where profile.business_id = v_business_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_role(
  p_name text,
  p_role_key text,
  p_permission_keys text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := public.current_business_id();
  new_role_id uuid;
  requested_keys text[] := coalesce(p_permission_keys, '{}'::text[]);
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 60 then raise exception 'Role name must be between 2 and 60 characters'; end if;
  if char_length(trim(coalesce(p_role_key, ''))) not between 2 and 60 or lower(trim(p_role_key)) !~ '^[a-z0-9_]+$' then raise exception 'Role key is invalid'; end if;
  if lower(trim(p_role_key)) = 'owner' then raise exception 'The Owner role is reserved'; end if;
  if cardinality(requested_keys) > 100 then raise exception 'Too many permissions'; end if;
  if exists (
    select 1 from unnest(requested_keys) requested(permission_key)
    where requested.permission_key is null
      or requested.permission_key <> trim(requested.permission_key)
      or not exists (select 1 from public.permissions permission where permission.permission_key = requested.permission_key)
  ) then raise exception 'One or more permissions are invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text, 0));
  insert into public.roles (business_id, name, role_key)
  values (v_business_id, trim(p_name), lower(trim(p_role_key)))
  returning id into new_role_id;

  insert into public.role_permissions (role_id, permission_id)
  select new_role_id, permission.id
  from public.permissions permission
  where permission.permission_key = any(requested_keys)
  on conflict do nothing;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (v_business_id, auth.uid(), 'create', 'role', new_role_id, jsonb_build_object('role_key', lower(trim(p_role_key))));
  return new_role_id;
end;
$$;

create or replace function public.update_role_name(p_role_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := public.current_business_id();
  role_record public.roles%rowtype;
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 60 then raise exception 'Role name must be between 2 and 60 characters'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text, 0));
  select * into role_record from public.roles where id = p_role_id and roles.business_id = v_business_id for update;
  if role_record.id is null then raise exception 'Role not found'; end if;
  if role_record.role_key = 'owner' then raise exception 'The Owner role cannot be renamed'; end if;

  update public.roles set name = trim(p_name) where id = role_record.id;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (v_business_id, auth.uid(), 'update', 'role', role_record.id, jsonb_build_object('name', trim(p_name)));
end;
$$;

create or replace function public.update_role_permissions(p_role_id uuid, p_permission_keys text[] default '{}'::text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := public.current_business_id();
  role_record public.roles%rowtype;
  requested_keys text[] := coalesce(p_permission_keys, '{}'::text[]);
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  if cardinality(requested_keys) > 100 then raise exception 'Too many permissions'; end if;
  if exists (
    select 1 from unnest(requested_keys) requested(permission_key)
    where requested.permission_key is null
      or requested.permission_key <> trim(requested.permission_key)
      or not exists (select 1 from public.permissions permission where permission.permission_key = requested.permission_key)
  ) then raise exception 'One or more permissions are invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text, 0));
  select * into role_record from public.roles where id = p_role_id and roles.business_id = v_business_id for update;
  if role_record.id is null then raise exception 'Role not found'; end if;
  if role_record.role_key = 'owner' then raise exception 'The Owner role always has every permission'; end if;

  delete from public.role_permissions where role_id = role_record.id;
  insert into public.role_permissions (role_id, permission_id)
  select role_record.id, permission.id
  from public.permissions permission
  where permission.permission_key = any(requested_keys)
  on conflict do nothing;

  if not exists (
    select 1
    from public.profile_roles profile_role
    join public.roles assigned_role on assigned_role.id = profile_role.role_id and assigned_role.business_id = v_business_id
    join public.role_permissions role_permission on role_permission.role_id = assigned_role.id
    join public.permissions permission on permission.id = role_permission.permission_id
    where permission.permission_key = 'users.manage'
  ) then raise exception 'At least one user must retain role-management access'; end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (v_business_id, auth.uid(), 'update_permissions', 'role', role_record.id, jsonb_build_object('permission_keys', requested_keys));
end;
$$;

create or replace function public.set_role_user(p_role_id uuid, p_user_id uuid, p_assigned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := public.current_business_id();
  role_record public.roles%rowtype;
  current_user_is_owner boolean;
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text, 0));

  select * into role_record from public.roles where id = p_role_id and roles.business_id = v_business_id for update;
  if role_record.id is null then raise exception 'Role not found'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id and profiles.business_id = v_business_id) then raise exception 'User not found'; end if;

  select exists (
    select 1 from public.profile_roles profile_role
    join public.roles assigned_role on assigned_role.id = profile_role.role_id
    where profile_role.user_id = auth.uid() and assigned_role.business_id = v_business_id and assigned_role.role_key = 'owner'
  ) into current_user_is_owner;

  if role_record.role_key = 'owner' and not current_user_is_owner then raise exception 'Only an Owner can assign the Owner role'; end if;

  if p_assigned then
    insert into public.profile_roles (user_id, role_id) values (p_user_id, role_record.id) on conflict do nothing;
  else
    delete from public.profile_roles where user_id = p_user_id and role_id = role_record.id;
    if role_record.role_key = 'owner' and not exists (
      select 1 from public.profile_roles profile_role
      join public.roles assigned_role on assigned_role.id = profile_role.role_id
      where assigned_role.business_id = v_business_id and assigned_role.role_key = 'owner'
    ) then raise exception 'At least one Owner must remain assigned'; end if;
    if not exists (
      select 1
      from public.profile_roles profile_role
      join public.roles assigned_role on assigned_role.id = profile_role.role_id and assigned_role.business_id = v_business_id
      join public.role_permissions role_permission on role_permission.role_id = assigned_role.id
      join public.permissions permission on permission.id = role_permission.permission_id
      where permission.permission_key = 'users.manage'
    ) then raise exception 'At least one user must retain role-management access'; end if;
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (v_business_id, auth.uid(), case when p_assigned then 'assign_role' else 'remove_role' end, 'profile', p_user_id, jsonb_build_object('role_id', role_record.id));
end;
$$;

create or replace function public.delete_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := public.current_business_id();
  role_record public.roles%rowtype;
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text, 0));
  select * into role_record from public.roles where id = p_role_id and roles.business_id = v_business_id for update;
  if role_record.id is null then raise exception 'Role not found'; end if;
  if role_record.role_key = 'owner' then raise exception 'The Owner role cannot be deleted'; end if;
  if exists (select 1 from public.profile_roles where role_id = role_record.id) then raise exception 'Remove users from this role before deleting it'; end if;

  delete from public.roles where id = role_record.id;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (v_business_id, auth.uid(), 'delete', 'role', role_record.id, jsonb_build_object('role_key', role_record.role_key));
end;
$$;

drop policy if exists "business members can access roles" on public.roles;
drop policy if exists "business members can access role permissions" on public.role_permissions;
drop policy if exists "business members can access profile roles" on public.profile_roles;

create policy "role managers can read roles" on public.roles
for select to authenticated
using (business_id = public.current_business_id() and public.has_permission('users.manage'));

create policy "role managers can read role permissions" on public.role_permissions
for select to authenticated
using (exists (
  select 1 from public.roles role_record
  where role_record.id = role_id
    and role_record.business_id = public.current_business_id()
    and public.has_permission('users.manage')
));

create policy "role managers can read profile roles" on public.profile_roles
for select to authenticated
using (exists (
  select 1
  from public.profiles profile
  join public.roles role_record on role_record.id = profile_roles.role_id and role_record.business_id = profile.business_id
  where profile.user_id = profile_roles.user_id
    and profile.business_id = public.current_business_id()
    and public.has_permission('users.manage')
));

revoke all on function public.get_role_management_data() from public;
revoke all on function public.create_role(text, text, text[]) from public;
revoke all on function public.update_role_name(uuid, text) from public;
revoke all on function public.update_role_permissions(uuid, text[]) from public;
revoke all on function public.set_role_user(uuid, uuid, boolean) from public;
revoke all on function public.delete_role(uuid) from public;

grant execute on function public.get_role_management_data() to authenticated;
grant execute on function public.create_role(text, text, text[]) to authenticated;
grant execute on function public.update_role_name(uuid, text) to authenticated;
grant execute on function public.update_role_permissions(uuid, text[]) to authenticated;
grant execute on function public.set_role_user(uuid, uuid, boolean) to authenticated;
grant execute on function public.delete_role(uuid) to authenticated;
