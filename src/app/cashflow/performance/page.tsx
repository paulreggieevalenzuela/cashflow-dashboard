import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DentistFilter } from "@/components/cashflow/performance/dentist-filter";
import { DentistPatientsTable } from "@/components/cashflow/performance/dentist-patients-table";
import { LeaderboardTable } from "@/components/cashflow/performance/leaderboard-table";
import { ProcedureBreakdownTable } from "@/components/cashflow/performance/procedure-breakdown-table";
import { SalesBreakdown } from "@/components/cashflow/performance/sales-breakdown";
import { StaffFilter } from "@/components/cashflow/performance/staff-filter";
import { StaffLeaderboardTable } from "@/components/cashflow/performance/staff-leaderboard-table";
import { listDentistUsers, listStaffUsers } from "@/lib/db/dentists";
import {
  getDentistLeaderboard,
  getDentistPatients,
  getDentistProcedureBreakdown,
  getSalesByPeriod,
  getStaffBonusByPeriod,
  getStaffBonusLeaderboard,
} from "@/lib/db/transactions";

export const metadata: Metadata = {
  title: "Performance",
};

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ dentist?: string; staff?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = session.user.role === "admin";
  const isDentist = session.user.role === "dentist";
  const isStaff = session.user.role === "staff";
  const resolvedSearchParams = await searchParams;

  // Dentist priority/commission and staff bonus are two separate, unranked
  // views for anyone but an admin — a dentist only ever sees their own
  // numbers (never a ranked comparison against colleagues), and likewise
  // for staff. Neither role sees the other's section.
  const selectedDentistId = isAdmin
    ? resolvedSearchParams.dentist || undefined
    : isDentist
      ? session.user.id
      : undefined;
  const selectedStaffId = isAdmin
    ? resolvedSearchParams.staff || undefined
    : isStaff
      ? session.user.id
      : undefined;

  const showDentistSection = isAdmin || isDentist;
  const showStaffSection = isAdmin || isStaff;

  const [
    dentists,
    staffUsers,
    leaderboard,
    staffLeaderboard,
    monthly,
    quarterly,
    annual,
    procedureBreakdown,
    patients,
    staffMonthly,
    staffQuarterly,
    staffAnnual,
  ] = await Promise.all([
    isAdmin ? listDentistUsers() : Promise.resolve([]),
    isAdmin ? listStaffUsers() : Promise.resolve([]),
    isAdmin ? getDentistLeaderboard({}) : Promise.resolve([]),
    isAdmin ? getStaffBonusLeaderboard() : Promise.resolve([]),
    showDentistSection
      ? getSalesByPeriod({ dentistUserId: selectedDentistId, granularity: "month" })
      : Promise.resolve([]),
    showDentistSection
      ? getSalesByPeriod({ dentistUserId: selectedDentistId, granularity: "quarter" })
      : Promise.resolve([]),
    showDentistSection
      ? getSalesByPeriod({ dentistUserId: selectedDentistId, granularity: "year" })
      : Promise.resolve([]),
    // Per-procedure/per-patient breakdowns only make sense for one dentist
    // at a time — skipped on the clinic-wide leaderboard view (admin with
    // no dentist picked yet).
    selectedDentistId ? getDentistProcedureBreakdown(selectedDentistId) : Promise.resolve([]),
    selectedDentistId ? getDentistPatients(selectedDentistId) : Promise.resolve([]),
    selectedStaffId
      ? getStaffBonusByPeriod({ staffUserId: selectedStaffId, granularity: "month" })
      : Promise.resolve([]),
    selectedStaffId
      ? getStaffBonusByPeriod({ staffUserId: selectedStaffId, granularity: "quarter" })
      : Promise.resolve([]),
    selectedStaffId
      ? getStaffBonusByPeriod({ staffUserId: selectedStaffId, granularity: "year" })
      : Promise.resolve([]),
  ]);

  const hasAnyCommission =
    leaderboard.some((row) => row.commissionAmount > 0) ||
    monthly.some((row) => row.commissionAmount > 0);
  const hasAnyBonus =
    staffLeaderboard.some((row) => row.bonusAmount > 0) ||
    staffMonthly.some((row) => row.commissionAmount > 0);

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Performance</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {isAdmin
            ? "Dentist priority and staff bonus, based on transactions linked to each account."
            : isDentist
              ? "Your sales and commission, based on transactions linked to your account."
              : "Your bonus, based on transactions you recorded that have a bonus rate set."}
        </p>
      </div>

      {showDentistSection && (
        <div className="space-y-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            {isAdmin ? "Dentist performance" : "My performance"}
          </h3>

          {isAdmin && (
            <div>
              <h4 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Leaderboard
              </h4>
              <LeaderboardTable rows={leaderboard} />
            </div>
          )}

          <div>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {isAdmin ? "Sales over time" : "Your sales over time"}
              </h4>
              {isAdmin && (
                <DentistFilter dentists={dentists} selectedDentistId={selectedDentistId} />
              )}
            </div>
            <SalesBreakdown
              monthly={monthly}
              quarterly={quarterly}
              annual={annual}
              showCommission={hasAnyCommission}
            />
          </div>

          {selectedDentistId && (
            <>
              <div>
                <h4 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {isAdmin ? "Procedures performed" : "Your procedures"}
                </h4>
                <ProcedureBreakdownTable rows={procedureBreakdown} />
              </div>

              <div>
                <h4 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {isAdmin ? "Patients seen" : "Your patients"}
                </h4>
                <DentistPatientsTable rows={patients} />
              </div>
            </>
          )}
        </div>
      )}

      {showStaffSection && (
        <div className="space-y-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
            {isAdmin ? "Staff performance" : "My bonus"}
          </h3>

          {isAdmin && (
            <div>
              <h4 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Bonus leaderboard
              </h4>
              <StaffLeaderboardTable rows={staffLeaderboard} />
            </div>
          )}

          <div>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {isAdmin ? "Bonus over time" : "Your bonus over time"}
              </h4>
              {isAdmin && <StaffFilter staff={staffUsers} selectedStaffId={selectedStaffId} />}
            </div>
            <SalesBreakdown
              monthly={staffMonthly}
              quarterly={staffQuarterly}
              annual={staffAnnual}
              showCommission={hasAnyBonus}
              commissionLabel="Bonus"
            />
          </div>
        </div>
      )}
    </div>
  );
}
