import type { Metadata } from "next";
import Link from "next/link";
import { PatientFormModal } from "@/components/cashflow/patient-form-modal";
import { StatusPill } from "@/components/cashflow/status-pill";
import { todayInManila } from "@/lib/cashflow/visit-status";
import {
  PATIENT_FILTERS,
  PATIENT_PAGE_SIZE,
  listPatientsPage,
  parsePatientFilter,
} from "@/lib/db/patient-admin";

export const metadata: Metadata = { title: "Patients" };

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

function buildHref(q: string, filter: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/cashflow/patients${qs ? `?${qs}` : ""}`;
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const raw = await searchParams;
  const q = (raw.q ?? "").trim();
  const filter = parsePatientFilter(raw.filter);
  const pageNumber = Number(raw.page);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const today = todayInManila();

  const { rows, total } = await listPatientsPage({ q, filter, page, today });
  const totalPages = Math.max(1, Math.ceil(total / PATIENT_PAGE_SIZE));
  const filtered = Boolean(q) || filter !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Patients
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {total} {filtered ? "matching" : "on file"}. Open a patient to see
            all of their invoices, balance and visit history.
          </p>
        </div>
        <PatientFormModal buttonLabel="Add patient" />
      </div>

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name or contact number…"
          aria-label="Search patients"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 sm:min-w-[240px] sm:flex-1"
        />
        <select
          name="filter"
          defaultValue={filter}
          aria-label="Filter patients"
          className="select-chevron rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {PATIENT_FILTERS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Search
        </button>
        {filtered && (
          <Link
            href="/cashflow/patients"
            className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Patient</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Last visit</th>
              <th className="px-4 py-3 font-medium">Invoices</th>
              <th className="px-4 py-3 text-right font-medium">Balance due</th>
              <th className="px-4 py-3 font-medium">Open visit</th>
              <th className="px-4 py-3 font-medium">Recall</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  {filtered
                    ? "No patients match these filters."
                    : "No patients yet. They appear here as transactions are recorded."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="text-zinc-700 dark:text-zinc-300">
                  <td className="px-4 py-3">
                    <Link
                      href={`/cashflow/patients/${row.id}`}
                      className="font-medium text-amber-700 hover:underline dark:text-amber-400"
                    >
                      {row.fullName}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.contactNumber || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.lastVisitDate ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.invoiceCount === 0 ? (
                      "—"
                    ) : (
                      <>
                        {row.invoiceCount}{" "}
                        {row.invoiceCount === 1 ? "invoice" : "invoices"}
                        {row.openCount > 0 && (
                          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                            {row.openCount} open
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {row.balanceDue > 0 ? (
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        {currencyFormatter.format(row.balanceDue)}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.openStatus ? (
                      <StatusPill status={row.openStatus} />
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.nextRecall ? (
                      <span
                        className={
                          row.nextRecall <= today
                            ? "font-medium text-amber-700 dark:text-amber-400"
                            : ""
                        }
                      >
                        {row.nextRecall}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      href={`/cashflow/patients/${row.id}`}
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      View invoices
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Patients pages"
          className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400"
        >
          <span>
            Page {Math.min(page, totalPages)} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref(q, filter, page - 1)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref(q, filter, page + 1)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
