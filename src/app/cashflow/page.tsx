import { auth } from "@/auth";
import { CashflowOverview } from "@/components/cashflow/cashflow-overview";
import { currentPeriodKeys } from "@/lib/cashflow/dashboard-metrics";
import { listExpenses } from "@/lib/db/expenses";
import { getSalesTarget } from "@/lib/db/targets";
import { listTransactions } from "@/lib/db/transactions";

export default async function CashflowPage() {
  const periodKeys = currentPeriodKeys();

  const [session, transactions, expenses, monthTarget, quarterTarget, yearTarget] = await Promise.all([
    auth(),
    listTransactions(),
    listExpenses(),
    getSalesTarget("month", periodKeys.month),
    getSalesTarget("quarter", periodKeys.quarter),
    getSalesTarget("year", periodKeys.year),
  ]);

  return (
    <CashflowOverview
      transactions={transactions}
      expenses={expenses}
      userName={session?.user.name ?? session?.user.email ?? undefined}
      targets={{
        month: monthTarget?.targetAmount ?? null,
        quarter: quarterTarget?.targetAmount ?? null,
        year: yearTarget?.targetAmount ?? null,
      }}
      canEditTargets={session?.user.role === "admin"}
    />
  );
}
