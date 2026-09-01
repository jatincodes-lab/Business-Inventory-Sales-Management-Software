create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  email text not null check (email = lower(email) and char_length(email) between 3 and 254),
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  invited_by uuid not null references auth.users(id),
  auth_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'failed')),
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index workspace_invitations_pending_email_idx
on public.workspace_invitations (business_id, email)
where status in ('pending', 'failed');

create unique index workspace_invitations_auth_user_idx
on public.workspace_invitations (auth_user_id)
where auth_user_id is not null;

create index workspace_invitations_business_status_idx
on public.workspace_invitations (business_id, status, created_at desc);

alter table public.workspace_invitations enable row level security;

create or replace function public.create_workspace_invitation(p_email text, p_full_name text, p_role_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_business_id uuid := public.current_business_id();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_full_name text := trim(coalesce(p_full_name, ''));
  role_record public.roles%rowtype;
  new_invitation_id uuid;
  current_user_is_owner boolean;
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address'; end if;
  if char_length(v_full_name) not between 2 and 160 then raise exception 'Full name must be between 2 and 160 characters'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text, 0));
  select * into role_record from public.roles where id = p_role_id and roles.business_id = v_business_id for update;
  if role_record.id is null then raise exception 'Role not found'; end if;

  select exists (
    select 1 from public.profile_roles profile_role
    join public.roles assigned_role on assigned_role.id = profile_role.role_id
    where profile_role.user_id = auth.uid() and assigned_role.business_id = v_business_id and assigned_role.role_key = 'owner'
  ) into current_user_is_owner;
  if role_record.role_key = 'owner' and not current_user_is_owner then raise exception 'Only an Owner can invite another Owner'; end if;

  if exists (select 1 from public.workspace_invitations invitation where invitation.business_id = v_business_id and invitation.email = v_email and invitation.status in ('pending', 'failed')) then
    raise exception 'An invitation already exists for this email';
  end if;
  if exists (select 1 from auth.users auth_user where lower(auth_user.email) = v_email) then
    raise exception 'This email already has an account';
  end if;

  insert into public.workspace_invitations (business_id, role_id, email, full_name, invited_by, expires_at)
  values (v_business_id, role_record.id, v_email, v_full_name, auth.uid(), now() + interval '1 hour')
  returning id into new_invitation_id;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (v_business_id, auth.uid(), 'create', 'workspace_invitation', new_invitation_id, jsonb_build_object('email', v_email, 'role_id', role_record.id));
  return new_invitation_id;
end;
$$;

create or replace function public.link_workspace_invitation(p_invitation_id uuid, p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_business_id uuid := public.current_business_id();
  invitation public.workspace_invitations%rowtype;
  auth_email text;
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text, 0));
  select * into invitation from public.workspace_invitations where id = p_invitation_id and business_id = v_business_id for update;
  if invitation.id is null then raise exception 'Invitation not found'; end if;
  if invitation.status not in ('pending', 'failed') then raise exception 'This invitation is no longer active'; end if;
  select lower(email) into auth_email from auth.users where id = p_auth_user_id;
  if auth_email is null or auth_email <> invitation.email then raise exception 'The invited email does not match'; end if;
  if exists (select 1 from public.profiles where user_id = p_auth_user_id) then raise exception 'This user already belongs to a workspace'; end if;

  update public.workspace_invitations
  set auth_user_id = p_auth_user_id, status = 'pending', expires_at = now() + interval '1 hour', last_sent_at = now()
  where id = invitation.id;
end;
$$;

create or replace function public.mark_workspace_invitation_failed(p_invitation_id uuid, p_auth_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := public.current_business_id();
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  update public.workspace_invitations
  set status = 'failed', auth_user_id = coalesce(p_auth_user_id, auth_user_id)
  where id = p_invitation_id and business_id = v_business_id and status in ('pending', 'failed');
  if not found then raise exception 'Invitation not found'; end if;
end;
$$;

create or replace function public.get_workspace_invitations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := public.current_business_id();
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', invitation.id,
      'email', invitation.email,
      'full_name', invitation.full_name,
      'role_id', invitation.role_id,
      'role_name', role_record.name,
      'status', invitation.status,
      'expires_at', invitation.expires_at,
      'last_sent_at', invitation.last_sent_at,
      'created_at', invitation.created_at
    ) order by invitation.created_at desc)
    from public.workspace_invitations invitation
    join public.roles role_record on role_record.id = invitation.role_id
    where invitation.business_id = v_business_id and invitation.status in ('pending', 'failed')
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_workspace_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := public.current_business_id();
  invitation public.workspace_invitations%rowtype;
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  select * into invitation from public.workspace_invitations where id = p_invitation_id and business_id = v_business_id;
  if invitation.id is null then raise exception 'Invitation not found'; end if;
  return jsonb_build_object('id', invitation.id, 'email', invitation.email, 'full_name', invitation.full_name, 'auth_user_id', invitation.auth_user_id, 'status', invitation.status, 'expires_at', invitation.expires_at);
end;
$$;

create or replace function public.refresh_workspace_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := public.current_business_id();
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  update public.workspace_invitations set status = 'pending', expires_at = now() + interval '1 hour', last_sent_at = now()
  where id = p_invitation_id and business_id = v_business_id and status in ('pending', 'failed');
  if not found then raise exception 'Invitation is no longer active'; end if;
end;
$$;

create or replace function public.revoke_workspace_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid := public.current_business_id();
begin
  if auth.uid() is null or v_business_id is null or not public.has_permission('users.manage') then raise exception 'Not authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text, 0));
  update public.workspace_invitations set status = 'revoked'
  where id = p_invitation_id and business_id = v_business_id and status in ('pending', 'failed');
  if not found then raise exception 'Invitation is no longer active'; end if;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id)
  values (v_business_id, auth.uid(), 'revoke', 'workspace_invitation', p_invitation_id);
end;
$$;

create or replace function public.accept_workspace_invitation()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invitation public.workspace_invitations%rowtype;
  current_email text;
begin
  if auth.uid() is null then return false; end if;
  select lower(email) into current_email from auth.users where id = auth.uid();
  select * into invitation from public.workspace_invitations where auth_user_id = auth.uid() order by created_at desc limit 1 for update;
  if invitation.id is null then return false; end if;
  if invitation.status = 'accepted' then return true; end if;
  if invitation.status <> 'pending' then raise exception 'This invitation is no longer active'; end if;
  if invitation.expires_at <= now() then raise exception 'This invitation has expired'; end if;
  if current_email is null or current_email <> invitation.email then raise exception 'The invited email does not match'; end if;
  if exists (select 1 from public.profiles where user_id = auth.uid()) then raise exception 'This user already belongs to a workspace'; end if;

  insert into public.profiles (user_id, business_id, full_name) values (auth.uid(), invitation.business_id, invitation.full_name);
  insert into public.profile_roles (user_id, role_id) values (auth.uid(), invitation.role_id);
  update public.workspace_invitations set status = 'accepted', accepted_at = now() where id = invitation.id;
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id)
  values (invitation.business_id, auth.uid(), 'accept', 'workspace_invitation', invitation.id);
  return true;
end;
$$;

create policy "role managers can read workspace invitations" on public.workspace_invitations
for select to authenticated
using (business_id = public.current_business_id() and public.has_permission('users.manage'));

revoke all on function public.create_workspace_invitation(text, text, uuid) from public;
revoke all on function public.link_workspace_invitation(uuid, uuid) from public;
revoke all on function public.mark_workspace_invitation_failed(uuid, uuid) from public;
revoke all on function public.get_workspace_invitations() from public;
revoke all on function public.get_workspace_invitation(uuid) from public;
revoke all on function public.refresh_workspace_invitation(uuid) from public;
revoke all on function public.revoke_workspace_invitation(uuid) from public;
revoke all on function public.accept_workspace_invitation() from public;

grant execute on function public.create_workspace_invitation(text, text, uuid) to authenticated;
grant execute on function public.link_workspace_invitation(uuid, uuid) to authenticated;
grant execute on function public.mark_workspace_invitation_failed(uuid, uuid) to authenticated;
grant execute on function public.get_workspace_invitations() to authenticated;
grant execute on function public.get_workspace_invitation(uuid) to authenticated;
grant execute on function public.refresh_workspace_invitation(uuid) to authenticated;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;
grant execute on function public.accept_workspace_invitation() to authenticated;
