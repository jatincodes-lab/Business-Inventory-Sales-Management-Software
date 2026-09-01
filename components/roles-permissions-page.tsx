"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Clock3, LockKeyhole, Mail, Plus, Send, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";

import { createRole, deleteRole, setRoleUser, updateRoleName, updateRolePermissions } from "@/app/actions/roles-permissions";
import { inviteWorkspaceUser, resendWorkspaceInvitation, revokeWorkspaceInvitation } from "@/app/actions/workspace-invitations";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { permissionGroups, roleTemplates, type PermissionKey, type RoleManagementData } from "@/lib/roles-permissions";

function roleKey(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

function sameKeys(left: PermissionKey[], right: PermissionKey[]) {
  return left.length === right.length && left.every((key) => right.includes(key));
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function RolesPermissionsPage({ data }: { data: RoleManagementData }) {
  const [selectedId, setSelectedId] = useState(data.roles[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, PermissionKey[]>>(() => Object.fromEntries(data.roles.map((role) => [role.id, role.permission_keys])));
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revokeInvitationId, setRevokeInvitationId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [templateKey, setTemplateKey] = useState("custom");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState(data.roles[0]?.id ?? "");
  const selectedRole = data.roles.find((role) => role.id === selectedId) ?? data.roles[0];
  const selectedKeys = selectedRole ? drafts[selectedRole.id] ?? selectedRole.permission_keys : [];
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const dirty = selectedRole ? !sameKeys(selectedKeys, selectedRole.permission_keys) : false;
  const isOwner = selectedRole?.role_key === "owner";

  const selectRole = (id: string) => {
    if (dirty && !window.confirm("You have unsaved permission changes. Leave without saving?")) return;
    setSelectedId(id);
    setMessage(null);
    setRoleName("");
  };

  const togglePermission = (key: PermissionKey) => {
    if (!selectedRole || isOwner) return;
    setDrafts((current) => {
      const next = new Set(current[selectedRole.id] ?? selectedRole.permission_keys);
      if (next.has(key)) next.delete(key); else next.add(key);
      return { ...current, [selectedRole.id]: [...next] as PermissionKey[] };
    });
    setMessage(null);
  };

  const toggleGroup = (keys: readonly PermissionKey[]) => {
    if (!selectedRole || isOwner) return;
    const allSelected = keys.every((key) => selectedKeySet.has(key));
    setDrafts((current) => {
      const next = new Set(current[selectedRole.id] ?? selectedRole.permission_keys);
      keys.forEach((key) => allSelected ? next.delete(key) : next.add(key));
      return { ...current, [selectedRole.id]: [...next] as PermissionKey[] };
    });
    setMessage(null);
  };

  const savePermissions = () => {
    if (!selectedRole || isOwner || isPending) return;
    const formData = new FormData();
    formData.set("role_id", selectedRole.id);
    formData.set("permission_keys", JSON.stringify(selectedKeys));
    startTransition(async () => {
      const result = await updateRolePermissions(formData);
      setMessage({ text: result.message, ok: result.ok });
      if (result.ok) window.location.reload();
    });
  };

  const saveName = () => {
    if (!selectedRole || isOwner || isPending || !roleName.trim()) return;
    const formData = new FormData();
    formData.set("role_id", selectedRole.id);
    formData.set("name", roleName.trim());
    startTransition(async () => {
      const result = await updateRoleName(formData);
      setMessage({ text: result.message, ok: result.ok });
      if (result.ok) window.location.reload();
    });
  };

  const create = () => {
    const name = newRoleName.trim();
    const template = roleTemplates.find((item) => item.key === templateKey);
    if (!name) return setMessage({ text: "Enter a name for the new role.", ok: false });
    const formData = new FormData();
    formData.set("name", name);
    formData.set("role_key", roleKey(name));
    formData.set("permission_keys", JSON.stringify(template?.permissions ?? []));
    startTransition(async () => {
      const result = await createRole(formData);
      if (!result.ok) return setMessage({ text: result.message, ok: false });
      setCreateOpen(false);
      setNewRoleName("");
      setTemplateKey("custom");
      window.location.reload();
    });
  };

  const remove = () => {
    if (!selectedRole || isOwner || isPending) return;
    const formData = new FormData();
    formData.set("role_id", selectedRole.id);
    startTransition(async () => {
      const result = await deleteRole(formData);
      setDeleteOpen(false);
      setMessage({ text: result.message, ok: result.ok });
      if (result.ok) window.location.reload();
    });
  };

  const invite = () => {
    const formData = new FormData();
    formData.set("full_name", inviteName);
    formData.set("email", inviteEmail);
    formData.set("role_id", inviteRoleId);
    startTransition(async () => {
      const result = await inviteWorkspaceUser(formData);
      setMessage({ text: result.message, ok: result.ok });
      if (result.ok) {
        setInviteOpen(false);
        setInviteName("");
        setInviteEmail("");
        window.location.reload();
      }
    });
  };

  const resendInvite = (id: string) => {
    const formData = new FormData();
    formData.set("invitation_id", id);
    startTransition(async () => {
      const result = await resendWorkspaceInvitation(formData);
      setMessage({ text: result.message, ok: result.ok });
      if (result.ok) window.location.reload();
    });
  };

  const revokeInvite = () => {
    if (!revokeInvitationId || isPending) return;
    const formData = new FormData();
    formData.set("invitation_id", revokeInvitationId);
    startTransition(async () => {
      const result = await revokeWorkspaceInvitation(formData);
      setRevokeInvitationId(null);
      setMessage({ text: result.message, ok: result.ok });
      if (result.ok) window.location.reload();
    });
  };

  const assignUser = (userId: string, assigned: boolean) => {
    if (!selectedRole || isPending) return;
    const formData = new FormData();
    formData.set("role_id", selectedRole.id);
    formData.set("user_id", userId);
    formData.set("assigned", String(assigned));
    startTransition(async () => {
      const result = await setRoleUser(formData);
      setMessage({ text: result.message, ok: result.ok });
      if (result.ok) window.location.reload();
    });
  };

  if (!selectedRole) return <section className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center"><h1 className="text-xl font-semibold text-[#0f172a]">Roles & permissions</h1><p className="mt-2 text-sm text-[#64748b]">Create a role to start managing workspace access.</p><Button type="button" className="mt-5" onClick={() => setCreateOpen(true)}><Plus className="size-4" />Create role</Button></section>;

  return <div>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#00a63e]">Administration</p><h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a] md:text-3xl">Roles & permissions</h1><p className="mt-1 max-w-2xl text-sm text-[#64748b]">Choose a job role, then decide what that person can see and do.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={() => { setMessage(null); setInviteRoleId(data.roles[0]?.id ?? ""); setInviteOpen(true); }}><UserPlus className="size-4" />Invite user</Button><Button type="button" onClick={() => { setMessage(null); setCreateOpen(true); }}><Plus className="size-4" />Create role</Button></div></div>

    {message && <div role="status" className={`mb-5 rounded-lg border px-4 py-3 text-sm ${message.ok ? "border-[#b9e7c9] bg-[#f0fff5] text-[#08752e]" : "border-[#f4b4b0] bg-[#fff5f5] text-[#b42318]"}`}>{message.text}</div>}

    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <section className="h-fit rounded-xl border border-[#e2e8f0] bg-white p-3"><div className="px-3 pb-3 pt-2"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">Access roles</p><p className="mt-1 text-xs text-[#64748b]">Pick the closest job to begin.</p></div><div className="space-y-1">{data.roles.map((role) => <button type="button" key={role.id} onClick={() => selectRole(role.id)} className={`w-full rounded-lg p-3 text-left transition ${role.id === selectedRole.id ? "bg-[#eaf8ef]" : "hover:bg-[#f8fafc]"}`}><div className="flex items-start gap-3"><span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${role.id === selectedRole.id ? "bg-[#00a63e] text-white" : "bg-[#f1f5f9] text-[#64748b]"}`}><ShieldCheck className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#334155]">{role.name}</span><span className="mt-1 block text-xs text-[#94a3b8]">{role.user_count} {role.user_count === 1 ? "person" : "people"}</span></span></div></button>)}</div></section>

      <div className="min-w-0 space-y-6">
        <section className="rounded-xl border border-[#e2e8f0] bg-white p-5 md:p-6"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-[#0f172a]">{selectedRole.name}</h2>{isOwner && <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[11px] font-medium text-[#64748b]"><LockKeyhole className="size-3" />Protected</span>}</div><p className="mt-1 text-sm text-[#64748b]">{isOwner ? "The Owner can manage everything in this workspace." : "Turn on only the capabilities this role needs."}</p></div>{!isOwner && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setRoleName(selectedRole.name)}>Rename</Button><Button type="button" variant="outline" className="text-[#b42318] hover:text-[#b42318]" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" />Delete</Button></div>}</div>{roleName && !isOwner && <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><div className="grid flex-1 gap-2"><Label htmlFor="role-name">Role name</Label><Input id="role-name" value={roleName} onChange={(event) => setRoleName(event.target.value)} maxLength={60} autoFocus /></div><Button type="button" onClick={saveName} loading={isPending}>Save name</Button></div>}<div className="mt-5 rounded-lg border border-[#e2e8f0] bg-[#fbfcfd] p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">What this role can do</p><p className="mt-2 text-sm leading-6 text-[#334155]">{selectedKeys.length === 0 ? "Nothing yet. Select a capability below." : `${selectedKeys.length} capabilities are enabled for this role.`}</p></div></section>

        <section className="rounded-xl border border-[#e2e8f0] bg-white"><div className="border-b border-[#f1f5f9] px-5 py-4 md:px-6"><h2 className="text-sm font-semibold text-[#0f172a]">Capabilities</h2><p className="mt-1 text-xs text-[#94a3b8]">Use plain-language actions. View lets someone see information; create, edit, and post let them change it.</p></div><div className="divide-y divide-[#f1f5f9]">{permissionGroups.map((group) => { const keys = group.permissions.map((permission) => permission.key); const allSelected = keys.every((key) => selectedKeySet.has(key)); return <div key={group.key} className="p-5 md:p-6"><div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold text-[#334155]">{group.label}</h3><p className="mt-1 text-xs text-[#94a3b8]">{group.description}</p></div><button type="button" disabled={isOwner || isPending} onClick={() => toggleGroup(keys)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${allSelected ? "bg-[#e6f8ee] text-[#08752e]" : "border border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc]"}`}>{allSelected ? "All on" : "Turn all on"}</button></div><div className="mt-4 grid gap-2 md:grid-cols-2">{group.permissions.map((permission) => <label key={permission.key} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${selectedKeySet.has(permission.key) ? "border-[#b9e7c9] bg-[#f8fffa]" : "border-[#e2e8f0] hover:bg-[#fbfcfd]"}`}><input type="checkbox" checked={selectedKeySet.has(permission.key)} disabled={isOwner || isPending} onChange={() => togglePermission(permission.key)} className="mt-0.5 size-4 accent-[#00a63e]" /><span className="min-w-0"><span className="flex items-center gap-2 text-sm font-medium text-[#334155]">{permission.label}{selectedKeySet.has(permission.key) && <Check className="size-3.5 text-[#00a63e]" />}</span><span className="mt-1 block text-xs leading-5 text-[#94a3b8]">{permission.description}</span></span></label>)}</div></div>; })}</div>{!isOwner && <div className="flex flex-col justify-between gap-3 border-t border-[#f1f5f9] px-5 py-4 sm:flex-row sm:items-center md:px-6"><p className="text-xs text-[#64748b]">{dirty ? "You have unsaved changes." : "Permissions are up to date."}</p><Button type="button" onClick={savePermissions} loading={isPending} disabled={!dirty}>{isPending ? "Saving..." : "Save permissions"}</Button></div>}</section>

        <section className="rounded-xl border border-[#e2e8f0] bg-white"><div className="flex items-start justify-between gap-4 border-b border-[#f1f5f9] px-5 py-4 md:px-6"><div><h2 className="text-sm font-semibold text-[#0f172a]">People with this role</h2><p className="mt-1 text-xs text-[#94a3b8]">Assign access to people already in this workspace.</p></div><Users className="size-5 text-[#00a63e]" /></div>{data.users.length === 0 ? <p className="p-6 text-sm text-[#64748b]">No workspace users found.</p> : <div className="divide-y divide-[#f1f5f9]">{data.users.map((user) => <label key={user.id} className="flex cursor-pointer items-center gap-3 px-5 py-4 hover:bg-[#fbfcfd] md:px-6"><input type="checkbox" checked={user.role_ids.includes(selectedRole.id)} disabled={isPending} onChange={(event) => assignUser(user.id, event.target.checked)} className="size-4 accent-[#00a63e]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-[#334155]">{user.name}</span><span className="mt-1 block truncate text-xs text-[#94a3b8]">{user.email || "No email available"}</span></span></label>)}</div>}</section>

        {data.invitations.length > 0 && <section className="rounded-xl border border-[#e2e8f0] bg-white"><div className="flex items-start justify-between gap-4 border-b border-[#f1f5f9] px-5 py-4 md:px-6"><div><h2 className="text-sm font-semibold text-[#0f172a]">Pending invitations</h2><p className="mt-1 text-xs text-[#94a3b8]">These people will receive access after accepting their email invitation.</p></div><Mail className="size-5 text-[#00a63e]" /></div><div className="divide-y divide-[#f1f5f9]">{data.invitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:px-6"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[#334155]">{invitation.full_name}</p><p className="mt-1 truncate text-xs text-[#64748b]">{invitation.email} · {invitation.role_name}</p><p className={`mt-1 flex items-center gap-1 text-xs ${invitation.status === "failed" ? "text-[#b42318]" : "text-[#94a3b8]"}`}>{invitation.status === "failed" ? "Email was not sent" : <><Clock3 className="size-3" />Expires {dateTime(invitation.expires_at)}</>}</p></div><div className="flex shrink-0 gap-2"><Button type="button" variant="outline" size="sm" onClick={() => resendInvite(invitation.id)} disabled={isPending}><Send className="size-3.5" />Send again</Button><Button type="button" variant="ghost" size="sm" onClick={() => setRevokeInvitationId(invitation.id)} disabled={isPending} className="text-[#b42318] hover:text-[#b42318]">Revoke</Button></div></div>)}</div></section>}
      </div>
    </div>

    {inviteOpen && <div className="fixed inset-0 z-[80] overflow-y-auto p-4 md:p-8" role="dialog" aria-modal="true" aria-labelledby="invite-user-title" aria-describedby="invite-user-description"><button type="button" aria-label="Close dialog" onClick={() => !isPending && setInviteOpen(false)} className="absolute inset-0 h-full w-full cursor-default bg-[#0e1f16]/55 backdrop-blur-[2px]" /><section className="relative mx-auto my-4 w-full max-w-lg rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-2xl md:my-8 md:p-7"><div className="flex items-start justify-between gap-4"><div><h2 id="invite-user-title" className="text-lg font-semibold text-[#0f172a]">Invite a user</h2><p id="invite-user-description" className="mt-1 text-xs leading-5 text-[#64748b]">They will receive a secure email link to set a password and join this workspace.</p></div><button type="button" aria-label="Close dialog" onClick={() => !isPending && setInviteOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-lg text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"><X className="size-4" /></button></div><div className="mt-6 grid gap-5"><div className="grid gap-2"><Label htmlFor="invite-full-name">Full name</Label><Input id="invite-full-name" value={inviteName} onChange={(event) => setInviteName(event.target.value)} maxLength={160} placeholder="Priya Sharma" autoComplete="name" autoFocus /></div><div className="grid gap-2"><Label htmlFor="invite-email">Email address</Label><Input id="invite-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} maxLength={254} placeholder="priya@example.com" autoComplete="email" /></div><div className="grid gap-2"><Label htmlFor="invite-role">Starting role</Label><select id="invite-role" value={inviteRoleId} onChange={(event) => setInviteRoleId(event.target.value)} className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">{data.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><p className="text-xs text-[#94a3b8]">You can change this person’s access later from the role list.</p></div>{message && !message.ok && <p role="alert" className="text-sm text-[#b42318]">{message.text}</p>}</div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setInviteOpen(false)} disabled={isPending}>Cancel</Button><Button type="button" onClick={invite} loading={isPending}>{isPending ? "Sending..." : "Send invitation"}</Button></div></section></div>}
    {createOpen && <div className="fixed inset-0 z-[80] overflow-y-auto p-4 md:p-8" role="dialog" aria-modal="true" aria-labelledby="create-role-title"><button type="button" aria-label="Close dialog" onClick={() => !isPending && setCreateOpen(false)} className="absolute inset-0 h-full w-full cursor-default bg-[#0e1f16]/55 backdrop-blur-[2px]" /><section className="relative mx-auto my-4 w-full max-w-lg rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-2xl md:my-8 md:p-7"><div><h2 id="create-role-title" className="text-lg font-semibold text-[#0f172a]">Create a role</h2><p className="mt-1 text-xs leading-5 text-[#64748b]">Start with a familiar job and adjust its capabilities later.</p></div><div className="mt-6 grid gap-5"><div className="grid gap-2"><Label htmlFor="new-role-name">Role name</Label><Input id="new-role-name" value={newRoleName} onChange={(event) => setNewRoleName(event.target.value)} maxLength={60} placeholder="Receiving Staff" autoFocus /></div><div className="grid gap-2"><Label htmlFor="role-template">Start with</Label><select id="role-template" value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="custom">Blank role</option>{roleTemplates.map((template) => <option key={template.key} value={template.key}>{template.name} — {template.description}</option>)}</select></div><p className="rounded-lg border border-[#e2e8f0] bg-[#fbfcfd] p-3 text-xs leading-5 text-[#64748b]">{roleTemplates.find((template) => template.key === templateKey)?.description ?? "The new role will start with no capabilities."}</p></div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={isPending}>Cancel</Button><Button type="button" onClick={create} loading={isPending}>{isPending ? "Creating..." : "Create role"}</Button></div></section></div>}
    <ConfirmationDialog open={deleteOpen} title="Delete this role?" description="This cannot be undone. Remove every person from this role first; their other roles will not be changed." confirmLabel="Delete role" loading={isPending} onCancel={() => !isPending && setDeleteOpen(false)} onConfirm={remove} />
    <ConfirmationDialog open={Boolean(revokeInvitationId)} title="Revoke this invitation?" description="The invitation link will no longer be able to grant access to this workspace. You can create a new invitation later." confirmLabel="Revoke invitation" loading={isPending} onCancel={() => !isPending && setRevokeInvitationId(null)} onConfirm={revokeInvite} />
  </div>;
}
