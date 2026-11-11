"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  addPaymentMethodAction,
  deletePaymentMethodAction,
  setPaymentMethodActiveAction,
} from "@/app/cashflow/transactions/payment-method-actions";
import { Spinner } from "@/components/ui/spinner";
import {
  MAX_PAYMENT_METHOD_LENGTH,
  type PaymentMethodKind,
} from "@/lib/cashflow/payment-methods";
import type { PaymentMethodRowView } from "@/lib/db/payment-methods";

const dateOnly = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

/**
 * Owners and admins add the ways a visit can be paid. The built-in methods
 * (Cash, GCash, Maxicare, Asiancare, ...) are listed for reference and can't
 * be changed; an added method can be hidden from new visits (old visits keep
 * it) and removed if it was never used.
 */
export function PaymentMethodsManager({
  methods,
  ready,
}: {
  methods: PaymentMethodRowView[];
  /** False until scripts/sql/2026-11-payment-methods.sql has been run. */
  ready: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PaymentMethodKind>("hmo");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<{ id: string; action: "toggle" | "delete" } | null>(null);
  const [filter, setFilter] = useState<"all" | "hmo" | "other">("all");

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setAdding(true);
    try {
      const result = await addPaymentMethodAction({ name, kind });
      setNotice({ ok: result.ok, text: result.message });
      if (result.ok) {
        setName("");
        router.refresh();
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(method: PaymentMethodRowView) {
    if (!method.id) return;
    setBusy({ id: method.id, action: "toggle" });
    setNotice(null);
    try {
      const result = await setPaymentMethodActiveAction(method.id, !method.active);
      setNotice({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(method: PaymentMethodRowView) {
    if (!method.id) return;
    if (
      !window.confirm(
        `Remove ${method.name}? It has never been used on a visit or payment. This can't be undone.`,
      )
    ) {
      return;
    }
    setBusy({ id: method.id, action: "delete" });
    setNotice(null);
    try {
      const result = await deletePaymentMethodAction(method.id);
      setNotice({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const shown = methods.filter((method) => filter === "all" || method.kind === filter);
  const chip = (label: string, value: "all" | "hmo" | "other") => (
    <button
      key={value}
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        filter === value
          ? "border-amber-600 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Payment methods
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          The ways a visit can be paid. Add a new HMO, card machine or e-wallet
          here and it appears on the visit and payment forms, in the filters and
          on the Day end sheet. An <strong>HMO</strong> is billed to the company:
          it also gets a price column for each procedure (set the prices under
          Procedures), an HMO billing tab entry and the dentist&apos;s HMO
          commission rate. <strong>Other</strong> methods are paid by the patient.
        </p>
      </div>

      {!ready && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Adding payment methods isn&apos;t set up in the database yet. Run{" "}
          <code>scripts/sql/2026-11-payment-methods.sql</code> in Neon. Until
          then the built-in methods below keep working.
        </p>
      )}

      <form
        onSubmit={handleAdd}
        className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Add a payment method
        </h3>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Name
            <input
              required
              type="text"
              value={name}
              maxLength={MAX_PAYMENT_METHOD_LENGTH + 10}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Pacific Cross"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
            />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Kind
            </legend>
            <div className="flex gap-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-300">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="kind"
                  checked={kind === "hmo"}
                  onChange={() => setKind("hmo")}
                />
                HMO / insurance
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="kind"
                  checked={kind === "other"}
                  onChange={() => setKind("other")}
                />
                Other (cash, card, e-wallet, bank)
              </label>
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={adding || !name.trim()}
            aria-busy={adding}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {adding && <Spinner />}
            {adding ? "Adding..." : "Add"}
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          A method can&apos;t be renamed later, because past visits keep the
          name they were saved with. Check the spelling before adding.
        </p>
      </form>

      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {chip(`All (${methods.length})`, "all")}
        {chip(`HMOs (${methods.filter((method) => method.kind === "hmo").length})`, "hmo")}
        {chip(`Other (${methods.filter((method) => method.kind === "other").length})`, "other")}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Kind</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 text-right font-medium">Used</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {shown.map((method) => {
              const isBusy = busy?.id === method.id;
              return (
                <tr
                  key={method.name}
                  className={`text-zinc-700 dark:text-zinc-300 ${method.active ? "" : "opacity-60"}`}
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                    {method.name}
                  </td>
                  <td className="px-4 py-3">
                    {method.kind === "hmo" ? "HMO / insurance" : "Other"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {method.builtIn ? (
                      "Built in"
                    ) : (
                      <>
                        Added {method.createdAt ? dateOnly.format(new Date(method.createdAt)) : ""}
                        {method.createdByName && (
                          <>
                            <br />
                            <span className="text-zinc-500 dark:text-zinc-400">
                              by {method.createdByName}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{method.uses}</td>
                  <td className="px-4 py-3">{method.active ? "Offered" : "Hidden"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {!method.builtIn && method.id && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggle(method)}
                          disabled={isBusy}
                          className="mr-1 inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          {isBusy && busy?.action === "toggle" && <Spinner className="h-3 w-3" />}
                          {method.active ? "Hide" : "Show again"}
                        </button>
                        {method.uses === 0 && (
                          <button
                            type="button"
                            onClick={() => handleDelete(method)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          >
                            {isBusy && busy?.action === "delete" && <Spinner className="h-3 w-3" />}
                            Remove
                          </button>
                        )}
                      </>
                    )}
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
