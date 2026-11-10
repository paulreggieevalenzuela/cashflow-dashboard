"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";

export function PrintButton() {
  const [busy, setBusy] = useState(false);

  function print() {
    setBusy(true);
    // Let the spinner paint before the (blocking) print dialog opens.
    setTimeout(() => {
      try {
        window.print();
      } finally {
        setBusy(false);
      }
    }, 150);
  }

  return (
    <button
      type="button"
      onClick={print}
      disabled={busy}
      aria-busy={busy}
      className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-70"
    >
      {busy && <Spinner />}
      {busy ? "Preparing PDF…" : "Print / Save as PDF"}
    </button>
  );
}
