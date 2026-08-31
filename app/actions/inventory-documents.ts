"use server";

import { revalidatePath } from "next/cache";

import { getWorkspaceContext } from "@/lib/supabase/workspace";

export type InventoryDocumentActionResult = { ok: boolean; message: string; documentId?: string; field?: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9/_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_PATTERN = /^-?\d+(?:\.\d{1,3})?$/;

type AdjustmentLineInput = { item_id: string; quantity_delta: string };
type TransferLineInput = { item_id: string; quantity: string };

function value(formData: FormData, key: string) {
  const input = formData.get(key);
  return typeof input === "string" ? input.trim() : "";
}

function validDate(input: string, label: string) {
  if (!DATE_PATTERN.test(input)) return `${label} must be a valid date.`;
  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input ? `${label} must be a valid date.` : null;
}

function decimal(input: string, label: string, allowNegative: boolean) {
  const pattern = allowNegative ? DECIMAL_PATTERN : /^\d+(?:\.\d{1,3})?$/;
  if (!input || !pattern.test(input)) return `${label} must be a valid number with up to 3 decimal places.`;
  if (input.split(".")[0].replace(/^-?0+/, "").length > 15) return `${label} is too large.`;
  const numeric = Number(input);
  if (!Number.isFinite(numeric) || numeric === 0) return `${label} must not be zero.`;
  return null;
}

function parseLines<T>(input: string, parser: (line: Record<string, unknown>) => { value?: T; error?: string }, emptyMessage: string) {
  if (!input) return { error: emptyMessage };
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { return { error: "Document lines are invalid." }; }
  if (!Array.isArray(parsed) || parsed.length === 0) return { error: emptyMessage };
  if (parsed.length > 200) return { error: "A document cannot contain more than 200 lines." };
  const lines: T[] = [];
  const itemIds = new Set<string>();
  for (const line of parsed) {
    if (!line || typeof line !== "object") return { error: "Document lines are invalid." };
    const parsedLine = parser(line as Record<string, unknown>);
    if (parsedLine.error || !parsedLine.value) return { error: parsedLine.error || "Document lines are invalid." };
    const itemId = (parsedLine.value as unknown as { item_id: string }).item_id;
    if (itemIds.has(itemId)) return { error: "An item can appear only once per document." };
    itemIds.add(itemId);
    lines.push(parsedLine.value);
  }
  return { lines };
}

function contextError(status: "unauthenticated" | "needs_onboarding" | "error"): InventoryDocumentActionResult {
  return { ok: false, message: status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Create a workspace before managing inventory." };
}

function rpcError(error: { code?: string; message?: string }, kind: "adjustment" | "transfer"): InventoryDocumentActionResult {
  if (error.code === "23505") return { ok: false, message: "That document number already exists." };
  const message = error.message || "";
  if (message.includes("Not authorized")) return { ok: false, message: `You do not have permission to create this ${kind}.` };
  if (message.includes("Warehouse")) return { ok: false, message: "Select active warehouses from this workspace." };
  if (message.includes("warehouse")) return { ok: false, message: "Select active warehouses from this workspace." };
  if (message.includes("different")) return { ok: false, message: "Source and destination warehouses must be different.", field: "destination_warehouse_id" };
  if (message.includes("item") || message.includes("lines") || message.includes("line")) return { ok: false, message: "One or more lines are invalid. Refresh and try again.", field: "lines" };
  return { ok: false, message: `Unable to save ${kind}.` };
}

function postError(error: { message?: string }, kind: "adjustment" | "transfer"): InventoryDocumentActionResult {
  const message = error.message || "";
  if (message.includes("Not authorized")) return { ok: false, message: `You do not have permission to post this ${kind}.` };
  if (message.includes("not found")) return { ok: false, message: `This ${kind} no longer exists.` };
  if (message.includes("Only draft")) return { ok: false, message: `This ${kind} is already processed. Refresh the page.` };
  if (message.includes("negative")) return { ok: false, message: "This adjustment would make stock negative. Refresh stock and try again." };
  if (message.includes("Insufficient")) return { ok: false, message: "There is not enough stock in the source warehouse. Refresh stock and try again." };
  if (message.includes("active")) return { ok: false, message: "A warehouse or item is no longer active." };
  return { ok: false, message: `Unable to post ${kind}.` };
}

async function allowed(context: Awaited<ReturnType<typeof getWorkspaceContext>>, permission: string) {
  if (context.status !== "ready") return false;
  const { data, error } = await context.supabase.rpc("has_permission", { required_permission: permission });
  return !error && data === true;
}

export async function createInventoryAdjustment(formData: FormData): Promise<InventoryDocumentActionResult> {
  const warehouseId = value(formData, "warehouse_id");
  const adjustmentNumber = value(formData, "adjustment_number").toUpperCase();
  const adjustmentDate = value(formData, "adjustment_date");
  const reason = value(formData, "reason");
  const notes = value(formData, "notes");
  const parsed = parseLines<AdjustmentLineInput>(value(formData, "lines"), (line) => {
    const itemId = typeof line.item_id === "string" ? line.item_id.trim() : "";
    const quantityDelta = typeof line.quantity_delta === "string" ? line.quantity_delta.trim() : "";
    if (!UUID_PATTERN.test(itemId)) return { error: "Adjustment item is invalid." };
    const quantityError = decimal(quantityDelta, "Adjustment quantity", true);
    return quantityError ? { error: quantityError } : { value: { item_id: itemId, quantity_delta: quantityDelta } };
  }, "Select at least one item to adjust.");
  if (!UUID_PATTERN.test(warehouseId)) return { ok: false, message: "Select a valid warehouse.", field: "warehouse_id" };
  if (!adjustmentNumber || adjustmentNumber.length > 40 || !CODE_PATTERN.test(adjustmentNumber)) return { ok: false, message: "Adjustment number must use up to 40 letters, numbers, slashes, underscores, or hyphens.", field: "adjustment_number" };
  const dateError = validDate(adjustmentDate, "Adjustment date");
  if (dateError) return { ok: false, message: dateError, field: "adjustment_date" };
  if (!reason || reason.length > 120) return { ok: false, message: "Enter a reason up to 120 characters.", field: "reason" };
  if (notes.length > 1000) return { ok: false, message: "Notes must be 1000 characters or fewer.", field: "notes" };
  if (parsed.error || !parsed.lines) return { ok: false, message: parsed.error || "Select at least one item to adjust.", field: "lines" };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return contextError(context.status);
  if (!(await allowed(context, "inventory.adjust"))) return { ok: false, message: "You do not have permission to create adjustments." };
  const { data, error } = await context.supabase.rpc("create_inventory_adjustment", { warehouse_id: warehouseId, adjustment_number: adjustmentNumber, adjustment_date: adjustmentDate, reason, notes: notes || null, lines: parsed.lines });
  if (error || !data) return rpcError(error || { message: "Missing adjustment ID" }, "adjustment");
  revalidatePath("/inventory-adjustment");
  revalidatePath(`/inventory-adjustment/${data}`);
  return { ok: true, message: "Adjustment saved as draft.", documentId: data };
}

export async function createStockTransfer(formData: FormData): Promise<InventoryDocumentActionResult> {
  const sourceWarehouseId = value(formData, "source_warehouse_id");
  const destinationWarehouseId = value(formData, "destination_warehouse_id");
  const transferNumber = value(formData, "transfer_number").toUpperCase();
  const transferDate = value(formData, "transfer_date");
  const notes = value(formData, "notes");
  const parsed = parseLines<TransferLineInput>(value(formData, "lines"), (line) => {
    const itemId = typeof line.item_id === "string" ? line.item_id.trim() : "";
    const quantity = typeof line.quantity === "string" ? line.quantity.trim() : "";
    if (!UUID_PATTERN.test(itemId)) return { error: "Transfer item is invalid." };
    const quantityError = decimal(quantity, "Transfer quantity", false);
    return quantityError ? { error: quantityError } : { value: { item_id: itemId, quantity } };
  }, "Select at least one item to transfer.");
  if (!UUID_PATTERN.test(sourceWarehouseId)) return { ok: false, message: "Select a valid source warehouse.", field: "source_warehouse_id" };
  if (!UUID_PATTERN.test(destinationWarehouseId)) return { ok: false, message: "Select a valid destination warehouse.", field: "destination_warehouse_id" };
  if (sourceWarehouseId === destinationWarehouseId) return { ok: false, message: "Source and destination warehouses must be different.", field: "destination_warehouse_id" };
  if (!transferNumber || transferNumber.length > 40 || !CODE_PATTERN.test(transferNumber)) return { ok: false, message: "Transfer number must use up to 40 letters, numbers, slashes, underscores, or hyphens.", field: "transfer_number" };
  const dateError = validDate(transferDate, "Transfer date");
  if (dateError) return { ok: false, message: dateError, field: "transfer_date" };
  if (notes.length > 1000) return { ok: false, message: "Notes must be 1000 characters or fewer.", field: "notes" };
  if (parsed.error || !parsed.lines) return { ok: false, message: parsed.error || "Select at least one item to transfer.", field: "lines" };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return contextError(context.status);
  if (!(await allowed(context, "inventory.transfer"))) return { ok: false, message: "You do not have permission to create transfers." };
  const { data, error } = await context.supabase.rpc("create_stock_transfer", { source_warehouse_id: sourceWarehouseId, destination_warehouse_id: destinationWarehouseId, transfer_number: transferNumber, transfer_date: transferDate, notes: notes || null, lines: parsed.lines });
  if (error || !data) return rpcError(error || { message: "Missing transfer ID" }, "transfer");
  revalidatePath("/inventory-transfers");
  revalidatePath(`/inventory-transfers/${data}`);
  return { ok: true, message: "Transfer saved as draft.", documentId: data };
}

export async function postInventoryAdjustment(id: string): Promise<InventoryDocumentActionResult> {
  return postDocument(id, "post_inventory_adjustment", "inventory.adjust", "adjustment");
}

export async function cancelInventoryAdjustment(id: string): Promise<InventoryDocumentActionResult> {
  return cancelDocument(id, "cancel_inventory_adjustment", "inventory.adjust", "adjustment");
}

export async function postStockTransfer(id: string): Promise<InventoryDocumentActionResult> {
  return postDocument(id, "post_stock_transfer", "inventory.transfer", "transfer");
}

export async function cancelStockTransfer(id: string): Promise<InventoryDocumentActionResult> {
  return cancelDocument(id, "cancel_stock_transfer", "inventory.transfer", "transfer");
}

async function postDocument(id: string, functionName: string, permission: string, kind: "adjustment" | "transfer") {
  if (!UUID_PATTERN.test(id)) return { ok: false, message: `This ${kind} ID is invalid.` };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return contextError(context.status);
  if (!(await allowed(context, permission))) return { ok: false, message: `You do not have permission to post this ${kind}.` };
  const { error } = await context.supabase.rpc(functionName, kind === "adjustment" ? { adjustment_id: id } : { transfer_id: id });
  if (error) return postError(error, kind);
  revalidatePath(kind === "adjustment" ? "/inventory-adjustment" : "/inventory-transfers");
  revalidatePath(kind === "adjustment" ? `/inventory-adjustment/${id}` : `/inventory-transfers/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/stock-movements");
  revalidatePath("/protected");
  return { ok: true, message: `${kind === "adjustment" ? "Adjustment" : "Transfer"} posted and stock updated.`, documentId: id };
}

async function cancelDocument(id: string, functionName: string, permission: string, kind: "adjustment" | "transfer") {
  if (!UUID_PATTERN.test(id)) return { ok: false, message: `This ${kind} ID is invalid.` };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return contextError(context.status);
  if (!(await allowed(context, permission))) return { ok: false, message: `You do not have permission to cancel this ${kind}.` };
  const { error } = await context.supabase.rpc(functionName, kind === "adjustment" ? { adjustment_id: id } : { transfer_id: id });
  if (error) return { ok: false, message: error.message.includes("Only draft") ? `Only draft ${kind}s can be cancelled.` : `Unable to cancel ${kind}.` };
  revalidatePath(kind === "adjustment" ? "/inventory-adjustment" : "/inventory-transfers");
  revalidatePath(kind === "adjustment" ? `/inventory-adjustment/${id}` : `/inventory-transfers/${id}`);
  return { ok: true, message: `${kind === "adjustment" ? "Adjustment" : "Transfer"} cancelled.`, documentId: id };
}
