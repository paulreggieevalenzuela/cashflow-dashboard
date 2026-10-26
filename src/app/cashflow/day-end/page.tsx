import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TransactionsTabs } from "@/components/cashflow/transactions-tabs";
import {
  DAY_END_HEADERS,
  dayEndFileName,
  formatSheetDate,
  isValidIsoDate,
  summarizeDayEnd,
  summarizeHmo,
} from "@/lib/cashflow/day-end";
import { isHmoPayment } from "@/lib/cashflow/pricing";
import { todayInManila } from "@/lib/cashflow/visit-status";
import { listBranches } from "@/lib/db/branches";
import { getDayEndReport, resolveDayEndScope } from "@/lib/db/day-end";

export const metadata: Metadata = { title: "Day end" };

const money = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

/**
 * End-of-day report: what each branch received on a day, laid out like the
 * clinic's own "Day End" sheet, with the breakdown by payment method and
 * the totals. Excel and CSV downloads are named ADT_EOD_<branch>_<date>.
 */
export default async function DayEndPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; branch?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const raw = await searchParams;
  const date = isValidIsoDate(raw.date) ? raw.date : todayInManila();
  const branchList = await listBranches();
  const scope = await resolveDayEndScope({
    userId: session.user.id,
    role: session.user.role,
    requested: raw.branch,
    branchList,
  });
  const report = await getDayEndReport({ branchId: scope.branchId, date });
  const { breakdown, totals } = summarizeDayEnd(report);
  const hmoSummary = summarizeHmo(report.hmoVisits);
  const isAdmin = session.user.role === "admin";

  const query = new URLSearchParams({
    date,
    branch: scope.branchId ?? "all",
  });
  const fileName = dayEndFileName(report.branchName, date);

  return (
    <div className="space-y-6">
      <TransactionsTabs active="dayend" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Day end report · {report.branchName} · {formatSheetDate(date, true)}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Every payment received on the day, by payment method. Visits of
            the day with no payment are listed with 0.00.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/cashflow/day-end?${query.toString()}&format=xlsx`}
            download={`${fileName}.xlsx`}
            className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Download Excel
          </a>
          <a
            href={`/api/cashflow/day-end?${query.toString()}&format=csv`}
            download={`${fileName}.csv`}
            className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Download CSV
          </a>
        </div>
      </div>

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center"
      >
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          Date
          <input
            type="date"
            name="date"
            defaultValue={date}
            max={todayInManila()}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          Branch
          <select
            name="branch"
            defaultValue={scope.branchId ?? "all"}
            disabled={scope.locked}
            className="select-chevron rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {isAdmin && <option value="all">All branches</option>}
            {branchList.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        {scope.locked && (
          <input type="hidden" name="branch" value={scope.branchId ?? ""} />
        )}
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Show
        </button>
        {scope.locked && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            You can see your own branch only.
          </span>
        )}
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total collected" value={money.format(totals.collected)} />
        <Stat
          label="Net collection"
          value={money.format(totals.netCollection)}
          hint={`after ${money.format(totals.merchantFees)} card fees and ${money.format(totals.withholdingTax)} tax`}
        />
        <Stat
          label="Paid through HMO"
          value={money.format(totals.hmo)}
          hint="billed to the HMO, included in the total"
        />
        <Stat
          label="Reservation fees"
          value={money.format(totals.reservationFees)}
          hint="included in the total"
        />
      </div>

      <section
        aria-labelledby="hmo-summary-heading"
        className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3
              id="hmo-summary-heading"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              HMO summary
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              The day&rsquo;s visits billed to an HMO, whether or not the HMO
              has paid yet.
            </p>
          </div>
          <p className="text-sm text-zinc-900 dark:text-zinc-50">
            <span className="font-semibold">Total billed to HMOs</span>{" "}
            <span className="tabular-nums">
              {money.format(hmoSummary.total.billed)}
            </span>
          </p>
        </div>
        {hmoSummary.lines.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            No HMO visits on this day.
          </p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">HMO</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Patients
                    </th>
                    <th className="px-3 py-2 text-right font-medium">Visits</th>
                    <th className="px-3 py-2 text-right font-medium">Billed</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Received
                    </th>
                    <th className="py-2 pl-3 text-right font-medium">
                      To collect
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {hmoSummary.rows.map((row) => (
                    <tr key={row.hmo}>
                      <td className="py-2 pr-3">{row.hmo}</td>
                      <HmoNumber value={row.patients} />
                      <HmoNumber value={row.visits} />
                      <HmoMoney value={row.billed} />
                      <HmoMoney value={row.received} />
                      <HmoMoney value={row.toCollect} last />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-300 font-semibold dark:border-zinc-700">
                    <td className="py-2 pr-3">Total</td>
                    <HmoNumber value={hmoSummary.total.patients} />
                    <HmoNumber value={hmoSummary.total.visits} />
                    <HmoMoney value={hmoSummary.total.billed} />
                    <HmoMoney value={hmoSummary.total.received} />
                    <HmoMoney value={hmoSummary.total.toCollect} last />
                  </tr>
                </tfoot>
              </table>
            </div>

            <h4 className="mt-5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Patients billed to HMOs
            </h4>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">HMO</th>
                    <th className="px-3 py-2 font-medium">Patient</th>
                    <th className="px-3 py-2 font-medium">Account no.</th>
                    <th className="px-3 py-2 font-medium">LOA no.</th>
                    <th className="px-3 py-2 font-medium">Procedure</th>
                    <th className="px-3 py-2 text-right font-medium">Billed</th>
                    <th className="py-2 pl-3 text-right font-medium">
                      Received
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {hmoSummary.lines.map((visit, index) => (
                    <tr key={`${visit.hmo}-${visit.patientName}-${index}`}>
                      <td className="whitespace-nowrap py-2 pr-3">
                        {visit.hmo}
                      </td>
                      <td className="px-3 py-2">{visit.patientName}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {visit.hmoAccountNumber || (
                          <span className="font-sans text-zinc-400">
                            Not on file
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {visit.loaNumber || (
                          <span className="font-sans text-orange-600 dark:text-orange-400">
                            LOA pending
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{visit.procedure}</td>
                      <HmoMoney value={visit.billed} />
                      <HmoMoney value={visit.received} last />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              {DAY_END_HEADERS.filter((name) => name !== "Date").map((name) => (
                <th
                  key={name}
                  className={`px-3 py-3 font-medium ${
                    [
                      "Amount Paid",
                      "Vat Exclusive",
                      "Vat Amount",
                      "Merchant Fee",
                      "Withholding Tax",
                      "Net Collection",
                    ].includes(name)
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
            {report.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={DAY_END_HEADERS.length - 1}
                  className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400"
                >
                  No payments or visits recorded for this day.
                </td>
              </tr>
            ) : (
              report.rows.map((row, index) => (
                <tr
                  key={`${row.visitId}-${index}`}
                  className={row.kind === "unpaid" ? "text-zinc-500" : ""}
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                    {row.visitId}
                  </td>
                  <td className="px-3 py-2.5">{row.patientName}</td>
                  <td className="px-3 py-2.5">{row.dentist || "—"}</td>
                  <td className="px-3 py-2.5">{row.procedure}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {row.paymentType || "—"}
                    {isHmoPayment(row.paymentType) && (
                      <span className="ml-1.5 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                        HMO
                      </span>
                    )}
                  </td>
                  <Money value={row.amountPaid} />
                  <Money value={row.vatExclusive} />
                  <Money value={row.vatAmount} />
                  <td className="px-3 py-2.5">{row.invoiceNumber || "—"}</td>
                  <td className="px-3 py-2.5">
                    {row.kind === "unpaid"
                      ? row.remarks || "No payment recorded"
                      : row.remarks || "—"}
                  </td>
                  <Money value={row.merchantFee} />
                  <Money value={row.withholdingTax} />
                  <Money value={row.netCollection} />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Breakdown by payment method
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 lg:grid-cols-7">
          {breakdown.map((item) => (
            <div key={item.label}>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                {item.label}
              </dt>
              <dd className="tabular-nums text-zinc-900 dark:text-zinc-50">
                {money.format(item.amount)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-zinc-900 dark:text-zinc-50">
          <span className="font-semibold">Total collected</span>{" "}
          <span className="tabular-nums">{money.format(totals.collected)}</span>
        </p>
      </section>

      {report.expenses.length > 0 && (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Expenses recorded this day
          </h3>
          <ul className="mt-3 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {report.expenses.map((expense, index) => (
              <li key={index} className="flex justify-between gap-4 py-2">
                <span>
                  {expense.category}
                  {expense.description ? ` — ${expense.description}` : ""}
                  {expense.paymentMethod ? ` (${expense.paymentMethod})` : ""}
                </span>
                <span className="tabular-nums">
                  {money.format(expense.amount)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Total expenses{" "}
            <span className="tabular-nums">{money.format(totals.expenses)}</span>
          </p>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  );
}

function Money({ value }: { value: number }) {
  return (
    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
      {value === 0 ? <span className="text-zinc-400">—</span> : money.format(value)}
    </td>
  );
}

function HmoNumber({ value }: { value: number }) {
  return <td className="px-3 py-2 text-right tabular-nums">{value}</td>;
}

function HmoMoney({ value, last }: { value: number; last?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap py-2 text-right tabular-nums ${
        last ? "pl-3" : "px-3"
      }`}
    >
      {value === 0 ? <span className="text-zinc-400">—</span> : money.format(value)}
    </td>
  );
}
