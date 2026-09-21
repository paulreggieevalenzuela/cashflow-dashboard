import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TransactionsList } from "@/components/cashflow/transactions-list";
import { listBranches } from "@/lib/db/branches";
import { listDentistUsers } from "@/lib/db/dentists";
import { getCollectedTotals } from "@/lib/db/payments";
import { listProcedures } from "@/lib/db/procedures";
import { listTransactionsPage } from "@/lib/db/transactions";
import { buildTransactionsSearch, parseTransactionsQuery } from "@/lib/cashflow/transactions-query";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
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
  const query = parseTransactionsQuery(resolvedSearchParams);
  const offset = (query.page - 1) * query.pageSize;

  const [session, { rows, total }, dentists, branches, procedures] = await Promise.all([
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
    listProcedures(),
  ]);
  const collectedTotalsMap = await getCollectedTotals(rows.map((row) => row.id));
  const collectedTotals = Object.fromEntries(collectedTotalsMap);

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
    <TransactionsList
      transactions={rows}
      canDelete={canDelete}
      query={query}
      total={total}
      totalPages={totalPages}
      dentistOptions={dentists.map((dentist) => dentist.name)}
      branches={branches}
      procedures={procedures.map((procedure) => procedure.name)}
      collectedTotals={collectedTotals}
    />
  );
}
