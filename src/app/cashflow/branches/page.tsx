import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BranchesManager } from "@/components/cashflow/branches-manager";
import { listBranches } from "@/lib/db/branches";

export const metadata: Metadata = {
  title: "Branches",
};

export default async function BranchesPage() {
  const session = await auth();

  if (session?.user.role !== "admin") {
    redirect("/cashflow");
  }

  const branches = await listBranches();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Branches</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Manage the clinic&apos;s locations. Assign staff and transactions to
          a branch to break performance and collections down per location.
        </p>
      </div>
      <BranchesManager branches={branches} />
    </div>
  );
}
