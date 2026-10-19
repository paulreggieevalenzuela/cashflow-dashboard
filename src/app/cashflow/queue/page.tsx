import type { Metadata } from "next";
import { auth } from "@/auth";
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
export default async function QueuePage() {
  const today = todayInManila();
  const monthAgo = new Date(`${today}T00:00:00Z`);
  monthAgo.setUTCDate(monthAgo.getUTCDate() - 30);

  const [
    session,
    visits,
    todayWaits,
    monthWaits,
    dentists,
    branches,
    procedures,
    discountTypes,
  ] = await Promise.all([
    auth(),
    listBoardVisits(today),
    getWaitStats(today),
    getWaitStats(monthAgo.toISOString().slice(0, 10)),
    listDentistUsers(),
    listBranches(),
    listProcedureOptions(),
    listActiveDiscountTypes(),
  ]);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={30} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Queue
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Updates by itself every 30 seconds.
          </p>
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
        isAdmin={session?.user.role === "admin"}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WaitStats title="Average waits today" stats={todayWaits} />
        <WaitStats title="Average waits, last 30 days" stats={monthWaits} />
      </div>
    </div>
  );
}
