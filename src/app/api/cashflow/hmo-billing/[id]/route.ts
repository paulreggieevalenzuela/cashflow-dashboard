import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/access";
import {
  billingFileName,
  buildHmoBillingSheet,
} from "@/lib/cashflow/hmo-billing";
import { buildXlsx, toCsv, XLSX_CONTENT_TYPE } from "@/lib/cashflow/xlsx";
import { listBranches } from "@/lib/db/branches";
import { resolveDayEndScope, scopeCoversBranch } from "@/lib/db/day-end";
import { getHmoBilling } from "@/lib/db/hmo-billing";

export const dynamic = "force-dynamic";

/**
 * Downloads a saved HMO billing:
 * /api/cashflow/hmo-billing/<id>?format=xlsx|csv
 * Named <billing number>_<HMO>. A person who belongs to a branch can only
 * download that branch's billings.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const saved = await getHmoBilling(id);
  if (!saved) {
    return NextResponse.json({ error: "Billing not found." }, { status: 404 });
  }
  {
    const scope = await resolveDayEndScope({
      userId: session.user.id,
      role: session.user.role,
      branchId: session.user.branchId,
      branchIds: session.user.branchIds,
      requested: saved.branchId ?? undefined,
      branchList: await listBranches(),
    });
    if (!scopeCoversBranch(scope, saved.branchId)) {
      return NextResponse.json({ error: "Billing not found." }, { status: 404 });
    }
  }

  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const sheet = buildHmoBillingSheet(saved.billing, saved.lines);
  const fileName = billingFileName(saved.billing.billingNumber, saved.billing.hmo);
  const headers = {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${fileName}.${format}"`,
  };
  if (format === "csv") {
    return new NextResponse(toCsv(sheet.rows), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  }
  return new NextResponse(Buffer.from(buildXlsx([sheet])), {
    headers: { ...headers, "Content-Type": XLSX_CONTENT_TYPE },
  });
}
