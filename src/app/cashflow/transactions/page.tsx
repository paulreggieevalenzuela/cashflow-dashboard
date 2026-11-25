import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { can } from "@/lib/auth/guards";
import { ExpensesTab } from "@/components/cashflow/expenses-tab";
import { ProceduresManager } from "@/components/cashflow/procedures-manager";
import { PaymentMethodsManager } from "@/components/cashflow/payment-methods-manager";
import { listPaymentMethodsWithUse } from "@/lib/db/payment-methods";
import { RecallsList } from "@/components/cashflow/recalls-list";
import { TransactionsList } from "@/components/cashflow/transactions-list";
import {
  TransactionsTabs,
  type TransactionsTab,
} from "@/components/cashflow/transactions-tabs";
import { listExpenseAttachments } from "@/lib/db/attachments";
import { listBranches } from "@/lib/db/branches";
import { getUserById } from "@/lib/db/users";
import { listExpenses } from "@/lib/db/expenses";
import { listSuppliers } from "@/lib/db/suppliers";
import { listDentistUsers } from "@/lib/db/dentists";
import { getInvoiceSummaries } from "@/lib/db/invoices";
import { getVisitChecks, hqChecksReady, transactionChecksReady } from "@/lib/db/transaction-checks";
import { listProcedureAdminRows } from "@/lib/db/procedure-admin";
import { listActiveDiscountTypes } from "@/lib/db/discount-types";
import { listProcedureOptions } from "@/lib/db/procedures";
import { listPendingRecalls } from "@/lib/db/recalls";
import { listTransactionsPage } from "@/lib/db/transactions";
import {
  ALL_BRANCHES,
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
    branch?: string;
    group?: string;
    from?: string;
    to?: string;
    checked?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;

  // The audit trail moved to the profile menu; keep old links working.
  if (resolvedSearchParams.tab === "audit") {
    const group = resolvedSearchParams.group;
    redirect(`/cashflow/audit${group ? `?group=${encodeURIComponent(group)}` : ""}`);
  }

  // The queue now has its own page (and menu item); keep old links working.
  if (resolvedSearchParams.tab === "today") {
    redirect("/cashflow/queue");
  }

  const tab: TransactionsTab =
    resolvedSearchParams.tab === "expenses" ||
    resolvedSearchParams.tab === "procedures" ||
    resolvedSearchParams.tab === "recalls" ||
    resolvedSearchParams.tab === "payment-methods"
      ? resolvedSearchParams.tab
      : "transactions";

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
          canDelete={can(session, "expense.edit") || can(session, "expense.delete")}
          filters={{
            q: resolvedSearchParams.q ?? "",
            from: resolvedSearchParams.from ?? "",
            to: resolvedSearchParams.to ?? "",
            branch: resolvedSearchParams.branch ?? "",
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
          canEdit={can(session, "procedure.manage")}
        />
      </div>
    );
  }

  if (tab === "payment-methods") {
    const session = await auth();
    if (!can(session, "payment_method.manage")) {
      redirect("/cashflow/transactions");
    }
    const { methods, ready } = await listPaymentMethodsWithUse();
    return (
      <div className="space-y-6">
        <TransactionsTabs active="payment-methods" />
        <PaymentMethodsManager methods={methods} ready={ready} />
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

  // The list opens on the signed-in user's own branch (set on their profile)
  // unless the address names a branch, or "all" on purpose. Users with no
  // branch see every branch.
  const session = await auth();
  const me = session?.user ? await getUserById(session.user.id) : undefined;
  const defaultBranchId = me?.branchId ?? null;
  const parsedQuery = parseTransactionsQuery(resolvedSearchParams);
  const query = {
    ...parsedQuery,
    branch: parsedQuery.branch ?? defaultBranchId ?? undefined,
  };
  const offset = (query.page - 1) * query.pageSize;

  const [
    { rows, total },
    dentists,
    branches,
    procedures,
    discountTypes,
  ] = await Promise.all([
    listTransactionsPage({
      limit: query.pageSize,
      offset,
      q: query.q,
      type: query.type,
      payment: query.payment,
      dentist: query.dentist,
      branch: query.branch === ALL_BRANCHES ? undefined : query.branch,
      from: query.from,
      to: query.to,
      checked: query.checked,
      sort: query.sort,
      dir: query.dir,
    }),
    listDentistUsers(),
    listBranches(),
    listProcedureOptions(),
    listActiveDiscountTypes(),
  ]);
  const pageInvoiceIds = rows.flatMap((row) => (row.invoiceId ? [row.invoiceId] : []));
  const [invoiceSummaries, visitChecks, checksReady, hqReady] = await Promise.all([
    getInvoiceSummaries(pageInvoiceIds),
    getVisitChecks(pageInvoiceIds),
    transactionChecksReady(),
    hqChecksReady(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  // Someone jumped to (or was left on) a page past the end — e.g. the last
  // row on the last page just got deleted, a filter narrowed the result set,
  // or the URL was hand-edited. Bounce back to the actual last page instead
  // of showing a confusing empty table.
  if (total > 0 && query.page > totalPages) {
    const search = buildTransactionsSearch(query, { page: totalPages });
    redirect(`/cashflow/transactions${search}`);
  }

  const canDelete = can(session, "visit.delete");

  return (
    <div className="space-y-6">
      <TransactionsTabs active="transactions" />
      <TransactionsList
        transactions={rows}
        canDelete={canDelete}
        canEditCleared={can(session, "visit.edit_cleared")}
        query={query}
        total={total}
        totalPages={totalPages}
        dentistOptions={dentists.map((dentist) => dentist.name)}
        branches={branches}
        defaultBranchId={defaultBranchId}
        procedures={procedures}
        discountTypes={discountTypes}
        invoiceSummaries={invoiceSummaries}
        visitChecks={visitChecks}
        checksReady={checksReady}
        canVerify={can(session, "transaction.verify")}
        canVerifyHq={can(session, "transaction.verify_hq")}
        hqReady={hqReady}
        currentUserId={session?.user.id ?? null}
        isSuperuser={Boolean(session?.user.isSuperuser)}
        canUnlock={can(session, "transaction.unlock")}
      />
    </div>
  );
}
