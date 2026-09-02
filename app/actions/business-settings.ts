"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, hasAdminSecret } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "@/lib/supabase/workspace";

const CURRENCIES = new Set(["INR", "USD", "EUR", "GBP", "AED"]);
const DECIMAL = /^\d{1,3}(?:\.\d{0,2})?$/;
const LOGO_BUCKET = "business-logos";
const LOGO_TYPES = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);

function value(formData: FormData, key: string) {
  const input = formData.get(key);
  return typeof input === "string" ? input.trim() : "";
}

export type BusinessSettingsActionResult = { ok: boolean; message: string; logoUrl?: string };

export async function updateBusinessSettings(formData: FormData): Promise<BusinessSettingsActionResult> {
  const name = value(formData, "name");
  const address = value(formData, "address");
  const phone = value(formData, "phone");
  const email = value(formData, "email").toLowerCase();
  const taxId = value(formData, "tax_id").toUpperCase();
  const currencyCode = value(formData, "currency_code");
  const defaultTaxRate = value(formData, "default_tax_rate") || "0";
  const invoicePrefix = value(formData, "invoice_prefix").toUpperCase();
  const invoiceFooter = value(formData, "invoice_footer");
  const paymentTermsDays = value(formData, "payment_terms_days") || "0";
  const taxEnabled = value(formData, "tax_enabled") === "true";
  const pricesIncludeTax = value(formData, "prices_include_tax") === "true";
  const uploadedLogo = formData.get("logo");
  const logoFile = uploadedLogo instanceof File && uploadedLogo.size > 0 ? uploadedLogo : null;

  if (name.length < 2 || name.length > 120) return { ok: false, message: "Business name must be between 2 and 120 characters." };
  if (address.length > 500) return { ok: false, message: "Business address must be 500 characters or fewer." };
  if (phone.length > 30) return { ok: false, message: "Phone number must be 30 characters or fewer." };
  if (email && (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))) return { ok: false, message: "Enter a valid business email address." };
  if (taxId.length > 50) return { ok: false, message: "Tax number must be 50 characters or fewer." };
  if (!CURRENCIES.has(currencyCode)) return { ok: false, message: "Choose a supported currency." };
  if (!DECIMAL.test(defaultTaxRate) || Number(defaultTaxRate) > 100) return { ok: false, message: "Default tax rate must be between 0 and 100." };
  if (!/^[A-Z0-9/_-]{1,12}$/.test(invoicePrefix)) return { ok: false, message: "Invoice prefix can use up to 12 letters, numbers, hyphens, or slashes." };
  if (invoiceFooter.length > 500) return { ok: false, message: "Invoice footer must be 500 characters or fewer." };
  if (!/^\d{1,4}$/.test(paymentTermsDays) || Number(paymentTermsDays) > 3650) return { ok: false, message: "Payment terms must be between 0 and 3650 days." };
  if (logoFile && (logoFile.size > 2 * 1024 * 1024 || !LOGO_TYPES.has(logoFile.type))) return { ok: false, message: "Logo must be a PNG, JPG, or WEBP image smaller than 2 MB." };

  const context = await getWorkspaceContext();
  if (context.status !== "ready") return { ok: false, message: context.status === "unauthenticated" ? "Your session has expired. Please sign in again." : "Create a workspace before changing settings." };
  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "settings.manage" });
  if (permissionError) return { ok: false, message: "Unable to verify settings access. Refresh and try again." };
  if (allowed !== true) return { ok: false, message: "You do not have permission to change business settings." };

  let logoUrl: string | undefined;
  if (logoFile) {
    if (!hasAdminSecret()) return { ok: false, message: "Logo uploads are not configured. Add the server-only Supabase secret key." };
    const extension = LOGO_TYPES.get(logoFile.type);
    const path = `${context.businessId}/${crypto.randomUUID()}.${extension}`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from(LOGO_BUCKET).upload(path, await logoFile.arrayBuffer(), { contentType: logoFile.type, cacheControl: "3600", upsert: false });
    if (uploadError) return { ok: false, message: "Unable to upload the logo. Try again." };
    logoUrl = admin.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const { error } = await context.supabase
    .from("businesses")
    .update({
      name,
      address: address || null,
      phone: phone || null,
      email: email || null,
      tax_id: taxId || null,
      currency_code: currencyCode,
      tax_enabled: taxEnabled,
      default_tax_rate: defaultTaxRate,
      prices_include_tax: pricesIncludeTax,
      invoice_prefix: invoicePrefix,
      invoice_footer: invoiceFooter || null,
      payment_terms_days: Number(paymentTermsDays),
      ...(logoUrl ? { logo_url: logoUrl } : {}),
    })
    .eq("id", context.businessId);

  if (error) return { ok: false, message: "Unable to save business settings. Try again." };
  revalidatePath("/settings");
  revalidatePath("/protected");
  revalidatePath("/invoices", "layout");
  return { ok: true, message: "Business settings saved.", logoUrl };
}
