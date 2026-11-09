import { NO_BRANCH_MESSAGE } from "@/lib/cashflow/branch-rules";
import { getUserById } from "@/lib/db/users";

export { NO_BRANCH_MESSAGE };

/**
 * Who may choose a branch.
 *
 * Only an admin (the superuser counts as an admin in a session) can pick or
 * change the branch of a visit or a user. Everyone else works in the branch
 * an admin assigned to their account: new visits are saved under it, the
 * Queue shows it, and they cannot move a visit to another branch.
 *
 * `branchId` is the account's own branch for everyone (an admin may have
 * none). A staff member or dentist with no branch assigned cannot add visits
 * until an admin assigns one.
 */
export type BranchPolicy = {
  canChoose: boolean;
  branchId: string | null;
  branchName: string;
};


export async function getBranchPolicy(
  session: { user: { id: string; role: string } } | null | undefined,
  branchList?: ReadonlyArray<{ id: string; name: string }>,
): Promise<BranchPolicy> {
  if (!session?.user) {
    return { canChoose: false, branchId: null, branchName: "" };
  }
  const user = await getUserById(session.user.id);
  const branchId = user?.branchId ?? null;
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
    canChoose: session.user.role === "admin",
    branchId,
    branchName,
  };
}

/**
 * Which branch's Queue to show. An admin sees every branch, or the one named
 * in the address; anyone else sees their own branch (an account with no
 * branch assigned sees all of them, read-only in practice because it cannot
 * add visits).
 */
export function resolveQueueBranch(input: {
  policy: BranchPolicy;
  requested: string | undefined;
  branchList: ReadonlyArray<{ id: string }>;
}): string | null {
  if (input.policy.canChoose) {
    return input.requested &&
      input.branchList.some((branch) => branch.id === input.requested)
      ? input.requested
      : null;
  }
  return input.policy.branchId;
}
