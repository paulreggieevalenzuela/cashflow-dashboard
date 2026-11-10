"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  purgeDeletedItemAction,
  restoreDeletedItemAction,
} from "@/app/cashflow/trash/actions";
import { Spinner } from "@/components/ui/spinner";

export type DeletedItemView = {
  id: string;
  kind: string;
  kindLabel: string;
  label: string;
  summary: string;
  branchName: string;
  amount: number | null;
  deletedByName: string;
  /** Already formatted on the server (so the clinic's time zone is used). */
  deletedAt: string;
  restoredAt: string | null;
  restoredByName: string;
};

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/**
 * The superuser's list of deleted items, each with Restore and Delete
 * permanently. Every button shows a spinner while it works.
 */
export function DeletedItemsList({ items }: { items: DeletedItemView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<{ id: string; action: "restore" | "purge" } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [clash, setClash] = useState<string | null>(null);

  async function restore(id: string, allowNumberClash = false) {
    setBusy({ id, action: "restore" });
    setNotice(null);
    setClash(null);
    try {
      const result = await restoreDeletedItemAction(id, allowNumberClash);
      if (!result.ok) {
        setNotice({ ok: false, text: result.message });
        if (result.canForce) setClash(id);
        return;
      }
      setNotice({ ok: true, text: result.message });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function purge(item: DeletedItemView) {
    if (
      !window.confirm(
        `Delete "${item.label}" for good? It can no longer be restored.`,
      )
    ) {
      return;
    }
    setBusy({ id: item.id, action: "purge" });
    setNotice(null);
    try {
      const result = await purgeDeletedItemAction(item.id);
      if (!result.ok) {
        setNotice({ ok: false, text: result.message });
        return;
      }
      setNotice({ ok: true, text: "Deleted for good." });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
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
          {clash && (
            <button
              type="button"
              onClick={() => restore(clash, true)}
              className="ml-3 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-300"
            >
              Restore anyway
            </button>
          )}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Clinic</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Deleted</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  Nothing here. Visits, payments, expenses and files that an
                  owner or admin deletes will show up here.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isBusy = busy?.id === item.id;
                const restored = item.restoredAt !== null;
                return (
                  <tr
                    key={item.id}
                    className={`align-top text-zinc-700 dark:text-zinc-300 ${restored ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">
                        <span className="mr-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {item.kindLabel}
                        </span>
                        {item.label}
                      </p>
                      {item.summary && (
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          {item.summary}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{item.branchName || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {item.amount === null ? "—" : money.format(item.amount)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {item.deletedAt}
                      <br />
                      <span className="text-zinc-500 dark:text-zinc-400">
                        by {item.deletedByName || "unknown"}
                      </span>
                      {restored && (
                        <p className="mt-1 text-emerald-700 dark:text-emerald-400">
                          Restored {item.restoredAt} by {item.restoredByName}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {!restored && (
                        <>
                          <button
                            type="button"
                            onClick={() => restore(item.id)}
                            disabled={isBusy}
                            className="mr-1 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
                          >
                            {isBusy && busy?.action === "restore" && <Spinner className="h-3 w-3" />}
                            {isBusy && busy?.action === "restore" ? "Restoring..." : "Restore"}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => purge(item)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        {isBusy && busy?.action === "purge" && <Spinner className="h-3 w-3" />}
                        {isBusy && busy?.action === "purge" ? "Deleting..." : "Delete permanently"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
