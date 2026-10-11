import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProceduresManager } from "@/components/cashflow/procedures-manager";
import { RecallsList } from "@/components/cashflow/recalls-list";
import { TransactionsList } from "@/components/cashflow/transactions-list";
import {
  TransactionsTabs,
  type TransactionsTab,
} from "@/components/cashflow/transactions-tabs";
import { listBranches } from "@/lib/db/branches";
import { listDentistUsers } from "@/lib/db/dentists";
import { getInvoiceSummaries } from "@/lib/db/invoices";
import { listProcedureAdminRows } from "@/lib/db/procedure-admin";
import { listActiveDiscountTypes } from "@/lib/db/discount-types";
import { listProcedureOptions } from "@/lib/db/procedures";
import { listPendingRecalls } from "@/lib/db/recalls";
import { listTransactionsPage } from "@/lib/db/transactions";
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
    from?: string;
    to?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const tab: TransactionsTab =
    resolvedSearchParams.tab === "procedures" ||
    resolvedSearchParams.tab === "recalls"
      ? resolvedSearchParams.tab
      : "transactions";

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
