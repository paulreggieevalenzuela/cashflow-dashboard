import type { Metadata } from "next";
import { auth } from "@/lib/auth/access";
import { can } from "@/lib/auth/guards";
import { getBranchPolicy, resolveQueueBranch } from "@/lib/auth/branch-policy";
import { AddTransactionModal } from "@/components/cashflow/add-transaction-modal";
import { AutoRefresh } from "@/components/cashflow/auto-refresh";
import { TodayBoard } from "@/components/cashflow/today-board";
import { WaitStats } from "@/components/cashflow/wait-stats";
import { todayInManila } from "@/lib/cashflow/visit-status";
import { listBranches } from "@/lib/db/branches";
import { listDentistUsers } from "@/lib/db/dentists";
import { listActiveDiscountTypes } from "@/lib/db/discount-types";
import { listProcedureOptions } from "@/lib/db/procedures";
import { getWaitStats, listBoardVisits } from "@/lib/db/visit-status";

export const metadata: Metadata = { title: "Queue" };

/**
 * The front desk's working screen: who has arrived, who is with the dentist,
 * who is at the cashier. Refreshes itself every 30 seconds.
 */
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch: requestedBranch } = await searchParams;
  const today = todayInManila();
  const monthAgo = new Date(`${today}T00:00:00Z`);
  monthAgo.setUTCDate(monthAgo.getUTCDate() - 30);

  const [session, dentists, branches, procedures, discountTypes] =
    await Promise.all([
      auth(),
      listDentistUsers(),
      listBranches(),
      listProcedureOptions(),
      listActiveDiscountTypes(),
    ]);
  // The Queue is per branch. An admin (or the superuser) sees all branches or
  // picks one; everyone else sees only the branch an admin assigned to them.
  const policy = await getBranchPolicy(session, branches);
  const branchId = resolveQueueBranch({
    policy,
    requested: requestedBranch,
    branchList: branches,
  });
  const [visits, todayWaits, monthWaits] = await Promise.all([
    listBoardVisits(today, branchId),
    getWaitStats(today, branchId),
    getWaitStats(monthAgo.toISOString().slice(0, 10), branchId),
  ]);
  const scopeLabel = branchId
    ? (branches.find((branch) => branch.id === branchId)?.name ?? "")
    : "All branches";

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Queue
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {scopeLabel} · Updates by itself every 30 seconds.
          </p>
          {policy.canChoose ? (
            <form method="get" className="mt-3 flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                Branch
                <select
                  name="branch"
                  defaultValue={branchId ?? "all"}
                  className="select-chevron rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  {policy.allowedBranchIds === null && (
                    <option value="all">All branches</option>
                  )}
                  {branches
                    .filter(
                      (branch) =>
                        policy.allowedBranchIds === null ||
                        policy.allowedBranchIds.includes(branch.id),
                    )
                    .map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Show
              </button>
            </form>
          ) : (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {policy.branchId
                ? "You see your own clinic's queue. An owner or admin can change your clinics."
                : "No clinic is assigned to your account yet, so you see every clinic and cannot add visits. Ask an owner or admin to assign one."}
            </p>
          )}
        </div>
        <AddTransactionModal
          buttonLabel="Add to Queue"
          title="Add to Queuing"
          description="Check the patient in. Payment and procedures can be added later."
          queueMode
          dentistOptions={dentists.map((dentist) => dentist.name)}
          branches={branches}
          procedures={procedures}
          discountTypes={discountTypes}
        />
      </div>

      <TodayBoard
        visits={visits}
        today={today}
        isAdmin={can(session, "visit.status_override")}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WaitStats title="Average waits today" stats={todayWaits} />
        <WaitStats title="Average waits, last 30 days" stats={monthWaits} />
      </div>
    </div>
  );
}
