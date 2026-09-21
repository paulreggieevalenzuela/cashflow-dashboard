import type { DentistSalesRow } from "@/lib/db/transactions";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

export function LeaderboardTable({ rows }: { rows: DentistSalesRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        No transactions are linked to a dentist account yet. Manually-added
        transactions link automatically; CSV imports link only when the
        dentist name matches an account exactly.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-3 font-medium">Rank</th>
            <th className="px-4 py-3 font-medium">Dentist</th>
            <th className="px-4 py-3 text-right font-medium">Net collection</th>
            <th className="px-4 py-3 text-right font-medium">Commission</th>
            <th className="px-4 py-3 text-right font-medium">Transactions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row, index) => (
            <tr key={row.dentistUserId} className="text-zinc-700 dark:text-zinc-300">
              <td className="whitespace-nowrap px-4 py-3">
                {index === 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    #1
                  </span>
                ) : (
                  `#${index + 1}`
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                {row.dentistName}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {currencyFormatter.format(row.netCollection)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {currencyFormatter.format(row.commissionAmount)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {row.transactionCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
