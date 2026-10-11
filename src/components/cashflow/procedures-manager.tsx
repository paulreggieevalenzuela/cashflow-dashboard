"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  addProcedureAction,
  deleteProcedureAction,
  loadPriceHistoryAction,
  updateProcedureAction,
} from "@/app/cashflow/transactions/procedure-actions";
import { Modal } from "@/components/ui/modal";
import {
  PRICE_BASES,
  PRICE_BASIS_LABELS,
  type PriceBasis,
} from "@/lib/cashflow/price-basis";
import { HMO_PAYMENT_TYPES, type VatType } from "@/lib/cashflow/pricing";
import type {
  PriceHistoryEntry,
  ProcedureAdminRow,
} from "@/lib/db/procedure-admin";

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});
const dateTime = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" });

const FIELD =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40";

type Filter = "all" | "vat" | "non_vat" | "no_price" | "hidden";

const FILTER_LABELS: Record<Filter, string> = {
  all: "All procedures",
  vat: "VAT 12%",
  non_vat: "Non-VAT",
  no_price: "No price",
  hidden: "Hidden",
};

type Draft = {
  name: string;
  vatType: "vat" | "non_vat";
  price: string;
  priceBasis: PriceBasis;
  active: boolean;
  note: string;
  /** HMO prices as typed, keyed by HMO name; blank = no price. */
  payerPrices: Record<string, string>;
};

const EMPTY_PAYER_PRICES: Record<string, string> = Object.fromEntries(
  HMO_PAYMENT_TYPES.map((payer) => [payer, ""]),
);

const EMPTY_DRAFT: Draft = {
  name: "",
  vatType: "vat",
  price: "",
  priceBasis: "flat",
  active: true,
  note: "",
  payerPrices: EMPTY_PAYER_PRICES,
};

/** The typed HMO prices as numbers (null = no price). */
function payerPricesPayload(
  prices: Record<string, string>,
): Record<string, number | null> {
  return Object.fromEntries(
    HMO_PAYMENT_TYPES.map((payer) => {
      const text = (prices[payer] ?? "").trim();
      return [payer, text === "" ? null : Number(text)];
    }),
  );
}

function draftFrom(row: ProcedureAdminRow): Draft {
  return {
    name: row.name,
    vatType: row.vatType === "vat" ? "vat" : "non_vat",
    price: row.price === null ? "" : String(row.price),
    priceBasis: row.priceBasis,
    active: row.active,
    note: "",
    payerPrices: Object.fromEntries(
      HMO_PAYMENT_TYPES.map((payer) => [
        payer,
        row.payerPrices[payer] === undefined
          ? ""
          : String(row.payerPrices[payer]),
      ]),
    ),
  };
}

export function ProceduresManager({
  rows,
  canEdit,
}: {
  rows: ProcedureAdminRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // null = closed; "new" = adding; otherwise the row being edited.
  const [editing, setEditing] = useState<ProcedureAdminRow | "new" | null>(
    null,
  );
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [historyFor, setHistoryFor] = useState<ProcedureAdminRow | null>(null);
  const [history, setHistory] = useState<PriceHistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (needle && !row.name.toLowerCase().includes(needle)) {
        return false;
      }
      switch (filter) {
        case "vat":
          return row.vatType === "vat";
        case "non_vat":
          return row.vatType !== "vat";
        case "no_price":
          return row.price === null || row.price === 0;
        case "hidden":
          return !row.active;
        default:
          return true;
      }
    });
  }, [rows, search, filter]);

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setConfirmMessage(null);
    setConfirmDelete(false);
    setEditing("new");
  }

  function openEdit(row: ProcedureAdminRow) {
    setDraft(draftFrom(row));
    setError(null);
    setConfirmMessage(null);
    setConfirmDelete(false);
    setEditing(row);
  }

  function closeEditor() {
    setEditing(null);
    setConfirmMessage(null);
    setError(null);
  }

  async function openHistory(row: ProcedureAdminRow) {
    setHistoryFor(row);
    setHistory(null);
    setHistoryError(null);
    const result = await loadPriceHistoryAction(row.id);
    if (result.ok) {
      setHistory(result.entries);
    } else {
      setHistoryError(result.message);
    }
  }

  async function save(confirmLargeChange: boolean) {
    if (!editing) {
      return;
    }
    setError(null);
    const priceText = draft.price.trim();
    const price = priceText === "" ? null : Number(priceText);
    if (price !== null && !Number.isFinite(price)) {
      setError("Enter the price as a number.");
      return;
    }
    const payerPrices = payerPricesPayload(draft.payerPrices);
    if (
      Object.values(payerPrices).some((v) => v !== null && !Number.isFinite(v))
    ) {
      setError("Enter the HMO prices as numbers.");
      return;
    }
    const payload = {
      payerPrices,
      name: draft.name,
      vatType: draft.vatType,
      price,
      priceBasis: draft.priceBasis,
      active: draft.active,
      note: draft.note,
    };
    setSaving(true);
    try {
      const result =
        editing === "new"
          ? await addProcedureAction(payload)
          : await updateProcedureAction(
              editing.id,
              payload,
              confirmLargeChange,
            );
      if (!result.ok) {
        if (result.needsConfirm) {
          setConfirmMessage(result.message);
        } else {
          setError(result.message);
        }
        return;
      }
      closeEditor();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save(false);
  }

  async function toggleHidden(row: ProcedureAdminRow) {
    const result = await updateProcedureAction(
      row.id,
      {
        ...draftFrom(row),
        price: row.price,
        active: !row.active,
        payerPrices: row.payerPrices,
      },
      true,
    );
    if (!result.ok) {
      window.alert(result.message);
    }
    router.refresh();
  }

  async function handleDelete() {
    if (editing === null || editing === "new") {
      return;
    }
    setSaving(true);
    try {
      const result = await deleteProcedureAction(editing.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      closeEditor();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Procedures &amp; prices
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
            This changes prices for new transactions only. Past transactions are
            not affected.
            {canEdit
              ? " A procedure that has been used can be hidden but not deleted."
              : " Only an admin can change this list."}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openAdd}
            className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
          >
            Add procedure
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search procedures..."
          aria-label="Search procedures"
          className={`${FIELD} !py-2 sm:max-w-xs sm:flex-1`}
        />
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          aria-label="Filter procedures"
          className={`${FIELD} select-chevron !py-2 sm:w-48`}
        >
          {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
            <option key={key} value={key}>
              {FILTER_LABELS[key]}
            </option>
          ))}
        </select>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {visible.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Procedure</th>
              <th className="px-4 py-3 font-medium">VAT</th>
              <th className="px-4 py-3 text-right font-medium">Cash price</th>
              <th className="px-4 py-3 font-medium">Price is</th>
              <th className="px-4 py-3 font-medium">HMO prices</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last changed</th>
              <th className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                >
                  No procedures match.
                </td>
              </tr>
            )}
            {visible.map((row) => (
              <tr
                key={row.id}
                className={row.active ? "" : "bg-zinc-50/60 text-zinc-500"}
              >
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                  {row.name}
                </td>
                <td className="px-4 py-3">
                  {row.vatType === "vat" ? "VAT 12%" : "Non-VAT"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {row.price === null ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      No price
                    </span>
                  ) : (
                    peso.format(row.price)
                  )}
                </td>
                <td className="px-4 py-3">
                  {PRICE_BASIS_LABELS[row.priceBasis]}
                </td>
                <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                  {Object.keys(row.payerPrices).length === 0
                    ? "—"
                    : `${Object.keys(row.payerPrices).length} of ${HMO_PAYMENT_TYPES.length}`}
                </td>
                <td className="px-4 py-3">
                  {row.active ? "Active" : "Hidden"}
                </td>
                <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                  {dateOnly.format(new Date(row.updatedAt))}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void openHistory(row)}
                    className="mr-3 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                  >
                    History
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="mr-3 text-sm font-medium text-amber-700 hover:text-amber-800 dark:text-amber-400"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleHidden(row)}
                        className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                      >
                        {row.active ? "Hide" : "Show"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={editing !== null}
        onClose={closeEditor}
        title={editing === "new" ? "Add procedure" : "Edit procedure"}
        description="This changes prices for new transactions only. Past transactions are not affected."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Procedure name
            </label>
            <input
              required
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              className={FIELD}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Cash price (₱)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={draft.price}
                onChange={(event) =>
                  setDraft({ ...draft, price: event.target.value })
                }
                placeholder="Leave blank for no price"
                className={FIELD}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                The price is
              </label>
              <select
                value={draft.priceBasis}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    priceBasis: event.target.value as PriceBasis,
                  })
                }
                className={`${FIELD} select-chevron`}
              >
                {PRICE_BASES.map((basis) => (
                  <option key={basis} value={basis}>
                    {PRICE_BASIS_LABELS[basis]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                VAT
              </label>
              <select
                value={draft.vatType}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    vatType: event.target.value as VatType &
                      ("vat" | "non_vat"),
                  })
                }
                className={`${FIELD} select-chevron`}
              >
                <option value="vat">VAT 12% (included in the price)</option>
                <option value="non_vat">Non-VAT</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Status
              </label>
              <select
                value={draft.active ? "active" : "hidden"}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    active: event.target.value === "active",
                  })
                }
                className={`${FIELD} select-chevron`}
              >
                <option value="active">Active</option>
                <option value="hidden">
                  Hidden (not offered on new transactions)
                </option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              HMO prices (₱)
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {HMO_PAYMENT_TYPES.map((payer) => (
                <label
                  key={payer}
                  className="flex items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  <span>{payer}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={draft.payerPrices[payer] ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        payerPrices: {
                          ...draft.payerPrices,
                          [payer]: event.target.value,
                        },
                      })
                    }
                    placeholder="No price"
                    className={`${FIELD} !w-32 !py-2 text-right`}
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Used when the payment method is that HMO. Leave blank if the HMO
              has no price for this procedure — the form then asks staff to
              enter it.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Note for the price history (optional)
            </label>
            <input
              value={draft.note}
              onChange={(event) =>
                setDraft({ ...draft, note: event.target.value })
              }
              placeholder="e.g. 2027 price update"
              className={FIELD}
            />
          </div>

          {confirmMessage && (
            <div
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              <p>{confirmMessage}</p>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true)}
                className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-70"
              >
                Confirm and save
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div>
              {editing !== null &&
                editing !== "new" &&
                editing.usedCount === 0 && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      confirmDelete
                        ? void handleDelete()
                        : setConfirmDelete(true)
                    }
                    className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-70"
                  >
                    {confirmDelete
                      ? "Click again to delete (also removes its commission rates)"
                      : "Delete (never used)"}
                  </button>
                )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={historyFor !== null}
        onClose={() => setHistoryFor(null)}
        title={
          historyFor ? `Price history — ${historyFor.name}` : "Price history"
        }
        description="Every price change, newest first. Transactions already saved keep the price they were sold at."
      >
        {historyError && <p className="text-sm text-red-600">{historyError}</p>}
        {!historyError && history === null && (
          <p className="text-sm text-zinc-500">Loading...</p>
        )}
        {history !== null && history.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No price changes recorded yet.
          </p>
        )}
        {history !== null && history.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Price for</th>
                  <th className="py-2 pr-3 text-right font-medium">Old</th>
                  <th className="py-2 pr-3 text-right font-medium">New</th>
                  <th className="py-2 pr-3 font-medium">By</th>
                  <th className="py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {dateTime.format(new Date(entry.changedAt))}
                    </td>
                    <td className="py-2 pr-3">{entry.payer}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {entry.oldPrice === null
                        ? "—"
                        : peso.format(entry.oldPrice)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {entry.newPrice === null
                        ? "—"
                        : peso.format(entry.newPrice)}
                    </td>
                    <td className="py-2 pr-3">{entry.changedByName || "—"}</td>
                    <td className="py-2">{entry.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
