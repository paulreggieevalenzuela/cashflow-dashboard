import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/access";
import { getBranchPolicy } from "@/lib/auth/branch-policy";
import { countOpenVisits } from "@/lib/db/visit-status";

export const dynamic = "force-dynamic";

/**
 * How many visits are not Cleared yet — the number beside "Queue" in the
 * menu. A plain GET (not a server action) on purpose: server actions are
 * run one at a time and a page navigation waits behind them, so a slow poll
 * could make a click on another menu item hang.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The count is for the branch assigned to this account (every branch only
  // when the account has none), whatever the Queue page is filtered to.
  const policy = await getBranchPolicy(session);
  const count = await countOpenVisits(policy.branchId);
  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
