import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  buildCommissionCsvRows,
  buildCommissionDetailSheet,
  buildCommissionSummarySheet,
  commissionFileName,
  parseCommissionFilters,
} from "@/lib/cashflow/commission-report";
import { buildXlsx, toCsv, XLSX_CONTENT_TYPE } from "@/lib/cashflow/xlsx";
import { todayInManila } from "@/lib/cashflow/visit-status";
import { listBranches } from "@/lib/db/branches";
import { getCommissionReport } from "@/lib/db/commission-report";
import { listDentistUsers } from "@/lib/db/dentists";

export const dynamic = "force-dynamic";

/**
 * Downloads the dentist commission report (admin only):
 * /api/cashflow/commissions/report?from=&to=&branch=&dentist=&format=xlsx|csv
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const params = request.nextUrl.searchParams;
  const [branchList, dentistList] = await Promise.all([
    listBranches(),
    listDentistUsers(),
  ]);
  const filters = parseCommissionFilters(
    {
      from: params.get("from"),
      to: params.get("to"),
      branch: params.get("branch"),
      dentist: params.get("dentist"),
    },
    { today: todayInManila(), branches: branchList, dentists: dentistList },
  );
  const report = await getCommissionReport(filters);
  const format = params.get("format") === "csv" ? "csv" : "xlsx";
  const fileName = commissionFileName(filters.from, filters.to);
  const headers = {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${fileName}.${format}"`,
  };
  if (format === "csv") {
    return new NextResponse(toCsv(buildCommissionCsvRows(report)), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  }
  return new NextResponse(
    Buffer.from(
      buildXlsx([
        buildCommissionSummarySheet(report),
        buildCommissionDetailSheet(report),
      ]),
    ),
    { headers: { ...headers, "Content-Type": XLSX_CONTENT_TYPE } },
  );
}
