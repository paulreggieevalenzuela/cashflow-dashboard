import Link from "next/link";

const TABS = [
  { key: "transactions", label: "Transactions", href: "/cashflow/transactions" },
  {
    key: "procedures",
    label: "Procedures",
    href: "/cashflow/transactions?tab=procedures",
  },
  {
    key: "recalls",
    label: "Recalls due",
    href: "/cashflow/transactions?tab=recalls",
  },
] as const;

export type TransactionsTab = (typeof TABS)[number]["key"];

/** The tab row at the top of the Transactions page. */
export function TransactionsTabs({ active }: { active: TransactionsTab }) {
  return (
    <nav
      aria-label="Transactions sections"
      className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.key === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab.key === active
              ? "border-amber-600 text-amber-700 dark:text-amber-400"
              : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
