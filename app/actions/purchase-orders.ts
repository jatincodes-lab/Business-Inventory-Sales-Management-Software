"use server";

import { revalidatePath } from "next/cache";

import { getWorkspaceContext } from "@/lib/supabase/workspace";

export type PurchaseOrderActionResult = {
  ok: boolean;
  message: string;
  orderId?: string;
  field?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9/_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type PurchaseOrderLineInput = {
  item_id: string;
  ordered_quantity: string;
  unit_cost: string;
  tax_rate: string;
};

function value(formData: FormData, key: string) {
  const input = formData.get(key);
  return typeof input === "string" ? input.trim() : "";
}

function validateDecimal(input: string, label: string, scale: number, maxIntegerDigits: number, max?: number) {
  const pattern = new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`);
  if (!input) return `${label} is required.`;
  if (!pattern.test(input)) return `${label} must be a valid number with up to ${scale} decimal places.`;
  const [integerPart] = input.split(".");
  if (integerPart.replace(/^0+/, "").length > maxIntegerDigits) return `${label} is too large.`;
  if (max !== undefined && Number(input) > max) return `${label} must be ${max} or less.`;
  return null;
}

function validDate(input: string, label: string) {
  if (!DATE_PATTERN.test(input)) return `${label} must be a valid date.`;
  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input ? `${label} must be a valid date.` : null;
}

function parseLines(input: string): { lines?: PurchaseOrderLineInput[]; error?: string } {
  if (!input) return { error: "Add at least one item." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { error: "Purchase order items are invalid." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return { error: "Add at least one item." };
  if (parsed.length > 200) return { error: "A purchase order cannot contain more than 200 items." };

  const lines: PurchaseOrderLineInput[] = [];
  const itemIds = new Set<string>();
  for (const line of parsed) {
    if (!line || typeof line !== "object") return { error: "Purchase order items are invalid." };
    const inputLine = line as Record<string, unknown>;
    const itemId = typeof inputLine.item_id === "string" ? inputLine.item_id.trim() : "";
    const quantity = typeof inputLine.ordered_quantity === "string" ? inputLine.ordered_quantity.trim() : "";
    const unitCost = typeof inputLine.unit_cost === "string" ? inputLine.unit_cost.trim() : "";
    const taxRate = typeof inputLine.tax_rate === "string" ? inputLine.tax_rate.trim() : "";
    if (!UUID_PATTERN.test(itemId)) return { error: "Select a valid item." };
    if (itemIds.has(itemId)) return { error: "An item can appear only once per purchase order." };
    itemIds.add(itemId);
    const quantityError = validateDecimal(quantity, "Quantity", 3, 15);
    const costError = validateDecimal(unitCost, "Rate", 2, 16);
    const taxError = validateDecimal(taxRate, "Tax rate", 2, 3, 100);
    if (quantityError || costError || taxError) return { error: quantityError || costError || taxError || "Purchase order items are invalid." };
    lines.push({ item_id: itemId, ordered_quantity: quantity, unit_cost: unitCost, tax_rate: taxRate });
  }
  return { lines };
}

function rpcError(error: { code?: string; message?: string }): PurchaseOrderActionResult {
  if (error.code === "23505") return { ok: false, message: "That purchase order number already exists." };
  const message = error.message || "";
  if (message.includes("Vendor is not available")) return { ok: false, message: "Select an active vendor from this workspace.", field: "vendor_id" };
  if (message.includes("items are not available")) return { ok: false, message: "Select active items from this workspace.", field: "lines" };
  if (message.includes("Delivery date cannot")) return { ok: false, message: "Delivery date cannot be before the order date.", field: "delivery_date" };
  if (message.includes("Not authorized")) return { ok: false, message: "You do not have permission to create purchase orders." };
  if (message.includes("between 1 and 200")) return { ok: false, message: "Add between 1 and 200 purchase order lines.", field: "lines" };
  if (message.includes("item can appear")) return { ok: false, message: "An item can appear only once per purchase order.", field: "lines" };
  return { ok: false, message: "Unable to create purchase order." };
}

function submitRpcError(error: { code?: string; message?: string }): PurchaseOrderActionResult {
  const message = error.message || "";
  if (message.includes("Not authorized")) return { ok: false, message: "You do not have permission to submit purchase orders." };
  if (message.includes("not found")) return { ok: false, message: "This purchase order no longer exists." };
  if (message.includes("Only draft")) return { ok: false, message: "This purchase order is no longer a draft. Refresh the page." };
  if (message.includes("at least one line")) return { ok: false, message: "Add at least one item before submitting this purchase order." };
  if (message.includes("Vendor is no longer active")) return { ok: false, message: "The vendor is inactive. Select an active vendor before submitting." };
  if (message.includes("no longer active")) return { ok: false, message: "One or more items are inactive. Update the purchase order before submitting." };
  if (message.includes("invalid quantities")) return { ok: false, message: "This purchase order contains invalid quantities and cannot be submitted." };
  if (message.includes("item can appear")) return { ok: false, message: "An item can appear only once per purchase order." };
  return { ok: false, message: "Unable to submit purchase order." };
}

export async function createPurchaseOrder(formData: FormData): Promise<PurchaseOrderActionResult> {
  const orderNumber = value(formData, "order_number").toUpperCase();
  const vendorId = value(formData, "vendor_id");
  const orderDate = value(formData, "order_date");
  const deliveryDate = value(formData, "delivery_date");
  const reference = value(formData, "reference");
  const deliveryAddress = value(formData, "delivery_address");
  const paymentTerms = value(formData, "payment_terms_days");
  const shipmentPreference = value(formData, "shipment_preference");
  const notes = value(formData, "notes");
  const parsedLines = parseLines(value(formData, "lines"));

  if (!orderNumber || orderNumber.length > 40 || !CODE_PATTERN.test(orderNumber)) return { ok: false, message: "Purchase order number must use up to 40 letters, numbers, slashes, underscores, or hyphens.", field: "order_number" };
  if (!UUID_PATTERN.test(vendorId)) return { ok: false, message: "Select a valid vendor.", field: "vendor_id" };
  const orderDateError = validDate(orderDate, "Order date");
  const deliveryDateError = deliveryDate ? validDate(deliveryDate, "Delivery date") : null;
  if (orderDateError) return { ok: false, message: orderDateError, field: "order_date" };
  if (deliveryDateError) return { ok: false, message: deliveryDateError, field: "delivery_date" };
  if (deliveryDate && deliveryDate < orderDate) return { ok: false, message: "Delivery date cannot be before the order date.", field: "delivery_date" };
  if (reference.length > 80) return { ok: false, message: "Reference must be 80 characters or fewer.", field: "reference" };
  if (deliveryAddress.length > 500) return { ok: false, message: "Delivery address must be 500 characters or fewer.", field: "delivery_address" };
  if (!/^\d+$/.test(paymentTerms) || Number(paymentTerms) > 3650) return { ok: false, message: "Payment terms must be a whole number from 0 to 3650 days.", field: "payment_terms_days" };
  if (shipmentPreference.length > 80) return { ok: false, message: "Shipment preference must be 80 characters or fewer.", field: "shipment_preference" };
  if (notes.length > 1000) return { ok: false, message: "Notes must be 1000 characters or fewer.", field: "notes" };
  if (parsedLines.error || !parsedLines.lines) return { ok: false, message: parsedLines.error || "Add at least one item.", field: "lines" };

  const context = await getWorkspaceContext();
  if (context.status !== "ready") return { ok: false, message: context.status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Create a workspace before creating purchase orders." };

  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "purchases.create" });
  if (permissionError) return { ok: false, message: "Unable to verify purchase-order permissions." };
  if (allowed !== true) return { ok: false, message: "You do not have permission to create purchase orders." };

  const { data: orderId, error } = await context.supabase.rpc("create_purchase_order", {
    order_number: orderNumber,
    vendor_id: vendorId,
    order_date: orderDate,
    delivery_date: deliveryDate || null,
    reference: reference || null,
    delivery_address: deliveryAddress || null,
    payment_terms_days: Number(paymentTerms),
    shipment_preference: shipmentPreference || null,
    notes: notes || null,
    lines: parsedLines.lines,
  });
  if (error || !orderId) return rpcError(error || { message: "Missing purchase order ID" });

  revalidatePath("/purchase-orders");
  revalidatePath("/protected");
  return { ok: true, message: "Purchase order saved as draft.", orderId };
}

export async function submitPurchaseOrder(orderId: string): Promise<PurchaseOrderActionResult> {
  if (!UUID_PATTERN.test(orderId)) return { ok: false, message: "This purchase order ID is invalid." };

  const context = await getWorkspaceContext();
  if (context.status !== "ready") return { ok: false, message: context.status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Unable to load your workspace." };

  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "purchases.edit" });
  if (permissionError) return { ok: false, message: "Unable to verify purchase-order permissions." };
  if (allowed !== true) return { ok: false, message: "You do not have permission to submit purchase orders." };

  const { data: submittedId, error } = await context.supabase.rpc("submit_purchase_order", { order_id: orderId });
  if (error || !submittedId) return submitRpcError(error || { message: "Missing purchase order ID" });

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${orderId}`);
  revalidatePath("/protected");
  return { ok: true, message: "Purchase order submitted.", orderId: submittedId };
}
