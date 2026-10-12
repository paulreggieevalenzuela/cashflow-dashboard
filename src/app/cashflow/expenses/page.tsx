import { redirect } from "next/navigation";

/**
 * Expenses now lives inside Transactions as a tab. This keeps old links and
 * bookmarks working.
 */
export default function ExpensesRedirectPage() {
  redirect("/cashflow/transactions?tab=expenses");
}
