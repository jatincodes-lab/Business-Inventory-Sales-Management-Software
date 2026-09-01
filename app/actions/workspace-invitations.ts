"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, hasAdminSecret } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/supabase/workspace";

export type InvitationActionResult = { ok: boolean; message: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function value(formData: FormData, key: string) {
  const input = formData.get(key);
  return typeof input === "string" ? input.trim() : "";
}

function errorMessage(error: { code?: string; message?: string }, fallback: string): InvitationActionResult {
  const message = error.message || "";
  if (message.includes("Not authorized")) return { ok: false, message: "You do not have permission to invite users." };
  if (message.includes("already exists")) return { ok: false, message: "An invitation is already waiting for this email. Use Send again instead." };
  if (message.includes("already has an account")) return { ok: false, message: "This email already has an account. Ask the user to contact an administrator." };
  if (message.includes("Owner")) return { ok: false, message: "Only an Owner can invite another Owner." };
  if (message.includes("Role not found")) return { ok: false, message: "That role no longer exists. Refresh and choose another role." };
  if (message.includes("no longer active")) return { ok: false, message: "This invitation is no longer active." };
  if (message.includes("wait")) return { ok: false, message: "Please wait a minute before sending another invitation." };
  if (error.code === "23505") return { ok: false, message: "This invitation already exists." };
  return { ok: false, message: fallback };
}

function redirectUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  const url = new URL("/auth/confirm", appUrl);
  url.searchParams.set("next", "/auth/update-password");
  return url.toString();
}

async function managerContext() {
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return { context, result: { ok: false, message: context.status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Create a workspace before inviting users." } as InvitationActionResult };
  const { data, error } = await context.supabase.rpc("has_permission", { required_permission: "users.manage" });
  if (error || data !== true) return { context, result: { ok: false, message: "You do not have permission to invite users." } as InvitationActionResult };
  return { context };
}

async function markFailed(context: Awaited<ReturnType<typeof getWorkspaceContext>>, invitationId: string, authUserId?: string) {
  if (context.status !== "ready") return;
  await context.supabase.rpc("mark_workspace_invitation_failed", { p_invitation_id: invitationId, p_auth_user_id: authUserId || null });
}

export async function inviteWorkspaceUser(formData: FormData): Promise<InvitationActionResult> {
  const email = value(formData, "email").toLowerCase();
  const fullName = value(formData, "full_name");
  const roleId = value(formData, "role_id");
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return { ok: false, message: "Enter a valid email address." };
  if (fullName.length < 2 || fullName.length > 160) return { ok: false, message: "Full name must be between 2 and 160 characters." };
  if (!UUID_PATTERN.test(roleId)) return { ok: false, message: "Choose a valid role." };

  const { context, result } = await managerContext();
  if (result) return result;
  if (!hasAdminSecret()) return { ok: false, message: "User invitations are not configured. Add the server-only Supabase secret key." };
  let invitationId = "";
  try {
    const invitation = await context.supabase.rpc("create_workspace_invitation", { p_email: email, p_full_name: fullName, p_role_id: roleId });
    if (invitation.error || !invitation.data) return errorMessage(invitation.error || { message: "Missing invitation ID" }, "Unable to create the invitation.");
    invitationId = invitation.data as string;
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName, workspace_invitation_id: invitationId }, redirectTo: redirectUrl() });
    if (error || !data.user?.id) {
      await markFailed(context, invitationId);
      return { ok: false, message: "The invitation email could not be sent. You can try again from Pending invitations." };
    }
    const linked = await context.supabase.rpc("link_workspace_invitation", { p_invitation_id: invitationId, p_auth_user_id: data.user.id });
    if (linked.error) {
      await markFailed(context, invitationId, data.user.id);
      return { ok: false, message: "The email was sent, but the workspace access could not be prepared. Try sending it again." };
    }
    revalidatePath("/roles-permissions");
    return { ok: true, message: `Invitation sent to ${email}.` };
  } catch (error) {
    if (invitationId) await markFailed(context, invitationId);
    return { ok: false, message: error instanceof Error && error.message.includes("server secret") ? "User invitations are not configured. Add the server-only Supabase secret key." : "Unable to send the invitation. Try again." };
  }
}

export async function resendWorkspaceInvitation(formData: FormData): Promise<InvitationActionResult> {
  const invitationId = value(formData, "invitation_id");
  if (!UUID_PATTERN.test(invitationId)) return { ok: false, message: "This invitation ID is invalid." };
  const { context, result } = await managerContext();
  if (result) return result;
  if (!hasAdminSecret()) return { ok: false, message: "User invitations are not configured. Add the server-only Supabase secret key." };
  const current = await context.supabase.rpc("get_workspace_invitation", { p_invitation_id: invitationId });
  if (current.error || !current.data || typeof current.data !== "object") return errorMessage(current.error || { message: "Invitation not found" }, "Unable to load this invitation.");
  const invitation = current.data as { email?: unknown; full_name?: unknown; auth_user_id?: unknown; status?: unknown; last_sent_at?: unknown };
  if (invitation.status !== "pending" && invitation.status !== "failed") return { ok: false, message: "This invitation is no longer active." };
  if (typeof invitation.last_sent_at === "string" && Date.now() - new Date(invitation.last_sent_at).getTime() < 60_000) return { ok: false, message: "Please wait a minute before sending another invitation." };
  if (typeof invitation.email !== "string" || typeof invitation.full_name !== "string") return { ok: false, message: "This invitation is incomplete. Create a new invitation." };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(invitation.email, { data: { full_name: invitation.full_name, workspace_invitation_id: invitationId }, redirectTo: redirectUrl() });
    if (error || !data.user?.id) return { ok: false, message: "Supabase could not send another invitation to this email." };
    const linked = await context.supabase.rpc("link_workspace_invitation", { p_invitation_id: invitationId, p_auth_user_id: data.user.id });
    if (linked.error) {
      await markFailed(context, invitationId, data.user.id);
      return { ok: false, message: "The email was sent, but the workspace access could not be prepared." };
    }
    const refreshed = await context.supabase.rpc("refresh_workspace_invitation", { p_invitation_id: invitationId });
    if (refreshed.error) return errorMessage(refreshed.error, "The invitation was sent, but its status could not be refreshed.");
    revalidatePath("/roles-permissions");
    return { ok: true, message: `Invitation sent again to ${invitation.email}.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message.includes("server secret") ? "User invitations are not configured. Add the server-only Supabase secret key." : "Unable to resend the invitation. Try again." };
  }
}

export async function revokeWorkspaceInvitation(formData: FormData): Promise<InvitationActionResult> {
  const invitationId = value(formData, "invitation_id");
  if (!UUID_PATTERN.test(invitationId)) return { ok: false, message: "This invitation ID is invalid." };
  const { context, result } = await managerContext();
  if (result) return result;
  const { error } = await context.supabase.rpc("revoke_workspace_invitation", { p_invitation_id: invitationId });
  if (error) return errorMessage(error, "Unable to revoke this invitation. Try again.");
  revalidatePath("/roles-permissions");
  return { ok: true, message: "Invitation revoked." };
}
