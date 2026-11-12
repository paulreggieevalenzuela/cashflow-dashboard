"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  approveVisitsHqAction,
  checkVisitsAction,
  uncheckVisitAction,
} from "@/app/cashflow/transactions/check-actions";
import { Spinner } from "@/components/ui/spinner";
import {
  approvalStageOf,
  canApproveVisitHq,
  canCheckVisit,
  checkStateOf,
  formatCheckedAt,
  type VisitCheck,
} from "@/lib/cashflow/transaction-lock";

/**
 * The visit's two checks, on its detail page. First the Branch manager checks
 * it (which locks it), then Headquarters approves it. Shows who gave each and
 * when, the button for whichever check the person may give, and Unlock for the
 * superuser (removes both).
 */
export function VisitCheckBanner({
  invoiceId,
  status,
  procedures,
  check,
  canVerify,
  canVerifyHq,
  hqReady,
  currentUserId,
  isSuperuser,
}: {
  invoiceId: string;
  status: string;
  procedures: string[];
  check: VisitCheck;
  /** May give the Branch manager check. */
  canVerify: boolean;
  /** May give the Headquarters check. */
  canVerifyHq: boolean;
  /** False until the Headquarters SQL script has been run. */
  hqReady: boolean;
  currentUserId: string | null;
  isSuperuser: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"check" | "hq" | "uncheck" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stage = approvalStageOf(check);
  const branchDecision = canCheckVisit({
    status,
    procedures,
    state: checkStateOf(check),
  });
  const hqDecision = canApproveVisitHq({
    check,
    actorUserId: currentUserId,
    isSuperuser,
  });

  async function run(kind: "check" | "hq" | "uncheck") {
    const message =
      kind === "check"
        ? "Check this visit as Branch manager? It will be locked: only the superuser will be able to edit, remove or unlock it. Headquarters checks it next."
        : kind === "hq"
          ? "Approve this visit as Headquarters? This is the last check."
          : "Unlock this visit so it can be edited again? This removes both checks.";
    if (!window.confirm(message)) return;
    setBusy(kind);
    setError(null);
    try {
      const result =
        kind === "check"
          ? await checkVisitsAction([invoiceId])
          : kind === "hq"
            ? await approveVisitsHqAction([invoiceId])
            : await uncheckVisitAction(invoiceId);
      if (!result.ok) setError(result.message);
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (stage !== "none") {
    const approved = stage === "approved";
    return (
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          approved
            ? "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200"
            : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p>
              <span className="font-semibold">Branch manager: checked and locked</span>
              {check.checkedBy ? ` by ${check.checkedBy}` : ""}
              {check.checkedAt ? ` · ${formatCheckedAt(check.checkedAt)}` : ""}
            </p>
            <p>
              {approved ? (
                <>
                  <span className="font-semibold">Headquarters: approved</span>
                  {check.hqCheckedBy ? ` by ${check.hqCheckedBy}` : ""}
                  {check.hqCheckedAt ? ` · ${formatCheckedAt(check.hqCheckedAt)}` : ""}
                </>
              ) : (
                <>
                  <span className="font-semibold">Headquarters: waiting.</span>{" "}
                  {canVerifyHq && !hqDecision.ok ? hqDecision.reason : ""}
                  {!canVerifyHq ? "Headquarters checks it next." : ""}
                </>
              )}
            </p>
            <p className="text-xs opacity-80">
              {isSuperuser
                ? "You can still edit it, or unlock it."
                : "It can't be edited or removed; ask the superuser."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!approved && canVerifyHq && (
              <button
                type="button"
                onClick={() => void run("hq")}
                disabled={!hqDecision.ok || !hqReady || busy !== null}
                aria-busy={busy === "hq"}
                title={
                  !hqReady
                    ? "Run the Headquarters SQL script first."
                    : hqDecision.ok
                      ? undefined
                      : hqDecision.reason
                }
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "hq" && <Spinner className="h-3 w-3" />}
                {busy === "hq" ? "Approving..." : "Approve as Headquarters"}
              </button>
            )}
            {isSuperuser && (
              <button
                type="button"
                onClick={() => void run("uncheck")}
                disabled={busy !== null}
                aria-busy={busy === "uncheck"}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {busy === "uncheck" && <Spinner className="h-3 w-3" />}
                {busy === "uncheck" ? "Unlocking..." : "Unlock"}
              </button>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!canVerify) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
      <p>
        {branchDecision.ok
          ? "Not checked yet. Once you have reviewed this visit, check it as Branch manager to lock it. Headquarters checks it next."
          : `Not checked yet. ${branchDecision.reason}`}
      </p>
      <button
        type="button"
        onClick={() => void run("check")}
        disabled={!branchDecision.ok || busy !== null}
        aria-busy={busy === "check"}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === "check" && <Spinner className="h-3 w-3" />}
        {busy === "check" ? "Checking..." : "Check and lock"}
      </button>
      {error && (
        <p role="alert" className="basis-full text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
