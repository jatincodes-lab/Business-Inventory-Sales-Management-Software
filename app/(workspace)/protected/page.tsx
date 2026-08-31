import { DashboardOverview } from "@/components/dashboard-overview";

export const instant = false;

export default async function ProtectedPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const period = (await searchParams).period;
  const validPeriod = period === "day" || period === "week" || period === "month" || period === "year" ? period : "month";
  return <DashboardOverview period={validPeriod} />;
}
