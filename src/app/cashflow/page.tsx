import { auth } from "@/auth";
import { CashflowOverview } from "@/components/cashflow/cashflow-overview";
import { currentPeriodKeys } from "@/lib/cashflow/dashboard-metrics";
import { todayInManila } from "@/lib/cashflow/visit-status";
import { getBranchById, listBranches } from "@/lib/db/branches";
import { getOverviewData } from "@/lib/db/overview";
import { getSalesTarget } from "@/lib/db/targets";
import { getUserById } from "@/lib/db/users";

/**
 * The Overview. Every figure is added up by the database and only the
 * results are sent to the browser (see `getOverviewData`). An admin, or
 * someone with no branch, sees all branches; anyone else sees their own
 * branch only, like the Day end report.
 */
export default async function CashflowPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "admin";
  const me = session?.user ? await getUserById(session.user.id) : undefined;
  const branchId = !isAdmin && me?.branchId ? me.branchId : null;

  // "Today" on the clinic's calendar (Manila), parsed as a local date so the
  // current month / quarter / year do not depend on the server's time zone.
  const referenceDate = new Date(`${todayInManila()}T00:00:00`);
  const periodKeys = currentPeriodKeys(referenceDate);

  const [data, branches, branch, monthTarget, quarterTarget, yearTarget] =
    await Promise.all([
      getOverviewData({ branchId, referenceDate }),
      listBranches(),
      branchId ? getBranchById(branchId) : Promise.resolve(undefined),
      // The clinic-wide targets are not compared with one branch's figures.
      branchId ? Promise.resolve(null) : getSalesTarget("month", periodKeys.month),
      branchId ? Promise.resolve(null) : getSalesTarget("quarter", periodKeys.quarter),
      branchId ? Promise.resolve(null) : getSalesTarget("year", periodKeys.year),
    ]);

  return (
    <CashflowOverview
      data={data}
      userName={session?.user.name ?? session?.user.email ?? undefined}
      targets={
        branchId
          ? null
          : {
              month: monthTarget?.targetAmount ?? null,
              quarter: quarterTarget?.targetAmount ?? null,
              year: yearTarget?.targetAmount ?? null,
            }
      }
      canEditTargets={isAdmin}
      branchName={branch?.name}
      branches={branches}
    />
  );
}
