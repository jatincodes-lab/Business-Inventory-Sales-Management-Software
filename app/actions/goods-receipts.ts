"use server";

import { revalidatePath } from "next/cache";

import { getWorkspaceContext } from "@/lib/supabase/workspace";

export type GoodsReceiptActionResult = { ok: boolean; message: string; receiptId?: string; field?: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9/_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ReceiptLineInput = { purchase_order_line_id: string; item_id: string; quantity: string; unit_cost: string };

function value(formData: FormData, key: string) {
  const input = formData.get(key);
  return typeof input === "string" ? input.trim() : "";
}

function validDate(input: string, label: string) {
  if (!DATE_PATTERN.test(input)) return `${label} must be a valid date.`;
  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input ? `${label} must be a valid date.` : null;
}

function decimal(input: string, label: string, scale: number, maxIntegerDigits: number) {
  if (!input || !new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`).test(input)) return `${label} must be a valid number with up to ${scale} decimal places.`;
  const integerDigits = input.split(".")[0].replace(/^0+/, "").length;
  return integerDigits > maxIntegerDigits ? `${label} is too large.` : null;
}

function parseLines(input: string): { lines?: ReceiptLineInput[]; error?: string } {
  if (!input) return { error: "Select at least one item to receive." };
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { return { error: "Receipt items are invalid." }; }
  if (!Array.isArray(parsed) || parsed.length === 0) return { error: "Select at least one item to receive." };
  if (parsed.length > 200) return { error: "A receipt cannot contain more than 200 lines." };

  const lines: ReceiptLineInput[] = [];
  const lineIds = new Set<string>();
  for (const line of parsed) {
    if (!line || typeof line !== "object") return { error: "Receipt items are invalid." };
    const inputLine = line as Record<string, unknown>;
    const purchaseOrderLineId = typeof inputLine.purchase_order_line_id === "string" ? inputLine.purchase_order_line_id.trim() : "";
    const itemId = typeof inputLine.item_id === "string" ? inputLine.item_id.trim() : "";
    const quantity = typeof inputLine.quantity === "string" ? inputLine.quantity.trim() : "";
    const unitCost = typeof inputLine.unit_cost === "string" ? inputLine.unit_cost.trim() : "";
    if (!UUID_PATTERN.test(purchaseOrderLineId) || !UUID_PATTERN.test(itemId)) return { error: "Receipt items are invalid." };
    if (lineIds.has(purchaseOrderLineId)) return { error: "A purchase order line can appear only once per receipt." };
    lineIds.add(purchaseOrderLineId);
    const quantityError = decimal(quantity, "Quantity", 3, 15);
    const costError = decimal(unitCost, "Rate", 2, 16);
    if (quantityError || costError) return { error: quantityError || costError || "Receipt items are invalid." };
    if (Number(quantity) <= 0) return { error: "Receipt quantity must be greater than zero." };
    lines.push({ purchase_order_line_id: purchaseOrderLineId, item_id: itemId, quantity, unit_cost: unitCost });
  }
  return { lines };
}

function rpcError(error: { code?: string; message?: string }): GoodsReceiptActionResult {
  if (error.code === "23505") return { ok: false, message: "That receipt number already exists." };
  const message = error.message || "";
  if (message.includes("Not authorized")) return { ok: false, message: "You do not have permission to create receipts." };
  if (message.includes("not found")) return { ok: false, message: "The purchase order or receipt no longer exists." };
  if (message.includes("Only submitted")) return { ok: false, message: "Only submitted purchase orders can be received." };
  if (message.includes("Warehouse")) return { ok: false, message: "Select an active warehouse from this workspace.", field: "warehouse_id" };
  if (message.includes("Receipt date")) return { ok: false, message: "Receipt date cannot be before the purchase order date.", field: "receipt_date" };
  if (message.includes("exceed")) return { ok: false, message: "One or more quantities exceed the remaining quantity. Refresh and try again.", field: "lines" };
  if (message.includes("line") || message.includes("lines")) return { ok: false, message: "One or more receipt lines are invalid. Refresh and try again.", field: "lines" };
  return { ok: false, message: "Unable to save goods receipt." };
}

function postRpcError(error: { code?: string; message?: string }): GoodsReceiptActionResult {
  const message = error.message || "";
  if (message.includes("Not authorized")) return { ok: false, message: "You do not have permission to post receipts." };
  if (message.includes("not found")) return { ok: false, message: "This goods receipt no longer exists." };
  if (message.includes("Only draft")) return { ok: false, message: "This receipt is already processed. Refresh the page." };
  if (message.includes("no longer active")) return { ok: false, message: "The warehouse is inactive. Move this receipt to an active warehouse." };
  if (message.includes("exceeds")) return { ok: false, message: "Received quantity exceeds the remaining PO quantity. Refresh and try again." };
  if (message.includes("purchase order")) return { ok: false, message: "This purchase order is no longer available for receiving." };
  return { ok: false, message: "Unable to post goods receipt." };
}

export async function createGoodsReceipt(formData: FormData): Promise<GoodsReceiptActionResult> {
  const purchaseOrderId = value(formData, "purchase_order_id");
  const warehouseId = value(formData, "warehouse_id");
  const receiptNumber = value(formData, "receipt_number").toUpperCase();
  const receiptDate = value(formData, "receipt_date");
  const notes = value(formData, "notes");
  const parsedLines = parseLines(value(formData, "lines"));
  if (!UUID_PATTERN.test(purchaseOrderId)) return { ok: false, message: "Select a valid purchase order." };
  if (!UUID_PATTERN.test(warehouseId)) return { ok: false, message: "Select a valid warehouse.", field: "warehouse_id" };
  if (!receiptNumber || receiptNumber.length > 40 || !CODE_PATTERN.test(receiptNumber)) return { ok: false, message: "Receipt number must use up to 40 letters, numbers, slashes, underscores, or hyphens.", field: "receipt_number" };
  const dateError = validDate(receiptDate, "Receipt date");
  if (dateError) return { ok: false, message: dateError, field: "receipt_date" };
  if (notes.length > 1000) return { ok: false, message: "Receipt notes must be 1000 characters or fewer.", field: "notes" };
  if (parsedLines.error || !parsedLines.lines) return { ok: false, message: parsedLines.error || "Select at least one item to receive.", field: "lines" };

  const context = await getWorkspaceContext();
  if (context.status !== "ready") return { ok: false, message: context.status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Unable to load your workspace." };
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "receipts.create" });
  if (permissionError) return { ok: false, message: "Unable to verify receipt permissions." };
  if (allowed !== true) return { ok: false, message: "You do not have permission to create receipts." };
  const { data: receiptId, error } = await context.supabase.rpc("create_goods_receipt", { purchase_order_id: purchaseOrderId, warehouse_id: warehouseId, receipt_number: receiptNumber, receipt_date: receiptDate, notes: notes || null, lines: parsedLines.lines });
  if (error || !receiptId) return rpcError(error || { message: "Missing receipt ID" });
  revalidatePath("/goods-receipts");
  revalidatePath(`/goods-receipts/${receiptId}`);
  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
  return { ok: true, message: "Goods receipt saved as draft.", receiptId };
}

export async function postGoodsReceipt(receiptId: string): Promise<GoodsReceiptActionResult> {
  if (!UUID_PATTERN.test(receiptId)) return { ok: false, message: "This goods receipt ID is invalid." };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return { ok: false, message: context.status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Unable to load your workspace." };
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "receipts.post" });
  if (permissionError) return { ok: false, message: "Unable to verify receipt permissions." };
  if (allowed !== true) return { ok: false, message: "You do not have permission to post receipts." };
  const { error } = await context.supabase.rpc("post_goods_receipt", { receipt_id: receiptId });
  if (error) return postRpcError(error);
  revalidatePath("/goods-receipts");
  revalidatePath(`/goods-receipts/${receiptId}`);
  revalidatePath("/purchase-orders");
  revalidatePath("/protected");
  return { ok: true, message: "Goods receipt posted and stock updated.", receiptId };
}
