import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { can } from "@/lib/auth/guards";
import { AuditTrail } from "@/components/cashflow/audit-trail";
import { TransactionsPagination } from "@/components/cashflow/transactions-pagination";
import { listAuditPage, type AuditGroup } from "@/lib/db/audit";
import { parsePage, parsePageSize } from "@/lib/cashflow/pagination";

export const metadata: Metadata = { title: "Audit trail" };

const GROUPS: ReadonlyArray<{ key: AuditGroup | undefined; label: string }> = [
  { key: undefined, label: "Everything" },
  { key: "visit", label: "Visits" },
  { key: "payment", label: "Payments" },
  { key: "status", label: "Status" },
  { key: "patient", label: "Patients" },
  { key: "commission", label: "Commissions" },
];

const MAX_SEARCH = 100;

function hrefFor(group: AuditGroup | undefined, q: string): string {
  const params = new URLSearchParams();
  if (group) params.set("group", group);
  if (q) params.set("q", q);
  const query = params.toString();
  return `/cashflow/audit${query ? `?${query}` : ""}`;
}

/**
 * Who created, edited or removed what, and when. Opened from the profile
 * menu. Only people with the "audit.view" privilege can open it. Paged, with
 * a search and a filter per kind of change.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; q?: string; page?: string; pageSize?: string }>;
}) {
  const session = await auth();
  if (!can(session, "audit.view")) {
    redirect("/cashflow");
  }
  const params = await searchParams;
  const group = GROUPS.find((option) => option.key && option.key === params.group)?.key;
  const q = (params.q ?? "").trim().slice(0, MAX_SEARCH);
  const pageSize = parsePageSize(params.pageSize);
  const requestedPage = parsePage(params.page);

  let { entries, total } = await listAuditPage({ group, q, page: requestedPage, pageSize });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  let page = requestedPage;
  if (requestedPage > totalPages && total > 0) {
    // A page past the end (the list got shorter): show the last one.
    page = totalPages;
    ({ entries, total } = await listAuditPage({ group, q, page, pageSize }));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Audit trail
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Who created, edited or removed what, and when, newest first. Open a
          visit or patient to see its own trail.
        </p>
      </div>

      <form
        action="/cashflow/audit"
        method="get"
        role="search"
        className="flex flex-wrap items-center gap-2"
      >
        {group && <input type="hidden" name="group" value={group} />}
        <input type="hidden" name="pageSize" value={pageSize} />
        <label htmlFor="audit-search" className="sr-only">
          Search the audit trail
        </label>
        <input
          id="audit-search"
          type="search"
          name="q"
          defaultValue={q}
          maxLength={MAX_SEARCH}
          placeholder="Search by person, patient, procedure, dentist…"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40 sm:max-w-md"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Search
        </button>
        {q && (
          <a
            href={hrefFor(group, "")}
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Clear
          </a>
        )}
      </form>

      <div className="flex flex-wrap gap-2">
        {GROUPS.map((option) => (
          <a
            key={option.label}
            href={hrefFor(option.key, q)}
            aria-current={option.key === group ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              option.key === group
                ? "border-amber-600 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {option.label}
          </a>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white px-5 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {q ? `Nothing matches “${q}”.` : "Nothing recorded yet."}
          </p>
        ) : (
          <AuditTrail entries={entries} showLinks />
        )}
      </div>

      <TransactionsPagination
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
}
