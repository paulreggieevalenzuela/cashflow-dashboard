"use client";

import { useState } from "react";
import { ExpenseForm } from "@/components/cashflow/expense-form";
import { Modal } from "@/components/ui/modal";
import type { Branch } from "@/lib/db/branches";

/**
 * The header's "Add Expenses" CTA (see cashflow-nav.tsx) — same
 * button-opens-modal-with-form pattern as AddTransactionModal, just for
 * the outflow side. Rendered in the site header so it's reachable from
 * every page, not just a dedicated expenses page (which doesn't exist
 * yet — see docs/PROPOSAL_GAP_ANALYSIS.md, "Expense Management").
 */
export function AddExpenseModal({ branches }: { branches: Branch[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
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
        <span className="hidden sm:inline">Add Expenses</span>
        <span className="sm:hidden">Add expense</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add expense"
        description="Record a clinic expense. It will be reflected in reporting once saved."
      >
        <ExpenseForm branches={branches} onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}
