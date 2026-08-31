import { DashboardOverview } from "@/components/dashboard-overview";

export const instant = false;

export default async function ProtectedPage() {
  return <DashboardOverview />;
}
