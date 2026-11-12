import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { LOA_PENDING_TEXT, formatRange } from "@/lib/cashflow/hmo-billing";
import { pesoFormat, shortDate } from "@/components/cashflow/hmo-billing-table";
import { listBranches } from "@/lib/db/branches";
import { resolveDayEndScope, scopeCoversBranch } from "@/lib/db/day-end";
import { getHmoBilling } from "@/lib/db/hmo-billing";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "HMO billing – print" };

/**
 * Print-ready billing page. "Print / Save as PDF" opens the browser's print
 * dialog; choosing "Save as PDF" there gives the PDF. The cashflow header and
 * footer are hidden when printing.
 */
export default async function HmoBillingPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const saved = await getHmoBilling(id);
  if (!saved) notFound();
  const { billing, lines } = saved;

  {
    const scope = await resolveDayEndScope({
      userId: session.user.id,
      role: session.user.role,
      branchId: session.user.branchId,
      branchIds: session.user.branchIds,
      requested: saved.branchId ?? undefined,
      branchList: await listBranches(),
    });
    if (!scopeCoversBranch(scope, saved.branchId)) notFound();
  }

  const isVoid = billing.status === "Void";

  return (
    <div className="hmo-print mx-auto max-w-[1000px] bg-white p-6 text-zinc-900 print:max-w-none print:p-0">
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        @media print {
          body { background: #fff !important; }
          .hmo-print { color: #000; }
          .hmo-print tr { break-inside: avoid; }
          .hmo-print thead { display: table-header-group; }
        }
      `}</style>

      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/cashflow/hmo/${billing.id}`}
          className="text-sm text-amber-700 hover:underline"
        >
          ← Back to billing
        </Link>
        <PrintButton />
      </div>

      <header className="mb-4 border-b border-zinc-300 pb-3">
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          ADT Dental Clinic
        </p>
        <h1 className="text-xl font-semibold">
          HMO Billing{" "}
          {isVoid && <span className="text-red-700">(VOID)</span>}
        </h1>
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
          <Item label="Billing number" value={billing.billingNumber} mono />
          <Item label="HMO" value={billing.hmo} />
          <Item label="Branch" value={billing.branchName} />
          <Item
            label="Cut-off date"
            value={formatRange(billing.periodFrom, billing.periodTo)}
          />
        </dl>
        <p className="mt-3 text-base">
          Total amount of billing:{" "}
          <strong className="tabular-nums">
            {pesoFormat.format(billing.totalAmount)}
          </strong>{" "}
          <span className="text-xs text-zinc-500">
            ({billing.lineCount} line{billing.lineCount === 1 ? "" : "s"},{" "}
            {billing.patientCount} patient
            {billing.patientCount === 1 ? "" : "s"})
          </span>
        </p>
      </header>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-zinc-400 text-left">
            {[
              "No.",
              "Visit date",
              "Patient",
              "Patient's company",
              "HMO account #",
              "LOA #",
              "LOE #",
              "Procedure",
              "Tooth #",
            ].map((heading) => (
              <th key={heading} className="px-1.5 py-1.5 font-semibold">
                {heading}
              </th>
            ))}
            <th className="px-1.5 py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.transactionId} className="border-b border-zinc-200">
              <td className="px-1.5 py-1 tabular-nums">{index + 1}</td>
              <td className="whitespace-nowrap px-1.5 py-1">
                {shortDate(line.visitDate)}
              </td>
              <td className="px-1.5 py-1">{line.patientName}</td>
              <td className="px-1.5 py-1">{line.hmoEmployer || "—"}</td>
              <td className="px-1.5 py-1">{line.hmoAccountNumber || "—"}</td>
              <td className="px-1.5 py-1">
                {line.loaNumber.trim() || LOA_PENDING_TEXT}
              </td>
              <td className="px-1.5 py-1">{line.loeNumber || "—"}</td>
              <td className="px-1.5 py-1">{line.procedure}</td>
              <td className="px-1.5 py-1">{line.teeth || "—"}</td>
              <td className="whitespace-nowrap px-1.5 py-1 text-right tabular-nums">
                {pesoFormat.format(line.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-zinc-500 font-semibold">
            <td colSpan={9} className="px-1.5 py-1.5 text-right">
              Total
            </td>
            <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums">
              {pesoFormat.format(billing.totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-4 text-xs text-zinc-500">
        Made {shortDate(billing.createdAt.slice(0, 10))} by{" "}
        {billing.createdByName || "—"}.
        {billing.pendingLoaCount > 0 &&
          ` ${billing.pendingLoaCount} line${billing.pendingLoaCount === 1 ? "" : "s"} still waiting for an LOA.`}
      </p>
    </div>
  );
}

function Item({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={mono ? "font-mono font-medium" : "font-medium"}>{value}</dd>
    </div>
  );
}
