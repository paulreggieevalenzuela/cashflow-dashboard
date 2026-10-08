import type { OrSummary } from "@/lib/cashflow/pricing";

const money = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

/**
 * The official-receipt breakdown (Vatable sales, VAT-exempt sales, VAT,
 * total sales, less VAT, net of VAT, less PWD/SC discount, add VAT, total
 * amount due). Shared by the transaction form, the transaction page and the
 * printable invoice so all three always read the same.
 */
export function OrBreakdown({ summary }: { summary: OrSummary }) {
  const rows: {
    label: string;
    value: string;
    strong?: boolean;
    gap?: boolean;
  }[] = [
    { label: "Vatable sales", value: money.format(summary.vatableSales) },
    { label: "VAT-exempt sales", value: money.format(summary.vatExemptSales) },
    {
      label: "VAT",
      value: money.format(summary.vat),
    },
    {
      label: "Total sales (VAT inclusive)",
      value: money.format(summary.totalSales),
      gap: true,
    },
    { label: "Less: VAT", value: money.format(summary.lessVat) },
    { label: "Amount: net of VAT", value: money.format(summary.netOfVat) },
    {
      label: "Less: Discount (SC, PWD)",
      value: `−${money.format(summary.lessDiscount)}`,
    },
    { label: "Add: VAT", value: money.format(summary.addVat) },
    {
      label: "Total amount due",
      value: money.format(summary.totalDue),
      strong: true,
    },
  ];

  return (
    <dl className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300 print:text-black">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`flex items-center justify-between ${row.gap ? "mt-2" : ""} ${
            row.strong
              ? "border-t border-zinc-200 pt-1 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50 print:border-black/20 print:text-black"
              : ""
          }`}
        >
          <dt>{row.label}</dt>
          <dd className="tabular-nums">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Whether the breakdown adds anything: only when the bill has VAT or a
 * discount in it. A plain non-VAT bill is just its total. */
export function hasOrDetail(summary: OrSummary): boolean {
  return summary.vat > 0 || summary.lessDiscount > 0 || summary.lessVat > 0;
}
