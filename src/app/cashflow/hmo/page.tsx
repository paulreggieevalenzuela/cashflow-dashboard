import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { SubmitButton } from "@/components/ui/submit-button";
import { TransactionsTabs } from "@/components/cashflow/transactions-tabs";
import {
  HmoBillingTable,
  pesoFormat,
  shortDate,
} from "@/components/cashflow/hmo-billing-table";
import { formatSheetDate } from "@/lib/cashflow/day-end";
import {
  formatRange,
  rangeProblem,
  summarizeHmoLines,
} from "@/lib/cashflow/hmo-billing";
import { HMO_PAYMENT_TYPES } from "@/lib/cashflow/pricing";
import { todayInManila } from "@/lib/cashflow/visit-status";
import { listBranches } from "@/lib/db/branches";
import { resolveDayEndScope } from "@/lib/db/day-end";
import { getHmoBillingLines, listHmoBillings } from "@/lib/db/hmo-billing";
import { generateHmoBillingAction } from "./actions";

export const metadata: Metadata = { title: "HMO billing" };

type SearchParams = {
  hmo?: string;
  branch?: string;
  from?: string;
  to?: string;
  error?: string;
};

/**
 * HMO billing: pick an HMO, a branch and a cut-off date range, check the
 * rows and their total, then generate a numbered billing that can be
 * downloaded as PDF, Excel or CSV. Saved billings are listed underneath.
 */
export default async function HmoBillingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const raw = await searchParams;
  const today = todayInManila();
  const from = raw.from || `${today.slice(0, 8)}01`;
  const to = raw.to || today;
  const hmo =
    HMO_PAYMENT_TYPES.find(
      (name) => name.toLowerCase() === (raw.hmo ?? "").trim().toLowerCase(),
    ) ?? "";

  const branchList = await listBranches();
  const scope = await resolveDayEndScope({
    userId: session.user.id,
    role: session.user.role,
    requested: raw.branch,
    branchList,
  });
  const isAdmin = session.user.role === "admin";

  const problem = rangeProblem(from, to);
  const allLines = problem
    ? []
    : await getHmoBillingLines({
        from,
        to,
        branchId: scope.branchId,
        hmo: hmo || null,
      });
  const lines = allLines.filter((line) => !line.billedOn);
  const alreadyBilled = allLines.filter((line) => line.billedOn);
  const totals = summarizeHmoLines(lines);
  const billedTotal = summarizeHmoLines(alreadyBilled).total;

  const { billings, tablesMissing } = await listHmoBillings({
    branchId: scope.locked ? scope.branchId : null,
  });

  const branchName =
    branchList.find((branch) => branch.id === scope.branchId)?.name ??
    "All branches";

  let cannotGenerate = "";
  if (problem) cannotGenerate = problem;
  else if (!hmo) cannotGenerate = "Pick one HMO to generate a billing.";
  else if (!scope.branchId) cannotGenerate = "Pick one branch to generate a billing.";
  else if (lines.length === 0) cannotGenerate = "There are no lines to bill.";
  else if (tablesMissing)
    cannotGenerate = "Run scripts/sql/2026-11-hmo-billings.sql first.";

  return (
    <div className="space-y-6">
      <TransactionsTabs active="hmo" />

      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          HMO billing
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Pick the HMO, the branch and the cut-off dates, check the rows, then
          generate a numbered billing to download as PDF, Excel or CSV. Lines
          already on a saved billing are left out.
        </p>
      </div>

      {raw.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {raw.error}
        </p>
      )}

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          HMO
          <select
            name="hmo"
            defaultValue={hmo}
            className="select-chevron rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">All HMOs (preview only)</option>
            {HMO_PAYMENT_TYPES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          Branch
          <select
            name="branch"
            defaultValue={scope.branchId ?? "all"}
            disabled={scope.locked}
            className="select-chevron rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {isAdmin && <option value="all">All branches (preview only)</option>}
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
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          From
          <input
            type="date"
            name="from"
            defaultValue={from}
            max={today}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          To
          <input
            type="date"
            name="to"
            defaultValue={to}
            max={today}
            required
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Preview
        </button>
        {scope.locked && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            You can bill your own branch only.
          </span>
        )}
      </form>

      {problem ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {problem}
        </p>
      ) : (
        <>
          <section aria-labelledby="preview-heading" className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3
                  id="preview-heading"
                  className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  Preview · {hmo || "All HMOs"} · {branchName}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Cut-off {formatRange(from, to)}. Nothing is saved until you
                  press Generate billing.
                </p>
              </div>
              <form action={generateHmoBillingAction} className="flex flex-col items-end gap-1">
                <input type="hidden" name="hmo" value={hmo} />
                <input type="hidden" name="branch" value={scope.branchId ?? ""} />
                <input type="hidden" name="from" value={from} />
                <input type="hidden" name="to" value={to} />
                <SubmitButton disabled={Boolean(cannotGenerate)} pendingLabel="Generating billing…" className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">Generate billing</SubmitButton>
                {cannotGenerate && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {cannotGenerate}
                  </span>
                )}
              </form>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total amount of billing" value={pesoFormat.format(totals.total)} />
              <Stat label="Procedure lines" value={String(totals.lineCount)} />
              <Stat label="Patients" value={String(totals.patientCount)} />
              <Stat
                label="LOA pending"
                value={String(totals.pendingLoaCount)}
                hint="counted in the total"
              />
            </div>

            {alreadyBilled.length > 0 && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {alreadyBilled.length} more line
                {alreadyBilled.length === 1 ? "" : "s"} (
                {pesoFormat.format(billedTotal)}) in this range{" "}
                {alreadyBilled.length === 1 ? "is" : "are"} already on a saved
                billing and {alreadyBilled.length === 1 ? "is" : "are"} left out.
              </p>
            )}

            <HmoBillingTable
              lines={lines}
              total={totals.total}
              showHmo={!hmo}
              emptyText="No HMO lines for this HMO, branch and range."
            />
          </section>
        </>
      )}

      <section aria-labelledby="saved-heading" className="space-y-3">
        <h3
          id="saved-heading"
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
        >
          Saved billings
        </h3>
        {tablesMissing ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            The billing tables are not set up yet. Run{" "}
            <code className="font-mono text-xs">
              scripts/sql/2026-11-hmo-billings.sql
            </code>{" "}
            in the Neon SQL Editor.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-3 font-medium">Billing no.</th>
                  <th className="px-3 py-3 font-medium">HMO</th>
                  <th className="px-3 py-3 font-medium">Branch</th>
                  <th className="px-3 py-3 font-medium">Cut-off</th>
                  <th className="px-3 py-3 text-right font-medium">Lines</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 font-medium">Made</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                {billings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                    >
                      No billings yet.
                    </td>
                  </tr>
                ) : (
                  billings.map((billing) => (
                    <tr
                      key={billing.id}
                      className={billing.status === "Void" ? "text-zinc-400" : ""}
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                        <Link
                          href={`/cashflow/hmo/${billing.id}`}
                          className="text-amber-700 hover:underline dark:text-amber-400"
                        >
                          {billing.billingNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">{billing.hmo}</td>
                      <td className="px-3 py-2.5">{billing.branchName}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {formatRange(billing.periodFrom, billing.periodTo)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {billing.lineCount}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                        {pesoFormat.format(billing.totalAmount)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {shortDate(billing.createdAt.slice(0, 10))}
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {" "}
                          · {billing.createdByName || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{billing.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Billings made on {formatSheetDate(today, true)} or earlier. Open one to
          download it.
        </p>
      </section>
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
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      )}
    </div>
  );
}
