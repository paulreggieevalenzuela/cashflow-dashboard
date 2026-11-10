"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Who may choose a branch (see `src/lib/auth/branch-policy.ts`). The Cashflow
 * layout provides it once so the visit form, wherever it opens, shows the
 * branch dropdown to admins only. This is only the screen: the server
 * actions enforce the same rule.
 */
export type BranchPolicyValue = {
  canChoose: boolean;
  branchId: string | null;
  branchName: string;
  /** The clinics they may pick from; null = every clinic. */
  allowedBranchIds: string[] | null;
};

const BranchPolicyContext = createContext<BranchPolicyValue>({
  canChoose: true,
  branchId: null,
  branchName: "",
  allowedBranchIds: null,
});

export function BranchPolicyProvider({
  value,
  children,
}: {
  value: BranchPolicyValue;
  children: ReactNode;
}) {
  return (
    <BranchPolicyContext.Provider value={value}>
      {children}
    </BranchPolicyContext.Provider>
  );
}

export function useBranchPolicy(): BranchPolicyValue {
  return useContext(BranchPolicyContext);
}
