import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { can } from "@/lib/auth/guards";
import { CommissionTiersManager } from "@/components/cashflow/commission-tiers-manager";
import { PersonRateGrid } from "@/components/cashflow/commission-rate-grids";
import { listCommissionRates } from "@/lib/db/commission-rates";
import { listDentistTiers, listTierRates } from "@/lib/db/commission-tiers";
import { listCommissionEligibleUsers } from "@/lib/db/dentists";
import { listProcedures } from "@/lib/db/procedures";

export const metadata: Metadata = {
  title: "Commissions",
};

export default async function CommissionsPage() {
  const session = await auth();

  if (!can(session, "commission.manage")) {
    redirect("/cashflow");
  }

  const [dentists, procedures, rates, tierRates, dentistTiers] =
    await Promise.all([
      listCommissionEligibleUsers(),
      listProcedures(),
      listCommissionRates(),
      listTierRates(),
      listDentistTiers(),
    ]);
  const tieredIds = new Set(dentistTiers.map((entry) => entry.dentistUserId));
  const overrideCount = rates.filter((rate) =>
    tieredIds.has(rate.dentistUserId),
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/cashflow/commissions/report"
          className="float-right ml-4 rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Commission report
        </Link>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Commission &amp; bonus rates
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Dentist commission is set by <strong>tier</strong>: put each dentist
          in a tier, and every procedure earns the tier&apos;s rate. A new
          procedure only needs to be added to a tier once. Visits paid through
          an HMO (Maxicare, Medicard, Intellicare, Avega, Valucare, Elite
          Dental Network) use the HMO columns, and an HMO visit for a
          procedure with no HMO rate earns no commission. A rate applies to
          transactions saved after it is set. When a patient is transferred
          to a second dentist on a visit, the commission is worked out at the
          main dentist&apos;s rate and split 50% / 50% between the two.
        </p>
      </div>
      <CommissionTiersManager
        dentists={dentists}
        dentistTiers={dentistTiers}
        procedures={procedures}
        tierRates={tierRates}
        overrideCount={overrideCount}
      />
      <PersonRateGrid
        people={dentists}
        procedures={procedures}
        rates={rates}
        tierRates={tierRates}
        dentistTiers={dentistTiers}
      />
    </div>
  );
}
