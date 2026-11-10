import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/access";
import { DownloadButton } from "@/components/ui/download-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { TransactionsTabs } from "@/components/cashflow/transactions-tabs";
import {
  HmoBillingTable,
  pesoFormat,
  shortDate,
} from "@/components/cashflow/hmo-billing-table";
import { formatRange } from "@/lib/cashflow/hmo-billing";
import { listBranches } from "@/lib/db/branches";
import { resolveDayEndScope } from "@/lib/db/day-end";
import { getHmoBilling } from "@/lib/db/hmo-billing";
import { voidHmoBillingAction } from "../actions";

export const metadata: Metadata = { title: "HMO billing" };

/** A saved HMO billing: its header, its frozen rows and the downloads. */
export default async function HmoBillingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const { error } = await searchParams;

  const saved = await getHmoBilling(id);
  if (!saved) notFound();
  const { billing, lines } = saved;

  const isAdmin = session.user.role === "admin";
  if (!isAdmin) {
    const scope = await resolveDayEndScope({
      userId: session.user.id,
      role: session.user.role,
      requested: saved.branchId ?? undefined,
      branchList: await listBranches(),
    });
    if (scope.locked && scope.branchId !== saved.branchId) notFound();
  }

  const isVoid = billing.status === "Void";
  const download = `/api/cashflow/hmo-billing/${billing.id}`;
  const button =
    "rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

  return (
    <div className="space-y-6">
      <TransactionsTabs active="hmo" />

      <div>
        <Link
          href="/cashflow/hmo"
          className="text-sm text-amber-700 hover:underline dark:text-amber-400"
        >
          ← All billings
        </Link>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {billing.billingNumber}
            {isVoid && (
              <span className="ml-3 rounded bg-red-100 px-2 py-0.5 font-sans text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
                VOID
              </span>
            )}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Made {shortDate(billing.createdAt.slice(0, 10))} by{" "}
            {billing.createdByName || "—"}
            {isVoid && billing.voidedAt && (
              <>
                {" "}
                · voided {shortDate(billing.voidedAt.slice(0, 10))} by{" "}
                {billing.voidedByName || "—"}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/cashflow/hmo/${billing.id}/print`}
            className={button}
            target="_blank"
          >
            Print / Save as PDF
          </Link>
          <DownloadButton href={`${download}?format=xlsx`} fileName={`${billing.billingNumber}.xlsx`}>
            Excel
          </DownloadButton>
          <DownloadButton href={`${download}?format=csv`} fileName={`${billing.billingNumber}.csv`}>
            CSV
          </DownloadButton>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="HMO" value={billing.hmo} />
        <Field label="Branch" value={billing.branchName} />
        <Field
          label="Cut-off date"
          value={formatRange(billing.periodFrom, billing.periodTo)}
        />
        <Field
          label="Total amount of billing"
          value={pesoFormat.format(billing.totalAmount)}
          strong
        />
        <Field label="Procedure lines" value={String(billing.lineCount)} />
        <Field label="Patients" value={String(billing.patientCount)} />
        <Field
          label="LOA pending"
          value={String(billing.pendingLoaCount)}
        />
      </dl>

      {isVoid && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          This billing is void. Its lines can be billed again on a new billing.
        </p>
      )}

      <HmoBillingTable lines={lines} total={billing.totalAmount} />

      {isAdmin && !isVoid && (
        <form action={voidHmoBillingAction} className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <input type="hidden" name="id" value={billing.id} />
          <SubmitButton pendingLabel="Voiding…" className="rounded-lg border border-red-300 px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950">Void this billing</SubmitButton>
          <span className="ml-3 text-xs text-zinc-500 dark:text-zinc-400">
            Releases its lines so they can be billed again. Admin only.
          </span>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={`mt-1 tabular-nums text-zinc-900 dark:text-zinc-50 ${strong ? "text-lg font-semibold" : "text-sm font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}
