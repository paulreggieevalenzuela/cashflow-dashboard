// Daily check of transactions: the rules, as plain functions (no database, no
// React) so the screen, the server actions and the tests agree.
//
// Two approvals, in order. First the BRANCH MANAGER ticks a visit once it has
// been Cleared and reviewed: each procedure line gets a "check" record and the
// visit is LOCKED (nobody but the superuser can edit it, remove it or its
// lines, add or remove its payments, change its files or move its status).
// Then HEADQUARTERS approves it, by a different person: each line gets a
// second ("HQ") record. Only the superuser can unlock a visit, which removes
// both. Who may give each check is two privileges, ticked under Users -> Manage.

import { isCheckInPlaceholder } from "@/lib/cashflow/visit-status";

export type CheckState = "none" | "partial" | "all";

export type VisitCheck = {
  /** Procedure lines on the visit (the "No procedures yet" placeholder is not one). */
  lines: number;
  /** How many of them are checked. */
  checked: number;
  /** When the latest check was made (ISO), if any. */
  checkedAt: string | null;
  /** Who made it. */
  checkedBy: string;
  /** The Branch manager's user id (null when unknown); Headquarters must be someone else. */
  checkedByUserId: string | null;
  /** How many lines Headquarters has approved. */
  hqChecked: number;
  /** When the latest Headquarters approval was made (ISO), if any. */
  hqCheckedAt: string | null;
  /** Who gave it. */
  hqCheckedBy: string;
};

export const NO_CHECK: VisitCheck = {
  lines: 0,
  checked: 0,
  checkedAt: null,
  checkedBy: "",
  checkedByUserId: null,
  hqChecked: 0,
  hqCheckedAt: null,
  hqCheckedBy: "",
};

/** Where a visit is in the two approvals. */
export type ApprovalStage = "none" | "branch" | "approved";

/**
 * "none" = not checked, "branch" = the Branch manager has checked it and it
 * waits for Headquarters, "approved" = both have checked every line.
 */
export function approvalStageOf(
  check: Pick<VisitCheck, "lines" | "checked" | "hqChecked">,
): ApprovalStage {
  if (check.checked <= 0) return "none";
  return check.lines > 0 && check.hqChecked >= check.lines ? "approved" : "branch";
}

/** The visit's Headquarters state, like `checkStateOf` for the first check. */
export function hqStateOf(check: Pick<VisitCheck, "lines" | "hqChecked">): CheckState {
  return checkStateOf({ lines: check.lines, checked: check.hqChecked });
}

export function checkStateOf(check: Pick<VisitCheck, "lines" | "checked">): CheckState {
  if (check.checked <= 0) return "none";
  return check.checked >= check.lines ? "all" : "partial";
}

/** A visit with any checked line is locked (its header, payments and files are shared by all lines). */
export function isVisitLocked(check: Pick<VisitCheck, "lines" | "checked"> | undefined): boolean {
  return Boolean(check && check.checked > 0);
}

export const LOCKED_MESSAGE =
  "This visit has been checked and is locked. Only the superuser can change it.";

/** The sentence shown when a locked visit blocks an action. */
export function lockedMessageFor(action: string): string {
  return `${LOCKED_MESSAGE} (${action})`;
}

export type CanCheck = { ok: true } | { ok: false; reason: string };

/**
 * May this visit be ticked as checked? It must be Cleared (finished and
 * paid / billed), have at least one real procedure, and not be checked
 * already.
 */
export function canCheckVisit(input: {
  status: string;
  procedures: readonly string[];
  state: CheckState;
}): CanCheck {
  const real = input.procedures.filter((procedure) => !isCheckInPlaceholder(procedure));
  if (real.length === 0) {
    return { ok: false, reason: "It has no procedures yet." };
  }
  if (input.status !== "Cleared") {
    return {
      ok: false,
      reason: "Clear the visit first (it must be finished and paid or billed to the HMO).",
    };
  }
  if (input.state === "all") {
    return { ok: false, reason: "Already checked." };
  }
  return { ok: true };
}

/**
 * May Headquarters approve this visit? The Branch manager must have checked
 * every line first, it must not be approved already, and (except for the
 * superuser) it must be someone other than the person who gave the Branch
 * check.
 */
export function canApproveVisitHq(input: {
  check: Pick<VisitCheck, "lines" | "checked" | "hqChecked" | "checkedByUserId">;
  actorUserId: string | null;
  isSuperuser?: boolean;
}): CanCheck {
  if (checkStateOf(input.check) !== "all") {
    return { ok: false, reason: "The Branch manager has to check it first." };
  }
  if (hqStateOf(input.check) === "all") {
    return { ok: false, reason: "Already approved by Headquarters." };
  }
  if (
    !input.isSuperuser &&
    input.actorUserId &&
    input.check.checkedByUserId &&
    input.check.checkedByUserId === input.actorUserId
  ) {
    return {
      ok: false,
      reason: "You gave the Branch manager check on this visit. Headquarters has to be someone else.",
    };
  }
  return { ok: true };
}

/** "Jan 5, 2026, 4:12 PM" in the clinic's time. */
export function formatCheckedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(iso));
}
