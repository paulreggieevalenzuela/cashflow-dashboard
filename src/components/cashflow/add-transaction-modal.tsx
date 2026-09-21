"use client";

import { useState } from "react";
import { TransactionForm } from "@/components/cashflow/transaction-form";
import { Modal } from "@/components/ui/modal";
import type { Branch } from "@/lib/db/branches";

export function AddTransactionModal({
  dentistOptions,
  branches,
  procedures,
}: {
  dentistOptions: string[];
  branches: Branch[];
  procedures: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
        </svg>
        Add transaction
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add transaction"
        description="Record a manual transaction. It will appear in the table once saved."
      >
        <TransactionForm
          dentistOptions={dentistOptions}
          branches={branches}
          procedures={procedures}
          onSuccess={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
