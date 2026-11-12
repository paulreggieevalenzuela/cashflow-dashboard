import type { HmoBillingLine } from "@/lib/cashflow/hmo-billing";
import { LOA_PENDING_TEXT } from "@/lib/cashflow/hmo-billing";

export const pesoFormat = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const dateFormat = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-11-03" → "Nov 3, 2026". */
export function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
}

/**
 * The rows of an HMO billing: visit date, patient, patient's company, HMO account #, LOA #,
 * LOE #, procedure, tooth # and amount, with the total at the foot. Used by
 * the HMO billing tab (preview), a saved billing, and Day end.
 */
export function HmoBillingTable({
  lines,
  total,
  showHmo = false,
  emptyText = "No HMO lines for this range.",
  minWidth = 980,
}: {
  lines: HmoBillingLine[];
  total: number;
  showHmo?: boolean;
  emptyText?: string;
  minWidth?: number;
}) {
  const columns = showHmo ? 11 : 10;
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table
        className="w-full text-left text-sm"
        style={{ minWidth }}
      >
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th className="px-3 py-3 font-medium">No.</th>
            <th className="px-3 py-3 font-medium">Visit date</th>
            <th className="px-3 py-3 font-medium">Patient</th>
            {showHmo && <th className="px-3 py-3 font-medium">HMO</th>}
            <th className="px-3 py-3 font-medium">Patient&rsquo;s company</th>
            <th className="px-3 py-3 font-medium">HMO account #</th>
            <th className="px-3 py-3 font-medium">LOA #</th>
            <th className="px-3 py-3 font-medium">LOE #</th>
            <th className="px-3 py-3 font-medium">Procedure</th>
            <th className="px-3 py-3 font-medium">Tooth #</th>
            <th className="px-3 py-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
          {lines.length === 0 ? (
            <tr>
              <td
                colSpan={columns}
                className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            lines.map((line, index) => (
              <tr key={`${line.transactionId}-${index}`}>
                <td className="px-3 py-2.5 tabular-nums text-zinc-500">
                  {index + 1}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {shortDate(line.visitDate)}
                </td>
                <td className="px-3 py-2.5">{line.patientName}</td>
                {showHmo && (
                  <td className="whitespace-nowrap px-3 py-2.5">{line.hmo}</td>
                )}
                <td className="px-3 py-2.5">
                  {line.hmoEmployer || (
                    <span className="text-zinc-400">Not given</span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs">
                  {line.hmoAccountNumber || (
                    <span className="font-sans text-zinc-400">Not on file</span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs">
                  {line.loaNumber || (
                    <span className="font-sans text-orange-600 dark:text-orange-400">
                      {LOA_PENDING_TEXT}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs">
                  {line.loeNumber || <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-3 py-2.5">{line.procedure}</td>
                <td className="px-3 py-2.5">
                  {line.teeth || <span className="text-zinc-400">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                  {pesoFormat.format(line.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {lines.length > 0 && (
          <tfoot>
            <tr className="border-t border-zinc-300 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900">
              <td colSpan={columns - 1} className="px-3 py-3 text-right">
                Total amount of billing
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                {pesoFormat.format(total)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
