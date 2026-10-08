import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CommissionRatesManager } from "@/components/cashflow/commission-rates-manager";
import { listCommissionRates } from "@/lib/db/commission-rates";
import { listCommissionEligibleUsers } from "@/lib/db/dentists";
import { listProcedures } from "@/lib/db/procedures";

export const metadata: Metadata = {
  title: "Commissions",
};

export default async function CommissionsPage() {
  const session = await auth();

  if (session?.user.role !== "admin") {
    redirect("/cashflow");
  }

  const [dentists, procedures, rates] = await Promise.all([
    listCommissionEligibleUsers(),
    listProcedures(),
    listCommissionRates(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Commission &amp; bonus rates
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Set what percentage of net collection each dentist or staff member
          earns per procedure. For a dentist this is their commission (linked to
          transactions performed by them); for staff it&apos;s a bonus (linked
          to transactions they recorded). A dentist&apos;s rate applies to
          transactions saved after it&apos;s set &mdash; a staff bonus is
          computed live, so changing their rate updates past periods too. Visits
          paid through an HMO (Maxicare, Medicard, Intellicare, Avega, Valucare,
          Elite Dental Network) use the HMO column instead: a percentage (e.g.
          OP) or a fixed peso value per procedure (X-rays). An HMO visit for a
          procedure with no HMO rate earns no commission.
        </p>
      </div>
      <CommissionRatesManager
        dentists={dentists}
        procedures={procedures}
        rates={rates}
      />
    </div>
  );
}
