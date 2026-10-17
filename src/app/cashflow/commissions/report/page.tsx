import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  COMMISSION_HEADERS,
  commissionFileName,
  effectivePercent,
  formatSheetDateRange,
  parseCommissionFilters,
  summarizeCommission,
} from "@/lib/cashflow/commission-report";
import { formatSheetDate } from "@/lib/cashflow/day-end";
import { isHmoPayment } from "@/lib/cashflow/pricing";
import { todayInManila } from "@/lib/cashflow/visit-status";
import { listBranches } from "@/lib/db/branches";
import { getCommissionReport } from "@/lib/db/commission-report";
import { listDentistUsers } from "@/lib/db/dentists";

export const metadata: Metadata = { title: "Commission report" };

const money = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

/** Lines shown on screen; the downloads always hold every line. */
const SCREEN_LIMIT = 500;

/**
 * What each dentist earned in a period, line by line, with Excel and CSV
 * downloads. Admin only.
 */
export default async function CommissionReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    branch?: string;
    dentist?: string;
  }>;
}) {
  const session = await auth();
  if (session?.user.role !== "admin") {
    redirect("/cashflow");
  }
  const raw = await searchParams;
  const [branchList, dentistList] = await Promise.all([
    listBranches(),
    listDentistUsers(),
  ]);
  const filters = parseCommissionFilters(raw, {
    today: todayInManila(),
    branches: branchList,
    dentists: dentistList,
  });
  const report = await getCommissionReport(filters);
  const { perDentist, totals } = summarizeCommission(report.rows);

  const query = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    branch: filters.branchId ?? "",
    dentist: filters.dentistUserId ?? "",
  });
  const fileName = commissionFileName(filters.from, filters.to);
  const shown = report.rows.slice(0, SCREEN_LIMIT);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/cashflow/commissions"
            className="text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400"
          >
            ← Commission &amp; bonus rates
          </Link>
          <h2 className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Dentist commission report · {filters.dentistLabel} ·{" "}
            {filters.branchName}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {formatSheetDateRange(filters.from, filters.to)}. Commission is the
            amount saved with each procedure when it was recorded, so a later
            rate change doesn&apos;t rewrite past periods. Staff bonuses are
            on the Performance page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/cashflow/commissions/report?${query.toString()}&format=xlsx`}
            download={`${fileName}.xlsx`}
            className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Download Excel
          </a>
          <a
            href={`/api/cashflow/commissions/report?${query.toString()}&format=csv`}
            download={`${fileName}.csv`}
            className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Download CSV
          </a>
        </div>
      </div>

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          From
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          To
          <input
            type="date"
            name="to"
            defaultValue={filters.to}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <select
          name="dentist"
          defaultValue={filters.dentistUserId ?? ""}
          aria-label="Dentist"
          className="select-chevron rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="">All dentists</option>
          {dentistList.map((dentist) => (
            <option key={dentist.id} value={dentist.id}>
              {dentist.name}
            </option>
          ))}
        </select>
        <select
          name="branch"
          defaultValue={filters.branchId ?? ""}
          aria-label="Branch"
          className="select-chevron rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="">All branches</option>
          {branchList.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Show
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Dentist</th>
              <th className="px-4 py-3 text-right font-medium">Procedures</th>
              <th className="px-4 py-3 text-right font-medium">
                Net collection
              </th>
              <th className="px-4 py-3 text-right font-medium">Commission</th>
              <th className="px-4 py-3 font-medium">Check</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {perDentist.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400"
                >
                  No procedures in this period.
                </td>
              </tr>
            ) : (
              perDentist.map((item) => (
                <tr key={item.dentist}>
                  <td className="px-4 py-3 font-medium">{item.dentist}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.lines}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {money.format(item.netCollection)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {money.format(item.commission)}
                  </td>
                  <td className="px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                    {item.linesWithoutCommission > 0
                      ? `${item.linesWithoutCommission} with money collected but no commission (no rate set)`
                      : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {perDentist.length > 0 && (
            <tfoot className="bg-zinc-50 font-semibold dark:bg-zinc-900">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {totals.lines}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {money.format(totals.netCollection)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {money.format(totals.commission)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {report.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                {COMMISSION_HEADERS.map((name) => (
                  <th
                    key={name}
                    className={`px-3 py-3 font-medium ${
                      name === "Net Collection" || name === "Commission"
                        ? "text-right"
                        : ""
                    }`}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {shown.map((row, index) => (
                <tr key={`${row.visitId}-${index}`}>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {formatSheetDate(row.date)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                    {row.visitId}
                  </td>
                  <td className="px-3 py-2.5">{row.patientName}</td>
                  <td className="px-3 py-2.5">{row.dentist}</td>
                  <td className="px-3 py-2.5">{row.branchName || "—"}</td>
                  <td className="px-3 py-2.5">{row.procedure}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {row.paymentType || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {money.format(row.netCollection)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {money.format(row.commission)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {effectivePercent(row) || "—"}
                    {isHmoPayment(row.paymentType) &&
                      row.commission !== 0 &&
                      " (HMO)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.rows.length > shown.length && (
            <p className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              Showing the first {shown.length} of {report.rows.length} lines.
              The downloads include all of them.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
