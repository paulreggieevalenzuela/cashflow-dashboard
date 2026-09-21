import type { DentistPatientRow } from "@/lib/db/transactions";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function DentistPatientsTable({ rows }: { rows: DentistPatientRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        No linked patients yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-3 font-medium">Patient</th>
            <th className="px-4 py-3 text-right font-medium">Visits</th>
            <th className="px-4 py-3 text-right font-medium">Net collection</th>
            <th className="px-4 py-3 font-medium">Last visit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((row) => (
            <tr key={row.patientName} className="text-zinc-700 dark:text-zinc-300">
              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                {row.patientName}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {row.visitCount}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                {currencyFormatter.format(row.netCollection)}
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {dateFormatter.format(new Date(`${row.lastVisitDate}T00:00:00`))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
