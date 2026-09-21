"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  createBranchAction,
  deleteBranchAction,
  renameBranchAction,
} from "@/app/cashflow/branches/actions";
import type { Branch } from "@/lib/db/branches";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function BranchesManager({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setStatus("submitting");

    const result = await createBranchAction(name);

    setStatus("idle");
    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    setName("");
    router.refresh();
  }

  function startEditing(branch: Branch) {
    setEditingId(branch.id);
    setEditingName(branch.name);
  }

  async function handleRename(id: string) {
    setRowBusyId(id);
    try {
      const result = await renameBranchAction(id, editingName);
      if (!result.ok) {
        window.alert(result.message);
        return;
      }
      setEditingId(null);
      router.refresh();
    } finally {
      setRowBusyId(null);
    }
  }

  async function handleDelete(branch: Branch) {
    if (
      !window.confirm(
        `Remove ${branch.name}? Users and transactions assigned to it will keep their history but show no branch.`,
      )
    ) {
      return;
    }
    setRowBusyId(branch.id);
    try {
      const result = await deleteBranchAction(branch.id);
      if (!result.ok) {
        window.alert(result.message);
      }
      router.refresh();
    } finally {
      setRowBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Add a branch
        </h3>

        {formError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleCreate} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Branch name
            </label>
            <input
              required
              type="text"
              placeholder="e.g. Quezon City"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-amber-500 focus:ring-2 focus:ring-amber-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-amber-900/40"
            />
          </div>
          <button
            type="submit"
            disabled={status === "submitting"}
            className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === "submitting" ? "Adding..." : "Add branch"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Added</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {branches.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No branches yet. Add one above once the clinic has more than one location.
                </td>
              </tr>
            ) : (
              branches.map((branch) => {
                const isBusy = rowBusyId === branch.id;
                const isEditing = editingId === branch.id;

                return (
                  <tr key={branch.id} className="text-zinc-700 dark:text-zinc-300">
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-50">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                        />
                      ) : (
                        branch.name
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {dateFormatter.format(new Date(branch.createdAt))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleRename(branch.id)}
                            disabled={isBusy}
                            className="rounded-md px-2 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                          >
                            {isBusy ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            disabled={isBusy}
                            className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(branch)}
                            disabled={isBusy}
                            className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(branch)}
                            disabled={isBusy}
                            className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          >
                            {isBusy ? "Removing..." : "Remove"}
                          </button>
                        </div>
                      )}
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
