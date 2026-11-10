import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { listBranches } from "@/lib/db/branches";
import {
  DELETED_KINDS,
  DELETED_KIND_LABELS,
  deletedItemsReady,
  listDeletedItems,
  type DeletedKind,
} from "@/lib/db/deleted-items";
import { DeletedItemsList } from "@/components/cashflow/deleted-items-list";

export const metadata: Metadata = { title: "Deleted items" };

const stamp = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

/**
 * Everything an owner or admin deleted, kept so the superuser can bring it
 * back. The page and every action behind it are for the superuser only.
 */
export default async function DeletedItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; restored?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.isSuperuser) {
    redirect("/cashflow");
  }
  const raw = await searchParams;
  const kind = (DELETED_KINDS as readonly string[]).includes(raw.kind ?? "")
    ? (raw.kind as DeletedKind)
    : null;
  const showRestored = raw.restored === "1";

  const ready = await deletedItemsReady();
  const [items, branches] = await Promise.all([
    ready ? listDeletedItems({ kind, showRestored }) : Promise.resolve([]),
    listBranches(),
  ]);
  const branchName = new Map(branches.map((branch) => [branch.id, branch.name]));

  const chip = (label: string, href: string, active: boolean) => (
    <Link
      key={label}
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        active
          ? "border-amber-600 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }`}
    >
      {label}
    </Link>
  );
  const link = (nextKind: string | null, restored = showRestored) => {
    const params = new URLSearchParams();
    if (nextKind) params.set("kind", nextKind);
    if (restored) params.set("restored", "1");
    const query = params.toString();
    return `/cashflow/trash${query ? `?${query}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Deleted items
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          When an owner or admin deletes a visit, payment, expense or attached
          file, it comes here instead of disappearing. It no longer counts in any
          report. <strong>Restore</strong> puts it back exactly as it was;{" "}
          <strong>Delete permanently</strong> removes it for good. Only you, as
          the superuser, can see this page.
        </p>
      </div>

      {!ready && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Deleted items aren&apos;t set up in the database yet. Run{" "}
          <code>scripts/sql/2026-11-roles-permissions-trash.sql</code> in Neon.
          Until then, deleting is switched off so nothing is lost.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {chip("All", link(null), kind === null)}
        {DELETED_KINDS.map((value) =>
          chip(DELETED_KIND_LABELS[value], link(value), kind === value),
        )}
        <span className="mx-1 h-4 w-px bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />
        {chip(
          showRestored ? "Hide restored" : "Show restored",
          link(kind, !showRestored),
          showRestored,
        )}
      </div>

      <DeletedItemsList
        items={items.map((item) => ({
          id: item.id,
          kind: item.kind,
          kindLabel: DELETED_KIND_LABELS[item.kind],
          label: item.label,
          summary: item.summary,
          branchName: item.branchId ? (branchName.get(item.branchId) ?? "") : "",
          amount: item.amount,
          deletedByName: item.deletedByName,
          deletedAt: stamp.format(item.deletedAt),
          restoredAt: item.restoredAt ? stamp.format(item.restoredAt) : null,
          restoredByName: item.restoredByName,
        }))}
      />
    </div>
  );
}
