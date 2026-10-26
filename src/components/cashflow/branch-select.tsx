"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateMyBranchAction } from "@/app/cashflow/profile/actions";
import type { Branch } from "@/lib/db/branches";

/**
 * "My branch" on the profile page. Saves as soon as a branch is chosen. The
 * Transactions list opens on this branch.
 */
export function BranchSelect({
  branches,
  initialBranchId,
}: {
  branches: Branch[];
  initialBranchId: string;
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(initialBranchId);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  function handleChange(next: string) {
    const previous = branchId;
    setBranchId(next);
    setMessage(null);
    startTransition(async () => {
      const result = await updateMyBranchAction(next);
      if (!result.ok) {
        setBranchId(previous);
        setMessage({ ok: false, text: result.message });
        return;
      }
      setMessage({ ok: true, text: "Saved." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor="my-branch"
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        My branch
      </label>
      <select
        id="my-branch"
        value={branchId}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
        className="select-chevron w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        <option value="">No branch (show all branches)</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      <p
        role={message && !message.ok ? "alert" : "status"}
        className={`text-xs ${
          message && !message.ok
            ? "text-red-600 dark:text-red-400"
            : "text-zinc-500 dark:text-zinc-400"
        }`}
      >
        {isPending
          ? "Saving..."
          : (message?.text ??
            "The Transactions list opens on your branch. You can still look at other branches from its filter.")}
      </p>
    </div>
  );
}
