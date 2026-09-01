"use server";

import { revalidatePath } from "next/cache";

import { permissionGroups } from "@/lib/roles-permissions";
import { getWorkspaceContext, type WorkspaceContext, type WorkspaceContextResult } from "@/lib/supabase/workspace";

export type RoleActionResult = { ok: boolean; message: string; roleId?: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_KEY_PATTERN = /^[a-z0-9_]{2,60}$/;
const permissionKeys = new Set<string>(permissionGroups.flatMap((group) => group.permissions.map((permission) => permission.key)));

function input(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function permissionList(formData: FormData) {
  const raw = input(formData, "permission_keys");
  if (raw.length > 10000) return null;
  try {
    const values: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(values) || values.length > 100) return null;
    const unique = [...new Set(values)];
    return unique.every((value): value is string => typeof value === "string" && permissionKeys.has(value)) ? unique : null;
  } catch {
    return null;
  }
}

function errorResult(error: { code?: string; message?: string }, fallback: string): RoleActionResult {
  const message = error.message || "";
  if (message.includes("Not authorized")) return { ok: false, message: "You do not have permission to manage roles." };
  if (error.code === "23505") return { ok: false, message: "A role with that key already exists. Choose a different name." };
  if (message.includes("last") || message.includes("At least one")) return { ok: false, message: "This change would remove the last person who can manage access." };
  if (message.includes("Owner")) return { ok: false, message: message.replace(/^.*?exception\s*/i, "") || "Owner access is protected." };
  if (message.includes("Role not found") || message.includes("User not found")) return { ok: false, message: "That role or user no longer exists. Refresh and try again." };
  if (message.includes("Remove users")) return { ok: false, message: "Remove all users from this role before deleting it." };
  if (message.includes("invalid") || message.includes("between") || message.includes("Too many")) return { ok: false, message: "Check the role details and selected permissions." };
  return { ok: false, message: fallback };
}

async function readyManager(): Promise<{ context: WorkspaceContext; result?: undefined } | { context: WorkspaceContextResult; result: RoleActionResult }> {
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return { context, result: { ok: false, message: context.status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Create a workspace before managing roles." } as RoleActionResult };
  const { data, error } = await context.supabase.rpc("has_permission", { required_permission: "users.manage" });
  if (error || data !== true) return { context, result: { ok: false, message: "You do not have permission to manage roles." } as RoleActionResult };
  return { context };
}

export async function createRole(formData: FormData): Promise<RoleActionResult> {
  const name = input(formData, "name");
  const roleKey = input(formData, "role_key").toLowerCase();
  const permissions = permissionList(formData);
  if (name.length < 2 || name.length > 60) return { ok: false, message: "Role name must be between 2 and 60 characters.", };
  if (!ROLE_KEY_PATTERN.test(roleKey) || roleKey === "owner") return { ok: false, message: "Choose a valid role name." };
  if (!permissions) return { ok: false, message: "One or more selected permissions are invalid." };

  const { context, result } = await readyManager();
  if (result) return result;
  const { data, error } = await context.supabase.rpc("create_role", { p_name: name, p_role_key: roleKey, p_permission_keys: permissions });
  if (error || !data) return errorResult(error || { message: "Missing role ID" }, "Unable to create this role. Try again.");
  revalidatePath("/roles-permissions");
  return { ok: true, message: "Role created.", roleId: data as string };
}

export async function updateRoleName(formData: FormData): Promise<RoleActionResult> {
  const roleId = input(formData, "role_id");
  const name = input(formData, "name");
  if (!UUID_PATTERN.test(roleId)) return { ok: false, message: "This role ID is invalid." };
  if (name.length < 2 || name.length > 60) return { ok: false, message: "Role name must be between 2 and 60 characters." };
  const { context, result } = await readyManager();
  if (result) return result;
  const { error } = await context.supabase.rpc("update_role_name", { p_role_id: roleId, p_name: name });
  if (error) return errorResult(error, "Unable to rename this role. Try again.");
  revalidatePath("/roles-permissions");
  return { ok: true, message: "Role name updated.", roleId };
}

export async function updateRolePermissions(formData: FormData): Promise<RoleActionResult> {
  const roleId = input(formData, "role_id");
  const permissions = permissionList(formData);
  if (!UUID_PATTERN.test(roleId)) return { ok: false, message: "This role ID is invalid." };
  if (!permissions) return { ok: false, message: "One or more selected permissions are invalid." };
  const { context, result } = await readyManager();
  if (result) return result;
  const { error } = await context.supabase.rpc("update_role_permissions", { p_role_id: roleId, p_permission_keys: permissions });
  if (error) return errorResult(error, "Unable to save permissions. Try again.");
  revalidatePath("/roles-permissions");
  return { ok: true, message: "Permissions saved.", roleId };
}

export async function setRoleUser(formData: FormData): Promise<RoleActionResult> {
  const roleId = input(formData, "role_id");
  const userId = input(formData, "user_id");
  const assigned = input(formData, "assigned");
  if (!UUID_PATTERN.test(roleId) || !UUID_PATTERN.test(userId)) return { ok: false, message: "This role or user ID is invalid." };
  if (assigned !== "true" && assigned !== "false") return { ok: false, message: "The requested role change is invalid." };
  const { context, result } = await readyManager();
  if (result) return result;
  const { error } = await context.supabase.rpc("set_role_user", { p_role_id: roleId, p_user_id: userId, p_assigned: assigned === "true" });
  if (error) return errorResult(error, "Unable to update this user’s role. Try again.");
  revalidatePath("/roles-permissions");
  return { ok: true, message: assigned === "true" ? "User added to role." : "User removed from role.", roleId };
}

export async function deleteRole(formData: FormData): Promise<RoleActionResult> {
  const roleId = input(formData, "role_id");
  if (!UUID_PATTERN.test(roleId)) return { ok: false, message: "This role ID is invalid." };
  const { context, result } = await readyManager();
  if (result) return result;
  const { error } = await context.supabase.rpc("delete_role", { p_role_id: roleId });
  if (error) return errorResult(error, "Unable to delete this role. Try again.");
  revalidatePath("/roles-permissions");
  return { ok: true, message: "Role deleted." };
}
