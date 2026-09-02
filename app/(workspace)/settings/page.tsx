import { BusinessSettingsPage, type BusinessSettings } from "@/components/business-settings-page";
import { assertWorkspace, getWorkspaceContext } from "@/lib/supabase/workspace";

export default async function BusinessSettingsRoute() {
  const context = await getWorkspaceContext();
  assertWorkspace(context);

  const { data: allowed, error: permissionError } = await context.supabase.rpc("has_permission", { required_permission: "settings.manage" });
  if (permissionError) return <div className="rounded-xl border border-[#f4b4b0] bg-[#fff5f5] p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Business setup</h1><p className="mt-2 text-sm text-[#b42318]">Unable to verify access right now. Refresh and try again.</p></div>;
  if (allowed !== true) return <div className="rounded-xl border border-[#e2e8f0] bg-white p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Business setup</h1><p className="mt-2 text-sm text-[#64748b]">You do not have permission to change business settings.</p></div>;

  const { data, error } = await context.supabase
    .from("businesses")
    .select("name,logo_url,address,phone,email,tax_id,currency_code,tax_enabled,default_tax_rate,prices_include_tax,invoice_prefix,invoice_footer,payment_terms_days")
    .eq("id", context.businessId)
    .maybeSingle();
  if (error || !data) return <div className="rounded-xl border border-[#f4b4b0] bg-[#fff5f5] p-8"><h1 className="text-xl font-semibold text-[#0f172a]">Business setup</h1><p className="mt-2 text-sm text-[#b42318]">Unable to load your business settings. Refresh and try again.</p></div>;

  return <BusinessSettingsPage settings={data as BusinessSettings} />;
}
