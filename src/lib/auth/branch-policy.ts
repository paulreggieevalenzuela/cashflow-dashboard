import { NO_BRANCH_MESSAGE } from "@/lib/cashflow/branch-rules";

export { NO_BRANCH_MESSAGE };

/**
 * Which clinics a person may work in.
 *
 * An owner, admin or the superuser (admin in a session) works in every clinic
 * and can pick or change the branch of a visit. A dentist or staff member
 * works in the clinics ticked for them on the Users screen: with one clinic
 * everything is saved under it and they cannot change it; with several they
 * choose among those only. A visit is never saved under a clinic they are not
 * ticked for.
 *
 * `branchId` is their home (first) clinic. A dentist or staff member with no
 * clinic cannot add visits until one is ticked.
 */
export type BranchPolicy = {
  /** True when the person picks a clinic: everyone with several, and admins. */
  canChoose: boolean;
  branchId: string | null;
  branchName: string;
  /** The clinics they may pick from; null = every clinic. */
  allowedBranchIds: string[] | null;
};

type PolicySession = {
  user: {
    id: string;
    role: string;
    branchId?: string | null;
    branchIds?: string[] | null;
  };
};

export async function getBranchPolicy(
  session: PolicySession | null | undefined,
  branchList?: ReadonlyArray<{ id: string; name: string }>,
): Promise<BranchPolicy> {
  if (!session?.user) {
    return { canChoose: false, branchId: null, branchName: "", allowedBranchIds: [] };
  }
  const isAdmin = session.user.role === "admin";
  const allowed = isAdmin ? null : (session.user.branchIds ?? []);
  // Home clinic: their own, if they are ticked for it; else the first ticked.
  const home = session.user.branchId ?? null;
  const branchId =
    allowed === null
      ? home
      : home && allowed.includes(home)
        ? home
        : (allowed[0] ?? null);
  let branchName = "";
  if (branchId) {
    if (branchList) {
      branchName = branchList.find((branch) => branch.id === branchId)?.name ?? "";
    } else {
      const { getBranchById } = await import("@/lib/db/branches");
      branchName = (await getBranchById(branchId))?.name ?? "";
    }
  }
  return {
    canChoose: isAdmin || (allowed?.length ?? 0) > 1,
    branchId,
    branchName,
    allowedBranchIds: allowed,
  };
}

/** Is this clinic one the person may work in? */
export function isBranchAllowed(
  policy: Pick<BranchPolicy, "allowedBranchIds">,
  branchId: string | null | undefined,
): boolean {
  if (!branchId) return false;
  return policy.allowedBranchIds === null || policy.allowedBranchIds.includes(branchId);
}

/**
 * Which branch's Queue to show. An admin sees every branch, or the one named
 * in the address; anyone else sees one of their own clinics (the one named
 * in the address when it is theirs, otherwise their home clinic). An account
 * with no clinic ticked sees all of them, read-only in practice because it
 * cannot add visits.
 */
export function resolveQueueBranch(input: {
  policy: BranchPolicy;
  requested: string | undefined;
  branchList: ReadonlyArray<{ id: string }>;
}): string | null {
  const known =
    input.requested && input.branchList.some((branch) => branch.id === input.requested)
      ? input.requested
      : null;
  if (input.policy.allowedBranchIds === null) {
    return known;
  }
  if (known && input.policy.allowedBranchIds.includes(known)) {
    return known;
  }
  return input.policy.branchId;
}
