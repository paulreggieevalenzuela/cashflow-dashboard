"use client";

import { useState, type ReactNode } from "react";
import { PaymentsManager } from "@/components/cashflow/payments-manager";
import { TransactionForm } from "@/components/cashflow/transaction-form";
import { Modal } from "@/components/ui/modal";
import type { CashflowTransaction } from "@/lib/cashflow/schema";
import type { Branch } from "@/lib/db/branches";
import type { Invoice } from "@/lib/db/invoices";
import type { Payment } from "@/lib/db/payments";
import type { ProcedureOption } from "@/lib/db/procedures";

/**
 * "Edit transaction" as a pop-up (like AddTransactionModal) instead of a
 * page navigation — used from the transaction detail page's own "Edit
 * transaction" button. The table's row-action Edit item uses the same
 * `Modal` + `TransactionForm mode="edit"` combo directly (one shared modal
 * per table rather than one of these per row), since it doesn't need this
 * component's built-in trigger button.
 */
export function EditTransactionModal({
  invoice,
  lines,
  dentistOptions,
  branches,
  procedures,
  payments,
  totalDue,
  canDelete = false,
  trigger,
}: {
  invoice: Invoice;
  lines: CashflowTransaction[];
  dentistOptions: string[];
  branches: Branch[];
  procedures: ProcedureOption[];
  /** When provided, an editable Payments section (record/remove a payment)
   * is shown below the transaction form — payments are only ever
   * updatable from here, never from the read-only detail page view. */
  payments?: Payment[];
  /** What the visit currently costs, for the Payments section's balance. */
  totalDue?: number;
  canDelete?: boolean;
  /** Custom trigger; receives an onClick to open the modal. Defaults to a
   * bordered "Edit transaction" button matching the detail page's other
   * action buttons. */
  trigger?: (props: { onClick: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const patientName = lines[0]?.patientName ?? "";

  return (
    <>
      {trigger ? (
        trigger({ onClick: () => setOpen(true) })
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Edit transaction
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit transaction"
        description={`${patientName} · ${invoice.visitDate}`}
      >
        <div className="space-y-6">
          <TransactionForm
            mode="edit"
            invoice={invoice}
            lines={lines}
            dentistOptions={dentistOptions}
            branches={branches}
            procedures={procedures}
            onSuccess={() => setOpen(false)}
          />
          {payments && (
            <PaymentsManager
              invoiceId={invoice.id}
              totalDue={
                totalDue ??
                lines.reduce((sum, line) => sum + line.amountPaid, 0)
              }
              payments={payments}
              canDelete={canDelete}
            />
          )}
        </div>
      </Modal>
    </>
  );
}
