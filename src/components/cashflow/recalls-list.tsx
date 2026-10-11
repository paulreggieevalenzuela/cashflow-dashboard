import Link from "next/link";
import type { RecallItem } from "@/lib/db/recalls";

const dateOnly = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateOnly.format(date);
}

function daysUntil(value: string, today: string): number {
  const ms =
    new Date(`${value}T00:00:00`).getTime() -
    new Date(`${today}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

export function RecallsList({
  items,
  today,
}: {
  items: RecallItem[];
  today: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Recalls due
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          Patients who were asked to come back. A recall disappears from this
          list once the patient has another visit. Set the recall date when you
          add or edit a transaction.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Recall date</th>
              <th className="px-4 py-3 font-medium">Patient</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Last visit</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                >
                  No recalls waiting.
                </td>
              </tr>
            )}
            {items.map((item) => {
              const days = daysUntil(item.recallDate, today);
              const status =
                days < 0
                  ? `Overdue by ${-days} day${days === -1 ? "" : "s"}`
                  : days === 0
                    ? "Due today"
                    : `In ${days} day${days === 1 ? "" : "s"}`;
              return (
                <tr key={item.invoiceId}>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatDate(item.recallDate)}
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                    {item.lineId ? (
                      <Link
                        href={`/cashflow/transactions/${encodeURIComponent(item.lineId)}`}
                        className="hover:underline"
                      >
                        {item.patientName || "—"}
                      </Link>
                    ) : (
                      item.patientName || "—"
                    )}
                  </td>
                  <td className="px-4 py-3">{item.recallReason || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {formatDate(item.lastVisitDate)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 ${
                      days < 0
                        ? "font-medium text-red-600 dark:text-red-400"
                        : days <= 7
                          ? "font-medium text-amber-700 dark:text-amber-400"
                          : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {status}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
