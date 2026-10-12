import { NextResponse } from "next/server";
import { auth } from "@/auth";
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
  const count = await countOpenVisits();
  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
