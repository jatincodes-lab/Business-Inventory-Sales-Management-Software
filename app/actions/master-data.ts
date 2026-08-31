"use server";

import { revalidatePath } from "next/cache";

import { getWorkspaceContext } from "@/lib/supabase/workspace";

export type MasterDataActionResult = {
  ok: boolean;
  message: string;
  field?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const SKU_PATTERN = /^[A-Za-z0-9_-]+$/;
const NAME_PATTERN = /[^\p{L}\p{N}\s&().'\/_-]/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^[6-9][0-9]{9}$/;
const TAX_ID_PATTERN = /^[A-Za-z0-9./_-]+$/;

function value(formData: FormData, key: string) {
  const input = formData.get(key);
  return typeof input === "string" ? input.trim() : "";
}

function validateText(input: string, label: string, min: number, max: number, pattern?: RegExp) {
  if (!input) return `${label} is required.`;
  if (input.length < min) return `${label} must be at least ${min} characters.`;
  if (input.length > max) return `${label} must be ${max} characters or fewer.`;
  if (pattern?.test(input)) return `${label} contains unsupported characters.`;
  return null;
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

function invalidId(input: string, label: string) {
  return UUID_PATTERN.test(input) ? null : `${label} is invalid.`;
}

function databaseError(error: { code?: string; message?: string }, fallback: string): MasterDataActionResult {
  if (error.code === "23505") return { ok: false, message: "A record with the same code, name, or SKU already exists." };
  if (error.code === "23503") return { ok: false, message: "This record is referenced by other data and cannot be changed." };
  if (error.code === "23514") return { ok: false, message: "One or more values are outside the allowed range." };
  return { ok: false, message: fallback };
}

function workspaceFailure(status: "unauthenticated" | "needs_onboarding" | "error"): MasterDataActionResult {
  return {
    ok: false,
    message: status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Create a workspace before managing master data.",
  };
}

async function hasPermission(context: Awaited<ReturnType<typeof getWorkspaceContext>>, permission: string) {
  if (context.status !== "ready") return false;
  const { data, error } = await context.supabase.rpc("has_permission", { required_permission: permission });
  return !error && data === true;
}

export async function createUnit(formData: FormData): Promise<MasterDataActionResult> {
  const name = value(formData, "name");
  const code = value(formData, "code").toUpperCase();
  const nameError = validateText(name, "Unit name", 1, 30, NAME_PATTERN);
  if (nameError) return { ok: false, message: nameError, field: "name" };
  if (!code || code.length > 20 || !CODE_PATTERN.test(code)) return { ok: false, message: "Code must use 1 to 20 letters, numbers, underscores, or hyphens.", field: "code" };

  const context = await getWorkspaceContext();
  if (context.status !== "ready") return workspaceFailure(context.status);

  const { error } = await context.supabase.from("units").insert({ business_id: context.businessId, name, code });
  if (error) return databaseError(error, "Unable to create unit.");
  revalidatePath("/units");
  revalidatePath("/items");
  return { ok: true, message: "Unit created." };
}

export async function updateUnit(formData: FormData): Promise<MasterDataActionResult> {
  const id = value(formData, "id");
  const name = value(formData, "name");
  const code = value(formData, "code").toUpperCase();
  const idError = invalidId(id, "Unit");
  const nameError = validateText(name, "Unit name", 1, 30, NAME_PATTERN);
  if (idError) return { ok: false, message: idError };
  if (nameError) return { ok: false, message: nameError, field: "name" };
  if (!code || code.length > 20 || !CODE_PATTERN.test(code)) return { ok: false, message: "Code must use 1 to 20 letters, numbers, underscores, or hyphens.", field: "code" };

  const context = await getWorkspaceContext();
  if (context.status !== "ready") return workspaceFailure(context.status);

  const { data, error } = await context.supabase.from("units").update({ name, code }).eq("id", id).eq("business_id", context.businessId).select("id").maybeSingle();
  if (error) return databaseError(error, "Unable to update unit.");
  if (!data) return { ok: false, message: "Unit was not found in this workspace." };
  revalidatePath("/units");
  revalidatePath("/items");
  return { ok: true, message: "Unit updated." };
}

export async function createWarehouse(formData: FormData): Promise<MasterDataActionResult> {
  const name = value(formData, "name");
  const address = value(formData, "address");
  const nameError = validateText(name, "Warehouse name", 1, 100, NAME_PATTERN);
  if (nameError) return { ok: false, message: nameError, field: "name" };
  if (address.length > 500) return { ok: false, message: "Address must be 500 characters or fewer.", field: "address" };

  const context = await getWorkspaceContext();
  if (context.status !== "ready") return workspaceFailure(context.status);
  const { error } = await context.supabase.from("warehouses").insert({ business_id: context.businessId, name, address: address || null });
  if (error) return databaseError(error, "Unable to create warehouse.");
  revalidatePath("/warehouses");
  return { ok: true, message: "Warehouse created." };
}

export async function updateWarehouse(formData: FormData): Promise<MasterDataActionResult> {
  const id = value(formData, "id");
  const name = value(formData, "name");
  const address = value(formData, "address");
  const idError = invalidId(id, "Warehouse");
  const nameError = validateText(name, "Warehouse name", 1, 100, NAME_PATTERN);
  if (idError) return { ok: false, message: idError };
  if (nameError) return { ok: false, message: nameError, field: "name" };
  if (address.length > 500) return { ok: false, message: "Address must be 500 characters or fewer.", field: "address" };

  const context = await getWorkspaceContext();
  if (context.status !== "ready") return workspaceFailure(context.status);
  const { data, error } = await context.supabase.from("warehouses").update({ name, address: address || null }).eq("id", id).eq("business_id", context.businessId).select("id").maybeSingle();
  if (error) return databaseError(error, "Unable to update warehouse.");
  if (!data) return { ok: false, message: "Warehouse was not found in this workspace." };
  revalidatePath("/warehouses");
  return { ok: true, message: "Warehouse updated." };
}

function validateVendor(formData: FormData) {
  const name = value(formData, "name");
  const email = value(formData, "email").toLowerCase();
  const mobile = value(formData, "mobile");
  const address = value(formData, "address");
  const taxId = value(formData, "tax_id").toUpperCase();
  const paymentTerms = value(formData, "payment_terms_days");
  const nameError = validateText(name, "Vendor name", 2, 160, NAME_PATTERN);
  const emailError = email && (email.length > 254 || !EMAIL_PATTERN.test(email)) ? "Enter a valid email address." : null;
  const mobileError = mobile && !MOBILE_PATTERN.test(mobile) ? "Mobile number must contain exactly 10 digits and start with 6, 7, 8, or 9." : null;
  const addressError = address.length > 500 ? "Address must be 500 characters or fewer." : null;
  const taxError = taxId && (taxId.length > 50 || !TAX_ID_PATTERN.test(taxId)) ? "Tax ID may contain only letters, numbers, dots, slashes, underscores, and hyphens." : null;
  const paymentError = !/^\d{1,4}$/.test(paymentTerms) || Number(paymentTerms) > 3650 ? "Payment terms must be a whole number from 0 to 3650 days." : null;
  return { name, email, mobile, address, taxId, paymentTerms, error: nameError || emailError || mobileError || addressError || taxError || paymentError };
}

export async function createVendor(formData: FormData): Promise<MasterDataActionResult> {
  const vendor = validateVendor(formData);
  if (vendor.error) return { ok: false, message: vendor.error };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return workspaceFailure(context.status);
  const { error } = await context.supabase.from("vendors").insert({ business_id: context.businessId, name: vendor.name, email: vendor.email || null, mobile: vendor.mobile || null, address: vendor.address || null, tax_id: vendor.taxId || null, payment_terms_days: vendor.paymentTerms });
  if (error) return databaseError(error, "Unable to create vendor.");
  revalidatePath("/vendors");
  return { ok: true, message: "Vendor created." };
}

export async function updateVendor(formData: FormData): Promise<MasterDataActionResult> {
  const id = value(formData, "id");
  const idError = invalidId(id, "Vendor");
  if (idError) return { ok: false, message: idError };
  const vendor = validateVendor(formData);
  if (vendor.error) return { ok: false, message: vendor.error };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return workspaceFailure(context.status);
  const { data, error } = await context.supabase.from("vendors").update({ name: vendor.name, email: vendor.email || null, mobile: vendor.mobile || null, address: vendor.address || null, tax_id: vendor.taxId || null, payment_terms_days: vendor.paymentTerms }).eq("id", id).eq("business_id", context.businessId).select("id").maybeSingle();
  if (error) return databaseError(error, "Unable to update vendor.");
  if (!data) return { ok: false, message: "Vendor was not found in this workspace." };
  revalidatePath("/vendors");
  return { ok: true, message: "Vendor updated." };
}

function validateCustomer(formData: FormData) {
  const name = value(formData, "name");
  const email = value(formData, "email").toLowerCase();
  const mobile = value(formData, "mobile");
  const address = value(formData, "address");
  const taxId = value(formData, "tax_id").toUpperCase();
  const paymentTerms = value(formData, "payment_terms_days");
  const nameError = validateText(name, "Customer name", 2, 160, NAME_PATTERN);
  const emailError = email && (email.length > 254 || !EMAIL_PATTERN.test(email)) ? "Enter a valid email address." : null;
  const mobileError = mobile && !MOBILE_PATTERN.test(mobile) ? "Mobile number must contain exactly 10 digits and start with 6, 7, 8, or 9." : null;
  const addressError = address.length > 500 ? "Address must be 500 characters or fewer." : null;
  const taxError = taxId && (taxId.length > 50 || !TAX_ID_PATTERN.test(taxId)) ? "Tax ID may contain only letters, numbers, dots, slashes, underscores, and hyphens." : null;
  const paymentError = !/^\d+$/.test(paymentTerms) || Number(paymentTerms) > 3650 ? "Payment terms must be a whole number from 0 to 3650 days." : null;
  return { name, email, mobile, address, taxId, paymentTerms, error: nameError || emailError || mobileError || addressError || taxError || paymentError };
}

export async function createCustomer(formData: FormData): Promise<MasterDataActionResult> {
  const customer = validateCustomer(formData);
  if (customer.error) return { ok: false, message: customer.error };

  const context = await getWorkspaceContext();
  if (context.status !== "ready") return workspaceFailure(context.status);
  if (!(await hasPermission(context, "customers.create"))) return { ok: false, message: "You do not have permission to add customers." };

  const { error } = await context.supabase.from("customers").insert({
    business_id: context.businessId,
    name: customer.name,
    email: customer.email || null,
    mobile: customer.mobile || null,
    address: customer.address || null,
    tax_id: customer.taxId || null,
    payment_terms_days: customer.paymentTerms,
  });
  if (error) return databaseError(error, "Unable to add customer.");
  revalidatePath("/customers");
  revalidatePath("/sales-orders");
  revalidatePath("/protected");
  return { ok: true, message: "Customer added." };
}

export async function updateCustomer(formData: FormData): Promise<MasterDataActionResult> {
  const id = value(formData, "id");
  const idError = invalidId(id, "Customer");
  if (idError) return { ok: false, message: idError };

  const customer = validateCustomer(formData);
  if (customer.error) return { ok: false, message: customer.error };

  const activeValue = value(formData, "is_active");
  if (activeValue !== "true" && activeValue !== "false") return { ok: false, message: "Customer status is invalid." };

  const context = await getWorkspaceContext();
  if (context.status !== "ready") return workspaceFailure(context.status);
  if (!(await hasPermission(context, "customers.edit"))) return { ok: false, message: "You do not have permission to edit customers." };

  const { data, error } = await context.supabase.from("customers").update({
    name: customer.name,
    email: customer.email || null,
    mobile: customer.mobile || null,
    address: customer.address || null,
    tax_id: customer.taxId || null,
    payment_terms_days: customer.paymentTerms,
    is_active: activeValue === "true",
  }).eq("id", id).eq("business_id", context.businessId).select("id").maybeSingle();
  if (error) return databaseError(error, "Unable to update customer.");
  if (!data) return { ok: false, message: "Customer was not found in this workspace." };
  revalidatePath("/customers");
  revalidatePath("/sales-orders");
  revalidatePath("/protected");
  return { ok: true, message: "Customer updated." };
}

async function validateItem(formData: FormData) {
  const sku = value(formData, "sku").toUpperCase();
  const name = value(formData, "name");
  const unitId = value(formData, "unit_id");
  const purchasePrice = value(formData, "purchase_price");
  const salePrice = value(formData, "sale_price");
  const taxRate = value(formData, "tax_rate");
  const reorderLevel = value(formData, "reorder_level");
  const skuError = validateText(sku, "SKU", 1, 60) || (!SKU_PATTERN.test(sku) ? "SKU must use only letters, numbers, underscores, or hyphens." : null);
  const nameError = validateText(name, "Item name", 1, 160);
  const unitError = invalidId(unitId, "Unit");
  const purchaseError = validateDecimal(purchasePrice, "Purchase price", 2, 16);
  const saleError = validateDecimal(salePrice, "Sale price", 2, 16);
  const taxError = validateDecimal(taxRate, "Tax rate", 2, 3, 100);
  const reorderError = validateDecimal(reorderLevel, "Reorder level", 3, 15);
  return { sku, name, unitId, purchasePrice, salePrice, taxRate, reorderLevel, error: skuError || nameError || unitError || purchaseError || saleError || taxError || reorderError };
}

export async function createItem(formData: FormData): Promise<MasterDataActionResult> {
  const item = await validateItem(formData);
  if (item.error) return { ok: false, message: item.error };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return workspaceFailure(context.status);
  const { data: unit } = await context.supabase.from("units").select("id").eq("id", item.unitId).eq("business_id", context.businessId).maybeSingle();
  if (!unit) return { ok: false, message: "Select a valid unit from this workspace.", field: "unit_id" };
  const { error } = await context.supabase.from("items").insert({ business_id: context.businessId, unit_id: item.unitId, sku: item.sku, name: item.name, purchase_price: item.purchasePrice, sale_price: item.salePrice, tax_rate: item.taxRate, reorder_level: item.reorderLevel });
  if (error) return databaseError(error, "Unable to create item.");
  revalidatePath("/items");
  revalidatePath("/protected");
  return { ok: true, message: "Item created." };
}

export async function updateItem(formData: FormData): Promise<MasterDataActionResult> {
  const id = value(formData, "id");
  const idError = invalidId(id, "Item");
  if (idError) return { ok: false, message: idError };
  const item = await validateItem(formData);
  if (item.error) return { ok: false, message: item.error };
  const context = await getWorkspaceContext();
  if (context.status !== "ready") return workspaceFailure(context.status);
  const { data: unit } = await context.supabase.from("units").select("id").eq("id", item.unitId).eq("business_id", context.businessId).maybeSingle();
  if (!unit) return { ok: false, message: "Select a valid unit from this workspace.", field: "unit_id" };
  const { data, error } = await context.supabase.from("items").update({ unit_id: item.unitId, sku: item.sku, name: item.name, purchase_price: item.purchasePrice, sale_price: item.salePrice, tax_rate: item.taxRate, reorder_level: item.reorderLevel }).eq("id", id).eq("business_id", context.businessId).select("id").maybeSingle();
  if (error) return databaseError(error, "Unable to update item.");
  if (!data) return { ok: false, message: "Item was not found in this workspace." };
  revalidatePath("/items");
  revalidatePath("/protected");
  return { ok: true, message: "Item updated." };
}
