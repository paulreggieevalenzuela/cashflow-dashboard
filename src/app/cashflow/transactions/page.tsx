import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ExpensesTab } from "@/components/cashflow/expenses-tab";
import { ProceduresManager } from "@/components/cashflow/procedures-manager";
import { RecallsList } from "@/components/cashflow/recalls-list";
import { TransactionsList } from "@/components/cashflow/transactions-list";
import {
  TransactionsTabs,
  type TransactionsTab,
} from "@/components/cashflow/transactions-tabs";
import { listExpenseAttachments } from "@/lib/db/attachments";
import { listBranches } from "@/lib/db/branches";
import { listExpenses } from "@/lib/db/expenses";
import { listSuppliers } from "@/lib/db/suppliers";
import { listDentistUsers } from "@/lib/db/dentists";
import { getInvoiceSummaries } from "@/lib/db/invoices";
import { listProcedureAdminRows } from "@/lib/db/procedure-admin";
import { listActiveDiscountTypes } from "@/lib/db/discount-types";
import { listProcedureOptions } from "@/lib/db/procedures";
import { listPendingRecalls } from "@/lib/db/recalls";
import { listTransactionsPage } from "@/lib/db/transactions";
import { AuditTrail } from "@/components/cashflow/audit-trail";
import { listRecentAudit } from "@/lib/db/audit";
import {
  buildTransactionsSearch,
  parseTransactionsQuery,
} from "@/lib/cashflow/transactions-query";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    pageSize?: string;
    q?: string;
    type?: string;
    payment?: string;
    dentist?: string;
    group?: string;
    from?: string;
    to?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;

  // The queue now has its own page (and menu item); keep old links working.
  if (resolvedSearchParams.tab === "today") {
    redirect("/cashflow/queue");
  }

  const tab: TransactionsTab =
    resolvedSearchParams.tab === "audit" ||
    resolvedSearchParams.tab === "expenses" ||
    resolvedSearchParams.tab === "procedures" ||
    resolvedSearchParams.tab === "recalls"
      ? resolvedSearchParams.tab
      : "transactions";

  if (tab === "audit") {
    const session = await auth();
    if (session?.user.role !== "admin") {
      redirect("/cashflow/transactions");
    }
    const group =
      resolvedSearchParams.group === "visit" ||
      resolvedSearchParams.group === "payment" ||
      resolvedSearchParams.group === "status" ||
      resolvedSearchParams.group === "patient"
        ? resolvedSearchParams.group
        : undefined;
    const entries = await listRecentAudit({ group, limit: 200 });
    const groups = [
      { key: undefined, label: "Everything" },
      { key: "visit", label: "Visits" },
      { key: "payment", label: "Payments" },
      { key: "status", label: "Status" },
      { key: "patient", label: "Patients" },
    ] as const;
    return (
      <div className="space-y-6">
        <TransactionsTabs active="audit" />
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Audit trail
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Who created, edited or removed what, and when. The latest 200
              entries; open a visit or patient to see its own trail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {groups.map((option) => (
              <a
                key={option.label}
                href={`/cashflow/transactions?tab=audit${option.key ? `&group=${option.key}` : ""}`}
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
            <AuditTrail entries={entries} showLinks />
          </div>
        </div>
      </div>
    );
  }

  if (tab === "expenses") {
    const [session, expenses, suppliers, branches, files] = await Promise.all([
      auth(),
      listExpenses(),
      listSuppliers(),
      listBranches(),
      listExpenseAttachments(),
    ]);
    return (
      <div className="space-y-6">
        <TransactionsTabs active="expenses" />
        <ExpensesTab
          expenses={expenses}
          suppliers={suppliers}
          branches={branches}
          files={files}
          canDelete={session?.user.role === "admin"}
          filters={{
            q: resolvedSearchParams.q ?? "",
            from: resolvedSearchParams.from ?? "",
            to: resolvedSearchParams.to ?? "",
          }}
        />
      </div>
    );
  }

  if (tab === "procedures") {
    const [session, rows] = await Promise.all([
      auth(),
      listProcedureAdminRows(),
    ]);
    return (
      <div className="space-y-6">
        <TransactionsTabs active="procedures" />
        <ProceduresManager
          rows={rows}
          canEdit={session?.user.role === "admin"}
        />
      </div>
    );
  }

  if (tab === "recalls") {
    const items = await listPendingRecalls();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
    }).format(new Date());
    return (
      <div className="space-y-6">
        <TransactionsTabs active="recalls" />
        <RecallsList items={items} today={today} />
      </div>
    );
  }

  const query = parseTransactionsQuery(resolvedSearchParams);
  const offset = (query.page - 1) * query.pageSize;

  const [
    session,
    { rows, total },
    dentists,
    branches,
    procedures,
    discountTypes,
  ] = await Promise.all([
    auth(),
    listTransactionsPage({
      limit: query.pageSize,
      offset,
      q: query.q,
      type: query.type,
      payment: query.payment,
      dentist: query.dentist,
      from: query.from,
      to: query.to,
      sort: query.sort,
      dir: query.dir,
    }),
    listDentistUsers(),
    listBranches(),
    listProcedureOptions(),
    listActiveDiscountTypes(),
  ]);
  const invoiceSummaries = await getInvoiceSummaries(
    rows.flatMap((row) => (row.invoiceId ? [row.invoiceId] : [])),
  );

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  // Someone jumped to (or was left on) a page past the end — e.g. the last
  // row on the last page just got deleted, a filter narrowed the result set,
  // or the URL was hand-edited. Bounce back to the actual last page instead
  // of showing a confusing empty table.
  if (total > 0 && query.page > totalPages) {
    const search = buildTransactionsSearch(query, { page: totalPages });
    redirect(`/cashflow/transactions${search}`);
  }

  const canDelete = session?.user.role === "admin";

  return (
    <div className="space-y-6">
      <TransactionsTabs active="transactions" />
      <TransactionsList
        transactions={rows}
        canDelete={canDelete}
        query={query}
        total={total}
        totalPages={totalPages}
        dentistOptions={dentists.map((dentist) => dentist.name)}
        branches={branches}
        procedures={procedures}
        discountTypes={discountTypes}
        invoiceSummaries={invoiceSummaries}
      />
    </div>
  );
}
